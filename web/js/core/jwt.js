/**
 * Разбор JWT на клиенте.
 *
 * ВАЖНО: подпись здесь не проверяется и проверяться не может — это делает
 * gateway и каждый сервис. Клиент читает claims только для UX: показать роли,
 * спрятать недоступные действия и вовремя обновить токен. Любая реальная
 * авторизация остаётся на бэкенде.
 */

const encoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

/**
 * Декодирует base64url в строку UTF-8.
 *
 * @param {string} input значение из JWT (без padding)
 * @returns {string}
 */
export function decodeBase64Url(input) {
    const normalized = String(input).replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return encoder ? encoder.decode(bytes) : binary;
}

/**
 * Декодирует JWT в header/payload.
 *
 * @param {string} token
 * @returns {{header: object, payload: object, signature: string}|null} null, если токен не JWT
 */
export function decodeJwt(token) {
    if (typeof token !== 'string') {
        return null;
    }
    const parts = token.split('.');
    if (parts.length !== 3) {
        return null;
    }
    try {
        return {
            header: JSON.parse(decodeBase64Url(parts[0])),
            payload: JSON.parse(decodeBase64Url(parts[1])),
            signature: parts[2],
        };
    } catch {
        return null;
    }
}

/**
 * Роли из claim `roles`. Приводит к верхнему регистру и убирает дубликаты:
 * auth-service пишет их как есть, а сравнивать удобнее в одном регистре.
 *
 * @param {object|null|undefined} payload
 * @returns {string[]}
 */
export function tokenRoles(payload) {
    const raw = payload?.roles;
    const list = Array.isArray(raw)
        ? raw
        : typeof raw === 'string'
            ? raw.split(/[,\s]+/)
            : [];
    return [...new Set(list
        .filter((role) => typeof role === 'string' && role.trim() !== '')
        .map((role) => role.trim().toUpperCase()))];
}

/**
 * Момент истечения access-токена в миллисекундах (claim `exp` в секундах).
 *
 * @param {object|null|undefined} payload
 * @returns {number|null}
 */
export function tokenExpiresAt(payload) {
    const exp = Number(payload?.exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
}

/**
 * @param {object|null|undefined} payload
 * @param {{now?: number, skewMs?: number}} [options] skewMs — запас до истечения
 * @returns {boolean} true, если токена нет или он истёк/истечёт в пределах skewMs
 */
export function isExpired(payload, { now = Date.now(), skewMs = 0 } = {}) {
    const expiresAt = tokenExpiresAt(payload);
    return expiresAt === null || expiresAt - skewMs <= now;
}
