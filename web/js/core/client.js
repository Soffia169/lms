/**
 * Авторизованный API-клиент.
 *
 * Отвечает за то, что в представлениях не должно быть ни одной строки про
 * токены:
 *   - подставляет `Authorization: Bearer …`;
 *   - заранее обновляет access-токен, если до истечения меньше refreshSkewMs;
 *   - при 401 один раз обновляет пару и повторяет исходный запрос;
 *   - делает refresh «single-flight»: параллельные запросы не отправляют
 *     несколько refresh подряд. Это критично, потому что auth-service считает
 *     повторное предъявление отозванного refresh-токена атакой и гасит все
 *     сессии пользователя (README, «Аутентификация»).
 *   - согласует refresh между вкладками: Web Locks + сравнение actual-токена
 *     в localStorage.
 */

import { ApiError } from './errors.js';
import { httpRequest } from './http.js';

const LOCK_NAME = 'lms-token-refresh';

/**
 * Склеивает базовый адрес, путь и query-параметры.
 *
 * @param {string} base
 * @param {string} path
 * @param {Record<string, unknown>|null} [query]
 * @returns {string}
 */
export function buildUrl(base, path, query = null) {
    const normalizedBase = String(base ?? '').replace(/\/+$/, '');
    const normalizedPath = String(path ?? '').startsWith('/') ? String(path) : `/${path}`;
    let url = `${normalizedBase}${normalizedPath}`;
    if (query) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null || value === '') {
                continue;
            }
            params.set(key, String(value));
        }
        const search = params.toString();
        if (search) {
            url += `?${search}`;
        }
    }
    return url;
}

/**
 * @param {object} options
 * @param {string|(() => string)} options.baseUrl
 * @param {object} options.session store из core/session.js
 * @param {(refreshToken: string) => Promise<{accessToken: string, refreshToken: string}>} options.refreshSession
 * @param {(error: unknown) => void} [options.onSessionExpired]
 * @param {typeof httpRequest} [options.http]
 * @param {() => number} [options.now]
 * @returns {object} клиент
 */
export function createApiClient({
    baseUrl,
    session,
    refreshSession,
    onSessionExpired = () => {},
    http = httpRequest,
    now = () => Date.now(),
} = {}) {
    let refreshInFlight = null;
    let expiredNotified = false;

    function currentBase() {
        return typeof baseUrl === 'function' ? baseUrl() : baseUrl;
    }

    function url(path, query = null) {
        return buildUrl(currentBase(), path, query);
    }

    function unauthorized(detail) {
        return new ApiError({ status: 401, title: 'Не авторизован', detail });
    }

    function notifyExpired(error) {
        if (expiredNotified) {
            return;
        }
        expiredNotified = true;
        session.clear('expired');
        onSessionExpired(error);
    }

    /**
     * Обновляет пару токенов и сохраняет её. Повторные вызовы разделяют одно
     * сетевое обращение.
     *
     * @param {string|null} staleAccessToken токен, с которым пришёл 401
     * @returns {Promise<string>} актуальный access-токен
     */
    function refreshAccessToken(staleAccessToken = null) {
        if (refreshInFlight) {
            return refreshInFlight;
        }
        const task = (async () => {
            try {
                return await withRefreshLock(() => rotate(staleAccessToken));
            } finally {
                refreshInFlight = null;
            }
        })();
        refreshInFlight = task;
        return task;
    }

    async function rotate(staleAccessToken) {
        // Читаем storage уже под локом: другая вкладка могла успеть обновить пару.
        const current = session.get();
        if (!current) {
            const error = unauthorized('Нет активной сессии');
            notifyExpired(error);
            throw error;
        }

        if (staleAccessToken && current.accessToken !== staleAccessToken) {
            const left = session.msUntilExpiry();
            if (left === null || left > 5_000) {
                expiredNotified = false;
                return current.accessToken;
            }
        }

        let tokens;
        try {
            tokens = await refreshSession(current.refreshToken);
        } catch (error) {
            notifyExpired(error);
            throw error instanceof ApiError
                ? error
                : unauthorized('Не удалось обновить сессию');
        }

        if (!tokens?.accessToken || !tokens?.refreshToken) {
            const error = unauthorized('Сервер вернул неполную пару токенов');
            notifyExpired(error);
            throw error;
        }

        expiredNotified = false;
        session.save({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: current.user,
        });
        return tokens.accessToken;
    }

    async function withRefreshLock(action) {
        const locks = globalThis.navigator?.locks;
        if (locks?.request) {
            try {
                return await locks.request(LOCK_NAME, action);
            } catch (error) {
                // Web Locks есть, но недоступны (например, insecure context) —
                // single-flight внутри вкладки всё равно работает.
                if (error?.name === 'SecurityError' || error?.name === 'NotSupportedError') {
                    return action();
                }
                throw error;
            }
        }
        return action();
    }

    async function request(method, path, { body, query = null, auth = true, retry = true } = {}) {
        const target = url(path, query);

        if (!auth) {
            const response = await http(target, { method, body });
            return response.data;
        }

        const snapshot = session.get();
        if (!snapshot) {
            throw unauthorized('Нет активной сессии');
        }

        let token = snapshot.accessToken;
        if (session.isExpiringSoon(0)) {
            token = await refreshAccessToken(token);
        }

        try {
            const response = await http(target, { method, body, token });
            return response.data;
        } catch (error) {
            if (error?.status !== 401) {
                throw error;
            }
            if (!retry || !session.get()) {
                notifyExpired(error);
                throw error;
            }
            const freshToken = await refreshAccessToken(token);
            const response = await http(target, { method, body, token: freshToken });
            return response.data;
        }
    }

    /**
     * Проверка доступности API без токена (публичный JWK-endpoint auth-service).
     *
     * @returns {Promise<{ok: boolean, latencyMs: number|null, error: unknown}>}
     */
    async function ping() {
        const startedAt = now();
        try {
            await http(url('/auth/.well-known/jwks.json'), { timeoutMs: 4_000 });
            return { ok: true, latencyMs: now() - startedAt, error: null };
        } catch (error) {
            return { ok: false, latencyMs: null, error };
        }
    }

    return {
        url,
        buildUrl,
        request,
        ping,
        refreshAccessToken,
        get: (path, options) => request('GET', path, options),
        post: (path, options) => request('POST', path, options),
        put: (path, options) => request('PUT', path, options),
        patch: (path, options) => request('PATCH', path, options),
        del: (path, options) => request('DELETE', path, options),
    };
}
