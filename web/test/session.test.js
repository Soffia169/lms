import assert from 'node:assert/strict';
import test from 'node:test';

import {
    SESSION_STORAGE_KEY,
    buildSession,
    canManageCourse,
    createSessionStore,
    normalizeSession,
} from '../js/core/session.js';
import { makeJwt, memoryStorage, validAccessToken } from './helpers.js';

test('buildSession выводит expiresAt и роли из JWT', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const accessToken = makeJwt({ sub: 'u1', exp: nowSeconds + 900, roles: ['INSTRUCTOR'] });

    const session = buildSession({ accessToken, refreshToken: 'refresh-1', user: { id: 'u1' }, savedAt: 1 });

    assert.equal(session.expiresAt, (nowSeconds + 900) * 1000);
    assert.deepEqual(session.tokenRoles, ['INSTRUCTOR']);
    assert.equal(session.savedAt, 1);
});

test('normalizeSession отбрасывает неполные и битые данные', () => {
    assert.equal(normalizeSession(null), null);
    assert.equal(normalizeSession('строка'), null);
    assert.equal(normalizeSession({ accessToken: 'a' }), null);
    assert.equal(normalizeSession({ refreshToken: 'r' }), null);
    assert.equal(normalizeSession({ accessToken: '', refreshToken: 'r' }), null);

    const normalized = normalizeSession({
        accessToken: validAccessToken(),
        refreshToken: 'r',
        user: { id: 'u1', role: 'INSTRUCTOR' },
    });
    assert.equal(normalized.refreshToken, 'r');
    assert.equal(normalized.user.role, 'INSTRUCTOR');
});

function createStore({ accessToken, refreshToken = 'refresh-1', user = null, now = () => 1_000_000 } = {}) {
    const storage = memoryStorage();
    const store = createSessionStore({ storage, now, refreshSkewMs: 30_000 });
    if (accessToken) {
        store.save({ accessToken, refreshToken, user });
    }
    return { storage, store };
}

test('save/get/clear работают с storage и событиями', () => {
    const { storage, store } = createStore();
    const events = [];
    const unsubscribe = store.subscribe((session, reason) => events.push({ session, reason }));

    assert.equal(store.isAuthenticated(), false);
    store.save({ accessToken: validAccessToken(), refreshToken: 'r1' });
    assert.equal(store.isAuthenticated(), true);
    assert.equal(store.refreshToken(), 'r1');
    assert.ok(storage.getItem(SESSION_STORAGE_KEY));
    assert.equal(events.at(-1).reason, 'save');

    store.clear('logout');
    assert.equal(store.isAuthenticated(), false);
    assert.equal(storage.getItem(SESSION_STORAGE_KEY), null);
    assert.equal(events.at(-1).reason, 'logout');
    assert.equal(events.at(-1).session, null);

    unsubscribe();
    store.save({ accessToken: validAccessToken(), refreshToken: 'r2' });
    assert.equal(events.filter((event) => event.reason === 'save').length, 1);
});

test('updateUser не меняет токены', () => {
    const accessToken = validAccessToken();
    const { store } = createStore({ accessToken });
    store.updateUser({ id: 'u1', fullName: 'Иван', role: 'INSTRUCTOR', email: 'i@lms.local' });

    assert.equal(store.get().accessToken, accessToken);
    assert.equal(store.user().fullName, 'Иван');
    assert.equal(store.hasRole('INSTRUCTOR'), true);
    assert.equal(store.hasRole('ADMIN'), false);
    assert.equal(store.canAuthorCourses(), true);
});

test('isExpiringSoon срабатывает за 30 секунд до конца', () => {
    const expiresAt = 1_000_000 + 60_000;
    const accessToken = makeJwt({ sub: 'u', exp: Math.floor(expiresAt / 1000), roles: ['STUDENT'] });
    const { store } = createStore({ accessToken, now: () => 1_000_000 });

    assert.equal(store.isExpiringSoon(), false);
    assert.equal(store.msUntilExpiry(), 60_000);
    // Запас по умолчанию 30s: на 31-й секунде до конца ещё «не скоро».
    assert.equal(store.isExpiringSoon(31_000), false);
    assert.equal(store.isExpiringSoon(60_000), true);
});

test('handleStorageEvent подхватывает ротацию из другой вкладки', () => {
    const { storage, store } = createStore({ accessToken: validAccessToken({ sub: 'u', roles: ['STUDENT'] }) });
    assert.equal(store.hasRole('ADMIN'), false);

    // Другая вкладка обновила пару: пишем новое значение прямо в общий storage.
    const rotated = validAccessToken({ sub: 'u', roles: ['ADMIN'] });
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: rotated, refreshToken: 'r2', user: null }));

    const tokensChanged = store.handleStorageEvent({ key: SESSION_STORAGE_KEY });

    assert.equal(tokensChanged, true);
    assert.equal(store.refreshToken(), 'r2');
    assert.equal(store.hasRole('ADMIN'), true);
});

test('handleStorageEvent игнорирует посторонние ключи', () => {
    const { store } = createStore({ accessToken: validAccessToken() });
    assert.equal(store.handleStorageEvent({ key: 'lms.theme' }), false);
});

test('битый JSON в storage не ломает приложение', () => {
    const storage = memoryStorage({ [SESSION_STORAGE_KEY]: '{не json' });
    const store = createSessionStore({ storage, now: () => 0 });

    assert.equal(store.get(), null);
    assert.equal(storage.getItem(SESSION_STORAGE_KEY), null, 'повреждённая сессия удаляется');
});

test('canManageCourse повторяет правило бэкенда', () => {
    const course = { instructorId: 'owner-1' };
    assert.equal(canManageCourse({ id: 'owner-1' }, course, false), true);
    assert.equal(canManageCourse({ id: 'other' }, course, false), false);
    assert.equal(canManageCourse({ id: 'other' }, course, true), true);
    assert.equal(canManageCourse(null, course, false), false);
    assert.equal(canManageCourse({ id: 'owner-1' }, null, true), false);
});
