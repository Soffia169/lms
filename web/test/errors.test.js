import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ApiError,
    NETWORK_STATUS,
    describeError,
    fieldErrorsOf,
    hintForError,
    isProblem,
    networkError,
    toApiError,
} from '../js/core/errors.js';

test('ApiError определяет категории по статусу', () => {
    assert.equal(new ApiError({ status: 400, errors: { title: 'x' } }).isValidation, true);
    assert.equal(new ApiError({ status: 400 }).isValidation, false);
    assert.equal(new ApiError({ status: 401 }).isUnauthorized, true);
    assert.equal(new ApiError({ status: 403 }).isForbidden, true);
    assert.equal(new ApiError({ status: 404 }).isNotFound, true);
    assert.equal(new ApiError({ status: 409 }).isConflict, true);
    assert.equal(new ApiError({ status: 503 }).isServer, true);
    assert.equal(new ApiError({ status: NETWORK_STATUS }).isNetwork, true);
});

test('isProblem отличает problem+json от произвольного тела', () => {
    assert.equal(isProblem({ title: 'Not Found', status: 404 }), true);
    assert.equal(isProblem({ detail: 'нет такого курса' }), true);
    assert.equal(isProblem({ message: 'ok' }), false);
    assert.equal(isProblem(null), false);
    assert.equal(isProblem('строка'), false);
});

test('toApiError разбирает problem+json с ошибками полей', () => {
    const error = toApiError({
        status: 400,
        body: {
            title: 'Validation Failed',
            status: 400,
            detail: 'Request contains invalid fields',
            errors: { title: 'не должно быть пустым', description: 42 },
        },
    });

    assert.equal(error.status, 400);
    assert.equal(error.title, 'Validation Failed');
    assert.equal(error.detail, 'Request contains invalid fields');
    assert.deepEqual(error.errors, { title: 'не должно быть пустым', description: '42' });
    assert.equal(error.isValidation, true);
});

test('toApiError использует текст, если тело не JSON', () => {
    const error = toApiError({ status: 500, body: null, text: 'Internal Server Error' });
    assert.equal(error.status, 500);
    assert.equal(error.detail, 'Internal Server Error');
    assert.equal(error.errors, null);
});

test('toApiError подставляет заголовок по статусу', () => {
    const error = toApiError({ status: 502, body: null, text: '' });
    assert.equal(error.title, 'Шлюз недоступен');
    assert.equal(error.detail, 'Шлюз недоступен');
});

test('networkError объясняет, что случилось с соединением', () => {
    const aborted = networkError(Object.assign(new Error('aborted'), { name: 'AbortError' }), '/api/courses');
    assert.equal(aborted.isNetwork, true);
    assert.match(aborted.detail, /время ожидания/);

    const offline = networkError(new TypeError('Failed to fetch'));
    assert.match(offline.detail, /Сервер недоступен|связаться с API/);
});

test('describeError даёт человеческий текст для каждого статуса', () => {
    assert.match(describeError(new ApiError({ status: 401 })), /Требуется вход/);
    assert.match(describeError(new ApiError({ status: 403, detail: 'владелец' })), /Недостаточно прав: владелец/);
    assert.match(describeError(new ApiError({ status: 404, detail: 'Course' })), /не найден: Course/);
    assert.match(describeError(new ApiError({ status: 409, detail: 'email' })), /Конфликт: email/);
    assert.match(describeError(new ApiError({ status: 500 })), /Ошибка сервера \(500\)/);
    assert.equal(describeError(new Error('boom')), 'boom');
    assert.equal(describeError('просто строка'), 'Неизвестная ошибка');
});

test('describeError перечисляет ошибки валидации', () => {
    const error = new ApiError({ status: 400, errors: { title: 'пусто', email: 'формат' } });
    assert.equal(describeError(error), 'title: пусто; email: формат');
});

test('fieldErrorsOf и hintForError помогают формам', () => {
    const error = new ApiError({ status: 400, errors: { title: 'пусто' } });
    assert.deepEqual(fieldErrorsOf(error), { title: 'пусто' });
    assert.deepEqual(fieldErrorsOf(new Error('x')), {});
    assert.match(hintForError(error), /Исправьте выделенные поля/);
    assert.match(hintForError(new ApiError({ status: 403 })), /инструктору-владельцу/);
});
