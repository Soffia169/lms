/**
 * Ошибки API в терминах RFC 9457 (application/problem+json).
 *
 * Бэкенд отвечает `{ title, status, detail, errors? }` (см. common-web
 * GlobalExceptionHandler), сетевые сбои приходят без тела. Оба случая
 * приводятся к одному типу, чтобы представления не разбирали ответы вручную.
 */

/** Сетевой сбой: fetch не получил ответа (сервер не запущен, таймаут, CORS). */
export const NETWORK_STATUS = 0;

/**
 * Ошибка вызова API.
 */
export class ApiError extends Error {
    /**
     * @param {object} init
     * @param {number} [init.status] HTTP-статус или NETWORK_STATUS
     * @param {string} [init.title]
     * @param {string} [init.detail]
     * @param {Record<string, string>} [init.errors] ошибки валидации по полям DTO
     * @param {string} [init.url]
     * @param {unknown} [init.cause]
     */
    constructor({ status = NETWORK_STATUS, title = '', detail = '', errors = null, url = '', cause = undefined } = {}) {
        const message = detail || title || 'Ошибка запроса';
        super(message, cause === undefined ? undefined : { cause });
        this.name = 'ApiError';
        this.status = status;
        this.title = title;
        this.detail = detail || title;
        this.errors = errors ?? null;
        this.url = url;
    }

    get isNetwork() { return this.status === NETWORK_STATUS; }
    get isValidation() { return this.status === 400 && !!this.errors; }
    get isUnauthorized() { return this.status === 401; }
    get isForbidden() { return this.status === 403; }
    get isNotFound() { return this.status === 404; }
    get isConflict() { return this.status === 409; }
    get isServer() { return this.status >= 500; }
}

/**
 * Ответ похож на problem+json.
 *
 * @param {unknown} body
 * @returns {boolean}
 */
export function isProblem(body) {
    return !!body && typeof body === 'object' && ('title' in body || 'detail' in body);
}

/**
 * Приводит HTTP-ответ (или сетевой сбой) к {@link ApiError}.
 *
 * @param {object} init
 * @param {number} init.status
 * @param {unknown} [init.body] уже распарсенный JSON, если он был
 * @param {string} [init.text] сырое тело — фолбэк для не-JSON ошибок
 * @param {string} [init.url]
 * @param {unknown} [init.cause]
 * @returns {ApiError}
 */
export function toApiError({ status, body, text = '', url = '', cause = undefined }) {
    if (!isProblem(body)) {
        const fallback = typeof text === 'string' && text.trim() !== '' && text.length < 400
            ? text.trim()
            : '';
        return new ApiError({
            status,
            title: fallback ? '' : defaultTitle(status),
            detail: fallback || defaultTitle(status),
            url,
            cause,
        });
    }

    const errors = body.errors && typeof body.errors === 'object' && !Array.isArray(body.errors)
        ? Object.fromEntries(Object.entries(body.errors).map(([field, message]) => [field, String(message)]))
        : null;

    return new ApiError({
        status,
        title: typeof body.title === 'string' ? body.title : defaultTitle(status),
        detail: typeof body.detail === 'string' ? body.detail : '',
        errors,
        url,
        cause,
    });
}

/**
 * Ошибка сети/таймаута (fetch бросил исключение).
 *
 * @param {unknown} cause
 * @param {string} [url]
 * @returns {ApiError}
 */
export function networkError(cause, url = '') {
    const timeout = cause?.name === 'AbortError' ? 'Превышено время ожидания ответа' : '';
    return new ApiError({
        status: NETWORK_STATUS,
        title: 'Сервер недоступен',
        detail: timeout || 'Не удалось связаться с API. Проверьте, что стек запущен (docker compose up).',
        url,
        cause,
    });
}

/**
 * Ошибки валидации по полям формы.
 *
 * @param {unknown} error
 * @returns {Record<string, string>}
 */
export function fieldErrorsOf(error) {
    return error instanceof ApiError && error.errors ? error.errors : {};
}

/**
 * Человеческое описание ошибки для UI (русский, без технического шума).
 *
 * @param {unknown} error
 * @returns {string}
 */
export function describeError(error) {
    if (!(error instanceof ApiError)) {
        return error instanceof Error && error.message
            ? error.message
            : 'Неизвестная ошибка';
    }

    switch (true) {
        case error.isNetwork:
            return error.detail;
        case error.status === 400 && !!error.errors: {
            const fields = Object.entries(error.errors)
                .map(([field, message]) => `${field}: ${message}`)
                .join('; ');
            return fields || error.detail;
        }
        case error.isUnauthorized:
            return 'Требуется вход: сессия истекла или токен недействителен.';
        case error.isForbidden:
            return `Недостаточно прав${error.detail ? `: ${error.detail}` : '.'}`;
        case error.isNotFound:
            return `Ресурс не найден${error.detail ? `: ${error.detail}` : '.'}`;
        case error.isConflict:
            return `Конфликт${error.detail ? `: ${error.detail}` : '.'}`;
        case error.isServer:
            return `Ошибка сервера (${error.status})${error.detail ? `: ${error.detail}` : '.'}`;
        default:
            return error.detail || `Ошибка запроса (${error.status})`;
    }
}

/**
 * Короткая подсказка, что делать с ошибкой.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function hintForError(error) {
    if (error instanceof ApiError) {
        if (error.isNetwork) {
            return 'Проверьте адрес API в настройках (docs/UI.md) и состояние контейнеров.';
        }
        if (error.isUnauthorized) {
            return 'Войдите заново — refresh-токен мог быть отозван.';
        }
        if (error.isForbidden) {
            return 'Действие доступно инструктору-владельцу курса или администратору.';
        }
        if (error.isValidation) {
            return 'Исправьте выделенные поля и отправьте форму ещё раз.';
        }
    }
    return '';
}

function defaultTitle(status) {
    const titles = {
        400: 'Некорректный запрос',
        401: 'Не авторизован',
        403: 'Доступ запрещён',
        404: 'Не найдено',
        409: 'Конфликт',
        500: 'Внутренняя ошибка сервера',
        502: 'Шлюз недоступен',
        503: 'Сервис недоступен',
        504: 'Шлюз не ответил вовремя',
    };
    return titles[status] ?? `Ошибка ${status}`;
}
