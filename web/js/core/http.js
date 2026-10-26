/**
 * Тонкий слой над fetch: один формат результата и один тип ошибки.
 *
 * Задача модуля — транспорт. Авторизация, refresh и повторные попытки живут
 * в client.js, поэтому этот файл тривиально тестируется с подменённым fetch.
 */

import { networkError, toApiError } from './errors.js';

export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Выполняет HTTP-запрос.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} [options.method]
 * @param {unknown} [options.body] сериализуется в JSON, если не undefined
 * @param {string} [options.token] access-токен
 * @param {Record<string,string>} [options.headers]
 * @param {number} [options.timeoutMs]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {AbortSignal} [options.signal] внешняя отмена (например, уход со страницы)
 * @returns {Promise<{status: number, data: unknown, headers: Headers}>}
 * @throws {import('./errors.js').ApiError}
 */
export async function httpRequest(url, {
    method = 'GET',
    body = undefined,
    token = null,
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
    signal = undefined,
} = {}) {
    if (typeof fetchImpl !== 'function') {
        throw new Error('fetch недоступен в этом окружении');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const externalAbort = () => controller.abort();
    if (signal) {
        if (signal.aborted) {
            controller.abort();
        } else {
            signal.addEventListener('abort', externalAbort, { once: true });
        }
    }

    const requestHeaders = { Accept: 'application/json', ...headers };
    if (token) {
        requestHeaders.Authorization = `Bearer ${token}`;
    }
    let payload;
    if (body !== undefined) {
        requestHeaders['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }

    let response;
    try {
        response = await fetchImpl(url, {
            method,
            headers: requestHeaders,
            body: payload,
            signal: controller.signal,
        });
    } catch (error) {
        // Отмена страницей — не ошибка транспорта: пробрасываем как есть,
        // чтобы роутер мог молча проигнорировать результат.
        if (signal?.aborted) {
            throw error;
        }
        throw networkError(error, url);
    } finally {
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', externalAbort);
    }

    const text = response.status === 204 ? '' : await response.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = null;
        }
    }

    if (!response.ok) {
        throw toApiError({ status: response.status, body: data, text, url });
    }

    return { status: response.status, data, headers: response.headers };
}
