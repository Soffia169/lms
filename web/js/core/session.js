/**
 * Клиентская сессия: пара токенов + профиль пользователя.
 *
 * Хранение — localStorage: обновление страницы и перезагрузка вкладки не
 * разлогинивают пользователя. Refresh-токен здесь лежит в открытом виде,
 * это осознанный компромисс локальной демо-платформы; в проде для него нужен
 * httpOnly-cookie на бэкенде (см. docs/UI.md, «Ограничения»).
 *
 * Store намеренно читает storage при каждом обращении: так вкладки видят
 * ротацию refresh-токена друг друга и не «гасят» сессию повторным refresh.
 */

import { decodeJwt, tokenExpiresAt, tokenRoles } from './jwt.js';

export const SESSION_STORAGE_KEY = 'lms.session.v1';

/** Запас до истечения access-токена, при котором обновляем его заранее. */
export const DEFAULT_REFRESH_SKEW_MS = 30_000;

/**
 * Приводит произвольные данные из storage к валидной сессии.
 *
 * @param {unknown} raw
 * @returns {{accessToken: string, refreshToken: string, expiresAt: number|null, savedAt: number, user: object|null, tokenRoles: string[]}|null}
 */
export function normalizeSession(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const accessToken = typeof raw.accessToken === 'string' ? raw.accessToken : '';
    const refreshToken = typeof raw.refreshToken === 'string' ? raw.refreshToken : '';
    if (!accessToken || !refreshToken) {
        return null;
    }
    const payload = decodeJwt(accessToken)?.payload ?? null;
    const user = raw.user && typeof raw.user === 'object' ? raw.user : null;
    return {
        accessToken,
        refreshToken,
        expiresAt: tokenExpiresAt(payload) ?? (Number.isFinite(raw.expiresAt) ? Number(raw.expiresAt) : null),
        savedAt: Number.isFinite(raw.savedAt) ? Number(raw.savedAt) : Date.now(),
        user,
        tokenRoles: tokenRoles(payload),
    };
}

/**
 * Собирает объект для записи в storage из ответа /auth/login|refresh и профиля.
 *
 * @param {object} init
 * @param {string} init.accessToken
 * @param {string} init.refreshToken
 * @param {object|null} [init.user]
 * @param {number} [init.savedAt]
 * @returns {object}
 */
export function buildSession({ accessToken, refreshToken, user = null, savedAt = Date.now() }) {
    const payload = decodeJwt(accessToken)?.payload ?? null;
    return {
        accessToken,
        refreshToken,
        expiresAt: tokenExpiresAt(payload),
        savedAt,
        user,
        tokenRoles: tokenRoles(payload),
    };
}

/**
 * Создаёт хранилище сессии.
 *
 * @param {object} [options]
 * @param {Storage} [options.storage] по умолчанию localStorage
 * @param {() => number} [options.now]
 * @param {number} [options.refreshSkewMs]
 * @returns {object} store
 */
export function createSessionStore({
    storage = globalThis.localStorage,
    now = () => Date.now(),
    refreshSkewMs = DEFAULT_REFRESH_SKEW_MS,
} = {}) {
    const listeners = new Set();
    let cachedRaw = null;
    let cachedSession = null;

    function readRaw() {
        try {
            return storage?.getItem(SESSION_STORAGE_KEY) ?? null;
        } catch {
            return null;
        }
    }

    function writeRaw(value) {
        try {
            if (value === null) {
                storage?.removeItem(SESSION_STORAGE_KEY);
            } else {
                storage?.setItem(SESSION_STORAGE_KEY, value);
            }
        } catch {
            // Приватный режим/переполнение квоты: сессия проживёт до перезагрузки страницы.
        }
    }

    function emit(session, reason) {
        for (const listener of [...listeners]) {
            try {
                listener(session, reason);
            } catch (error) {
                console.error('[session] listener failed', error);
            }
        }
    }

    function get() {
        const raw = readRaw();
        if (raw === cachedRaw) {
            return cachedSession;
        }
        cachedRaw = raw;
        if (!raw) {
            cachedSession = null;
            return null;
        }
        try {
            cachedSession = normalizeSession(JSON.parse(raw));
        } catch {
            cachedSession = null;
            writeRaw(null);
        }
        return cachedSession;
    }

    function save({ accessToken, refreshToken, user }) {
        const next = buildSession({
            accessToken,
            refreshToken,
            user: user ?? get()?.user ?? null,
            savedAt: now(),
        });
        cachedRaw = JSON.stringify(next);
        cachedSession = next;
        writeRaw(cachedRaw);
        emit(next, 'save');
        return next;
    }

    /**
     * Сохраняет уточнённый профиль (ответ /auth/me), не трогая токены.
     *
     * @param {object|null} user
     * @returns {object|null}
     */
    function updateUser(user) {
        const current = get();
        if (!current) {
            return null;
        }
        const next = { ...current, user };
        cachedSession = next;
        cachedRaw = JSON.stringify(next);
        writeRaw(cachedRaw);
        emit(next, 'user');
        return next;
    }

    function clear(reason = 'clear') {
        cachedRaw = null;
        cachedSession = null;
        writeRaw(null);
        emit(null, reason);
    }

    function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    /**
     * Реакция на изменение storage другой вкладкой.
     *
     * @param {{key?: string|null}} event
     * @returns {boolean} true, если изменилась именно сессия
     */
    function handleStorageEvent(event) {
        if (event?.key && event.key !== SESSION_STORAGE_KEY) {
            return false;
        }
        const previous = cachedSession;
        cachedRaw = undefined; // сбрасываем кэш — get() перечитает storage
        const next = get();
        emit(next, 'storage');
        return previous?.accessToken !== next?.accessToken
            || previous?.refreshToken !== next?.refreshToken;
    }

    function accessToken() {
        return get()?.accessToken ?? null;
    }

    function refreshToken() {
        return get()?.refreshToken ?? null;
    }

    function user() {
        return get()?.user ?? null;
    }

    function roles() {
        const session = get();
        if (!session) {
            return [];
        }
        const fromUser = session.user?.role ? [String(session.user.role).toUpperCase()] : [];
        return [...new Set([...session.tokenRoles, ...fromUser])];
    }

    function hasRole(...required) {
        const current = roles();
        return required.flat().some((role) => current.includes(String(role).toUpperCase()));
    }

    function isAdmin() {
        return hasRole('ADMIN');
    }

    function canAuthorCourses() {
        return hasRole('ADMIN', 'INSTRUCTOR');
    }

    function isAuthenticated() {
        return get() !== null;
    }

    function msUntilExpiry() {
        const session = get();
        if (!session?.expiresAt) {
            return null;
        }
        return session.expiresAt - now();
    }

    function isExpiringSoon(skewMs = refreshSkewMs) {
        const left = msUntilExpiry();
        return left === null || left <= skewMs;
    }

    return {
        storageKey: SESSION_STORAGE_KEY,
        get,
        save,
        updateUser,
        clear,
        subscribe,
        handleStorageEvent,
        accessToken,
        refreshToken,
        user,
        roles,
        hasRole,
        isAdmin,
        canAuthorCourses,
        isAuthenticated,
        msUntilExpiry,
        isExpiringSoon,
        refreshSkewMs,
    };
}

/**
 * Проверяет, что пользователь может управлять курсом (владелец или ADMIN).
 * Повторяет правило бэкенда CourseAccessGuard — для скрытия кнопок в UI.
 *
 * @param {object|null} user
 * @param {{instructorId: string}} course
 * @param {boolean} admin
 * @returns {boolean}
 */
export function canManageCourse(user, course, admin) {
    if (!course) {
        return false;
    }
    if (admin) {
        return true;
    }
    return !!user?.id && String(user.id) === String(course.instructorId);
}
