import assert from 'node:assert/strict';
import test from 'node:test';

import { createEnrollmentsApi } from '../js/api/enrollments.js';
import { createNotificationsApi } from '../js/api/notifications.js';

/**
 * Записывающий клиент: запоминает вызовы, возвращает заглушку.
 *
 * @returns {object} клиент + calls
 */
function recordingClient() {
    const calls = [];
    return {
        calls,
        async get(path) {
            calls.push({ method: 'GET', path, options: undefined });
            return { path };
        },
        async post(path, options = {}) {
            calls.push({ method: 'POST', path, options });
            return { path, body: options.body ?? null };
        },
    };
}

test('createEnrollmentsApi.enroll отправляет courseId в теле', async () => {
    const client = recordingClient();
    const api = createEnrollmentsApi({ client });

    const result = await api.enroll('cid-1');

    assert.deepEqual(client.calls, [{ method: 'POST', path: '/enrollments', options: { body: { courseId: 'cid-1' } } }]);
    assert.deepEqual(result.body, { courseId: 'cid-1' });
});

test('createEnrollmentsApi.listMine запрашивает GET /enrollments', async () => {
    const client = recordingClient();
    const api = createEnrollmentsApi({ client });

    await api.listMine();

    assert.deepEqual(client.calls, [{ method: 'GET', path: '/enrollments', options: undefined }]);
});

test('createEnrollmentsApi кодирует id в пути', async () => {
    const client = recordingClient();
    const api = createEnrollmentsApi({ client });

    await api.get('id with space');
    await api.progress('eid');
    await api.cancel('eid');
    await api.completeLesson('eid', 'lid/2');

    assert.deepEqual(client.calls, [
        { method: 'GET', path: '/enrollments/id%20with%20space', options: undefined },
        { method: 'GET', path: '/enrollments/eid/progress', options: undefined },
        { method: 'POST', path: '/enrollments/eid/cancel', options: {} },
        { method: 'POST', path: '/enrollments/eid/lessons/lid%2F2/complete', options: {} },
    ]);
});

test('createNotificationsApi.listMine запрашивает GET /notifications', async () => {
    const client = recordingClient();
    const api = createNotificationsApi({ client });

    const result = await api.listMine();

    assert.deepEqual(client.calls, [{ method: 'GET', path: '/notifications', options: undefined }]);
    assert.deepEqual(result, { path: '/notifications' });
});
