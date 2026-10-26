import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '../js/core/errors.js';
import { buildUrl, createApiClient } from '../js/core/client.js';
import { createSessionStore } from '../js/core/session.js';
import { makeJwt, memoryStorage } from './helpers.js';

/**
 * @param {object} [options]
 * @returns {string} access-токен с нужными ролями и TTL
 */
function accessToken({ roles = ['INSTRUCTOR'], expiresInSeconds = 900, sub = 'u-1' } = {}) {
    const now = Math.floor(Date.now() / 1000);
    return makeJwt({ sub, roles, exp: now + expiresInSeconds, iat: now });
}

/**
 * Клиент с подменённым транспортом и записью вызовов.
 *
 * @param {object} [options]
 * @returns {object}
 */
function createHarness({ token = accessToken(), handler, onSessionExpired = () => {}, session: providedSession = null } = {}) {
    const session = providedSession ?? createSessionStore({ storage: memoryStorage(), now: () => Date.now() });
    if (token !== null) {
        session.save({ accessToken: token, refreshToken: 'refresh-0' });
    }

    const calls = [];
    const refreshCalls = [];
    const defaultRefreshToken = accessToken({ roles: ['ADMIN'] });

    const http = async (url, options = {}) => {
        calls.push({ url, ...options });
        return handler({ url, ...options }, calls.length, calls);
    };

    const client = createApiClient({
        baseUrl: '/api',
        session,
        http,
        onSessionExpired,
        refreshSession: async (refreshToken) => {
            refreshCalls.push(refreshToken);
            return { accessToken: defaultRefreshToken, refreshToken: 'refresh-1' };
        },
    });

    return { client, session, calls, refreshCalls, refreshTokenAfter: defaultRefreshToken };
}

test('buildUrl склеивает base, path и query без пустых параметров', () => {
    assert.equal(buildUrl('/api', '/courses'), '/api/courses');
    assert.equal(buildUrl('/api/', 'courses'), '/api/courses');
    assert.equal(buildUrl('http://localhost:8080/api', '/courses', { published: true }), 'http://localhost:8080/api/courses?published=true');
    assert.equal(buildUrl('/api', '/courses', { published: false }), '/api/courses?published=false');
    assert.equal(buildUrl('/api', '/courses', { published: undefined, q: null, s: '' }), '/api/courses');
});

test('GET подставляет Bearer-токен', async () => {
    const harness = createHarness({ handler: () => ({ status: 200, data: [] }) });
    const result = await harness.client.get('/courses');

    assert.deepEqual(result, []);
    assert.equal(harness.calls[0].url, '/api/courses');
    assert.match(harness.calls[0].token, /^eyJ/);
});

test('auth:false не требует сессии и не подставляет токен', async () => {
    const harness = createHarness({
        token: null,
        handler: () => ({ status: 200, data: { accessToken: 'a', refreshToken: 'b' } }),
    });

    await harness.client.post('/auth/login', { body: { email: 'a', password: 'b' }, auth: false });

    assert.equal(harness.calls[0].token, undefined);
    assert.equal(harness.calls[0].method, 'POST');
    assert.deepEqual(harness.calls[0].body, { email: 'a', password: 'b' });
});

test('без сессии защищённый запрос падает с 401 до сети', async () => {
    const harness = createHarness({ token: null, handler: () => ({ status: 200, data: [] }) });
    await assert.rejects(harness.client.get('/courses'), (error) => error instanceof ApiError && error.status === 401);
    assert.equal(harness.calls.length, 0);
});

test('401 приводит к refresh и повтору исходного запроса', async () => {
    let courseAttempts = 0;
    const harness = createHarness({
        handler: ({ url }) => {
            if (url === '/api/courses') {
                courseAttempts += 1;
                if (courseAttempts === 1) {
                    throw new ApiError({ status: 401, title: 'Unauthorized' });
                }
                return { status: 200, data: { ok: true } };
            }
            return { status: 200, data: {} };
        },
    });

    const result = await harness.client.get('/courses');

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(harness.calls.map((call) => call.url), ['/api/courses', '/api/courses']);
    assert.equal(harness.refreshCalls.length, 1);
    assert.equal(harness.session.refreshToken(), 'refresh-1');
});

test('истёкший access-токен обновляется заранее, без 401', async () => {
    const harness = createHarness({
        token: accessToken({ expiresInSeconds: -60 }),
        handler: () => ({ status: 200, data: { ok: true } }),
    });

    await harness.client.get('/courses');

    assert.equal(harness.refreshCalls.length, 1, 'refresh до запроса');
    assert.deepEqual(harness.calls.map((call) => call.url), ['/api/courses']);
    assert.equal(harness.calls[0].token, harness.refreshTokenAfter);
});

test('одновременные запросы делают только один refresh', async () => {
    const harness = createHarness({
        token: accessToken({ expiresInSeconds: -60 }),
        handler: () => ({ status: 200, data: { ok: true } }),
    });

    // Refresh отвечает с задержкой, чтобы оба запроса успели его запросить.
    const client = createApiClient({
        baseUrl: '/api',
        session: harness.session,
        http: async (url, options) => {
            harness.calls.push({ url, ...options });
            return { status: 200, data: { url } };
        },
        onSessionExpired: () => {},
        refreshSession: async (refreshToken) => {
            harness.refreshCalls.push(refreshToken);
            await new Promise((resolve) => setTimeout(resolve, 15));
            return { accessToken: harness.refreshTokenAfter, refreshToken: 'refresh-1' };
        },
    });

    const [first, second] = await Promise.all([client.get('/courses'), client.get('/courses/1')]);

    assert.equal(first.url, '/api/courses');
    assert.equal(second.url, '/api/courses/1');
    assert.equal(harness.refreshCalls.length, 1, 'single-flight refresh');
    assert.equal(harness.session.refreshToken(), 'refresh-1');
});

test('ошибка refresh очищает сессию и уведомляет один раз', async () => {
    const notifications = [];
    const session = createSessionStore({ storage: memoryStorage(), now: () => Date.now() });
    session.save({ accessToken: accessToken({ expiresInSeconds: -60 }), refreshToken: 'refresh-0' });

    const client = createApiClient({
        baseUrl: '/api',
        session,
        http: async () => ({ status: 200, data: {} }),
        onSessionExpired: (error) => notifications.push(error),
        refreshSession: async () => {
            throw new ApiError({ status: 401, title: 'Unauthorized', detail: 'refresh отозван' });
        },
    });

    await assert.rejects(client.get('/courses'), (error) => error.status === 401);
    await assert.rejects(client.get('/courses/2'), (error) => error.status === 401);

    assert.equal(session.isAuthenticated(), false);
    assert.equal(notifications.length, 1, 'уведомление о потере сессии не дублируется');
});

test('другая вкладка уже обновила токен — повторный refresh не нужен', async () => {
    const harness = createHarness({ token: accessToken({ expiresInSeconds: -60 }), handler: () => ({ status: 200, data: {} }) });
    const stale = harness.session.accessToken();
    const fresh = accessToken({ roles: ['ADMIN'] });
    // Эмуляция: другая вкладка записала новую пару в общий storage.
    harness.session.save({ accessToken: fresh, refreshToken: 'refresh-1' });

    const result = await harness.client.refreshAccessToken(stale);

    assert.equal(result, fresh);
    assert.equal(harness.refreshCalls.length, 0);
});

test('refreshAccessToken сохраняет ротированную пару', async () => {
    const harness = createHarness({ token: accessToken({ expiresInSeconds: -1 }), handler: () => ({ status: 200, data: {} }) });

    const result = await harness.client.refreshAccessToken(harness.session.accessToken());

    assert.equal(result, harness.refreshTokenAfter);
    assert.equal(harness.refreshCalls[0], 'refresh-0');
    assert.equal(harness.session.refreshToken(), 'refresh-1');
    assert.equal(harness.session.hasRole('ADMIN'), true);
});

test('ping сообщает ok и не требует токена', async () => {
    const harness = createHarness({ token: null, handler: () => ({ status: 200, data: { keys: [] } }) });
    const result = await harness.client.ping();

    assert.equal(result.ok, true);
    assert.equal(typeof result.latencyMs, 'number');
    assert.equal(harness.calls[0].url, '/api/auth/.well-known/jwks.json');
    assert.equal(harness.calls[0].token, undefined);
});

test('ping возвращает ошибку, а не бросает исключение', async () => {
    const harness = createHarness({ token: null, handler: () => ({ status: 200, data: {} }) });
    const client = createApiClient({
        baseUrl: '/api',
        session: harness.session,
        http: async () => {
            throw new ApiError({ status: 0, detail: 'нет связи' });
        },
    });

    const result = await client.ping();

    assert.equal(result.ok, false);
    assert.equal(result.latencyMs, null);
    assert.equal(result.error.isNetwork, true);
});
