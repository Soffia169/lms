import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '../js/core/errors.js';
import { httpRequest } from '../js/core/http.js';
import { jsonResponse, scriptedFetch } from './helpers.js';

test('httpRequest подставляет Authorization, Accept и Content-Type', async () => {
    const fetchImpl = scriptedFetch([() => jsonResponse(200, { ok: true })]);

    const response = await httpRequest('http://api.local/api/courses', {
        method: 'POST',
        body: { title: 'Курс' },
        token: 'access-1',
        fetchImpl,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.data, { ok: true });

    const { init } = fetchImpl.calls[0];
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer access-1');
    assert.equal(init.headers.Accept, 'application/json');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.equal(init.body, JSON.stringify({ title: 'Курс' }));
});

test('httpRequest не отправляет заголовок без токена', async () => {
    const fetchImpl = scriptedFetch([() => jsonResponse(200, {})]);
    await httpRequest('http://api.local/api/auth/login', { fetchImpl, method: 'POST', body: {} });
    assert.equal(fetchImpl.calls[0].init.headers.Authorization, undefined);
});

test('httpRequest возвращает data=null для 204 No Content', async () => {
    const fetchImpl = scriptedFetch([() => jsonResponse(204)]);
    const response = await httpRequest('http://api.local/api/courses/1', { method: 'DELETE', token: 't', fetchImpl });
    assert.equal(response.status, 204);
    assert.equal(response.data, null);
});

test('httpRequest разбирает problem+json в ApiError', async () => {
    const fetchImpl = scriptedFetch([() => jsonResponse(404, {
        title: 'Not Found',
        status: 404,
        detail: 'Course 42 not found',
    })]);

    await assert.rejects(
        httpRequest('http://api.local/api/courses/42', { token: 't', fetchImpl }),
        (error) => {
            assert.ok(error instanceof ApiError);
            assert.equal(error.status, 404);
            assert.equal(error.detail, 'Course 42 not found');
            assert.equal(error.isNotFound, true);
            return true;
        },
    );
});

test('httpRequest не падает на не-JSON успешном ответе', async () => {
    const fetchImpl = scriptedFetch([() => jsonResponse(200, undefined, { 'content-type': 'text/plain' })]);
    const response = await httpRequest('http://api.local/api/x', { fetchImpl });
    assert.equal(response.data, null);
});

test('httpRequest превращает сетевую ошибку в ApiError со статусом 0', async () => {
    const fetchImpl = async () => {
        throw new TypeError('Failed to fetch');
    };
    await assert.rejects(
        httpRequest('http://api.local/api/courses', { fetchImpl }),
        (error) => error.isNetwork && error.status === 0,
    );
});

test('httpRequest соблюдает таймаут', async () => {
    const fetchImpl = (url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
    });

    await assert.rejects(
        httpRequest('http://api.local/api/slow', { fetchImpl, timeoutMs: 20 }),
        (error) => error.isNetwork && /время ожидания/.test(error.detail),
    );
});

test('httpRequest пробрасывает отмену страницей как есть', async () => {
    const controller = new AbortController();
    const fetchImpl = (url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
    });

    const pending = httpRequest('http://api.local/api/slow', { fetchImpl, signal: controller.signal });
    controller.abort();

    await assert.rejects(pending, (error) => error.name === 'AbortError' && !(error instanceof ApiError));
});
