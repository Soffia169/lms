/**
 * Настройки клиента: адрес API.
 *
 * По умолчанию SPA и API — один origin (`/api`): так работает nginx-контейнер
 * из infra/docker-compose.yml. Для режима разработки адрес можно переопределить
 * (порядок приоритета):
 *   1. `?api=http://localhost:8080/api` в URL,
 *   2. `localStorage['lms.apiBase']` (диалог «Настройки API»),
 *   3. `window.__LMS_CONFIG__.apiBase` (инъекция на этапе деплоя),
 *   4. `/api`.
 */

export const API_BASE_STORAGE_KEY = 'lms.apiBase';
export const DEFAULT_API_BASE = '/api';

/**
 * Нормализует адрес API: убирает хвостовые слэши, добавляет `/api`,
 * если указан только origin (`http://localhost:8080` → `.../api`).
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeApiBase(value) {
    const raw = String(value ?? '').trim();
    if (raw === '') {
        return DEFAULT_API_BASE;
    }
    const withoutTrailing = raw.replace(/\/+$/, '');
    if (/^https?:\/\/[^/]+$/i.test(withoutTrailing)) {
        return `${withoutTrailing}/api`;
    }
    return withoutTrailing.startsWith('/') || /^https?:\/\//i.test(withoutTrailing)
        ? withoutTrailing
        : `/${withoutTrailing}`;
}

/**
 * Определяет адрес API по приоритетам выше.
 *
 * @param {object} [options]
 * @param {string} [options.search] строка query текущего URL
 * @param {Storage} [options.storage]
 * @param {object} [options.config] window.__LMS_CONFIG__
 * @returns {string}
 */
export function resolveApiBase({
    search = globalThis.location?.search ?? '',
    storage = globalThis.localStorage,
    config = globalThis.__LMS_CONFIG__,
} = {}) {
    let fromQuery = null;
    try {
        fromQuery = new URLSearchParams(search).get('api');
    } catch {
        fromQuery = null;
    }
    if (fromQuery) {
        return normalizeApiBase(fromQuery);
    }

    try {
        const stored = storage?.getItem(API_BASE_STORAGE_KEY);
        if (stored) {
            return normalizeApiBase(stored);
        }
    } catch {
        // storage может быть недоступен (приватный режим) — идём дальше.
    }

    if (config?.apiBase) {
        return normalizeApiBase(config.apiBase);
    }

    return DEFAULT_API_BASE;
}

/**
 * Сохраняет адрес API, выбранный в настройках.
 *
 * @param {string} base
 * @param {Storage} [storage]
 * @returns {string} нормализованный адрес
 */
export function setApiBase(base, storage = globalThis.localStorage) {
    const normalized = normalizeApiBase(base);
    try {
        storage?.setItem(API_BASE_STORAGE_KEY, normalized);
    } catch {
        // Не критично: адрес будет действовать только до перезагрузки.
    }
    return normalized;
}

/**
 * Сбрасывает адрес API к значению по умолчанию.
 *
 * @param {Storage} [storage]
 * @returns {string}
 */
export function resetApiBase(storage = globalThis.localStorage) {
    try {
        storage?.removeItem(API_BASE_STORAGE_KEY);
    } catch {
        // см. setApiBase
    }
    return DEFAULT_API_BASE;
}

/**
 * Адрес API абсолютный (а не относительный `/api`).
 *
 * @param {string} base
 * @returns {boolean}
 */
export function isAbsoluteApiBase(base) {
    return /^https?:\/\//i.test(String(base ?? ''));
}

/**
 * Адрес Swagger UI auth-service.
 *
 * Порты 8081/8082 опубликованы только в локальной инфраструктуре (README,
 * этап 1), поэтому для локального gateway подставляем 8081, а для внешнего
 * хоста оставляем тот же origin — ссылка останется справочной.
 *
 * @param {string} base
 * @returns {string}
 */
export function swaggerAuthUrl(base = DEFAULT_API_BASE) {
    if (!isAbsoluteApiBase(base)) {
        return 'http://localhost:8081/swagger-ui.html';
    }
    try {
        const url = new URL(base);
        if (url.port || isLocalHost(url.hostname)) {
            url.port = '8081';
        }
        url.pathname = '/swagger-ui.html';
        url.search = '';
        url.hash = '';
        return url.toString();
    } catch {
        return 'http://localhost:8081/swagger-ui.html';
    }
}

function isLocalHost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
