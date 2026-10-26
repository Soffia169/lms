/**
 * Общие помощники тестов: JWT, storage и fetch-заглушки.
 *
 * Тесты запускаются `node --test` без зависимостей — это осознанно: UI
 * не тянет npm-пакеты, значит и тестовый стенд не должен.
 */

/**
 * @param {unknown} value
 * @returns {string} base64url от JSON
 */
export function base64UrlEncode(value) {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/**
 * Создаёт подписанный «как бы» JWT: подпись не проверяется на клиенте.
 *
 * @param {object} payload
 * @param {object} [header]
 * @returns {string}
 */
export function makeJwt(payload, header = { alg: 'RS256', kid: 'test' }) {
    return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.fake-signature`;
}

/**
 * @param {object} [overrides]
 * @returns {string}
 */
export function validAccessToken(overrides = {}) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return makeJwt({
        iss: 'lms-auth',
        sub: '11111111-1111-1111-1111-111111111111',
        exp: nowSeconds + 900,
        iat: nowSeconds,
        email: 'instructor@lms.local',
        roles: ['INSTRUCTOR'],
        ...overrides,
    });
}

/**
 * In-memory реализация Storage.
 *
 * @param {Record<string, string>} [initial]
 * @returns {Storage & {_map: Map<string, string>}}
 */
export function memoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        _map: map,
        get length() {
            return map.size;
        },
        clear: () => map.clear(),
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        key: (index) => [...map.keys()][index] ?? null,
        removeItem: (key) => {
            map.delete(key);
        },
        setItem: (key, value) => {
            map.set(key, String(value));
        },
    };
}

/**
 * Минимальный Response-совместимый объект для переданного fetchImpl.
 *
 * @param {number} status
 * @param {unknown} [body]
 * @param {Record<string, string>} [headers]
 * @returns {{ok: boolean, status: number, headers: Headers, text: () => Promise<string>}}
 */
export function jsonResponse(status, body = undefined, headers = { 'content-type': 'application/json' }) {
    const text = body === undefined || status === 204 ? '' : JSON.stringify(body);
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers(headers),
        text: async () => text,
    };
}

/**
 * fetch, отвечающий по сценарию: массив обработчиков или строка HTML.
 *
 * @param {Array<(url: string, init: object) => object>} handlers
 * @returns {((url: string, init: object) => Promise<object>) & {calls: Array<{url: string, init: object}>}}
 */
export function scriptedFetch(handlers) {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
        calls.push({ url, init });
        const handler = handlers[Math.min(calls.length - 1, handlers.length - 1)];
        if (!handler) {
            throw new Error('Нет обработчика для запроса');
        }
        return handler(url, init);
    };
    fetchImpl.calls = calls;
    return fetchImpl;
}

/**
 * Задержка для имитации параллельных запросов.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
