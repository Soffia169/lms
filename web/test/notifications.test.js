import assert from 'node:assert/strict';
import test from 'node:test';

import {
    NOTIFICATIONS_SEEN_KEY,
    latestNotificationAt,
    notificationTime,
    readSeenAt,
    unseenCount,
    writeSeenAt,
} from '../js/core/notifications.js';
import { memoryStorage } from './helpers.js';

test('notificationTime разбирает дату и терпит мусор', () => {
    assert.equal(notificationTime({ createdAt: '2026-10-19T12:00:00Z' }), Date.parse('2026-10-19T12:00:00Z'));
    assert.equal(notificationTime({ createdAt: new Date(Date.parse('2026-01-01T00:00:00Z')) }), Date.parse('2026-01-01T00:00:00Z'));
    assert.equal(notificationTime({}), null);
    assert.equal(notificationTime({ createdAt: 'не дата' }), null);
    assert.equal(notificationTime(null), null);
});

test('latestNotificationAt возвращает самое свежее время', () => {
    const items = [
        { createdAt: '2026-10-19T10:00:00Z' },
        { createdAt: '2026-10-19T12:00:00Z' },
        { createdAt: 'мусор' },
        { createdAt: '2026-10-19T11:00:00Z' },
    ];
    assert.equal(latestNotificationAt(items), Date.parse('2026-10-19T12:00:00Z'));
    assert.equal(latestNotificationAt([]), null);
    assert.equal(latestNotificationAt(null), null);
});

test('unseenCount без отметки считает всё, с отметкой — строго позже', () => {
    const items = [
        { createdAt: '2026-10-19T10:00:00Z' },
        { createdAt: '2026-10-19T12:00:00Z' },
        { createdAt: '2026-10-19T13:00:00Z' },
    ];
    const seenAt = Date.parse('2026-10-19T12:00:00Z');

    assert.equal(unseenCount(items, null), 3);
    assert.equal(unseenCount(items, undefined), 3);
    assert.equal(unseenCount(items, seenAt), 1); // только 13:00 позже отметки
    assert.equal(unseenCount([], seenAt), 0);
    assert.equal(unseenCount(null, null), 0);
});

test('writeSeenAt/readSeenAt переживают round-trip и сброс', () => {
    const storage = memoryStorage();

    assert.equal(readSeenAt(storage), null);

    const moment = Date.parse('2026-10-19T12:00:00Z');
    assert.equal(writeSeenAt(moment, storage), moment);
    assert.equal(storage.getItem(NOTIFICATIONS_SEEN_KEY), String(moment));
    assert.equal(readSeenAt(storage), moment);

    assert.equal(writeSeenAt(null, storage), null);
    assert.equal(storage.getItem(NOTIFICATIONS_SEEN_KEY), null);
    assert.equal(readSeenAt(storage), null);
});

test('writeSeenAt нормализует мусор в null, readSeenAt терпит битое значение', () => {
    const storage = memoryStorage();
    assert.equal(writeSeenAt('abc', storage), null);
    assert.equal(storage.getItem(NOTIFICATIONS_SEEN_KEY), null);

    storage.setItem(NOTIFICATIONS_SEEN_KEY, 'не число');
    assert.equal(readSeenAt(storage), null);

    assert.equal(writeSeenAt(1_000.7, storage), 1_000);
});

test('readSeenAt/writeSeenAt не падают при недоступном storage', () => {
    const brokenStorage = {
        getItem() {
            throw new Error('denied');
        },
        setItem() {
            throw new Error('denied');
        },
        removeItem() {
            throw new Error('denied');
        },
    };

    const moment = Date.parse('2026-10-20T08:00:00Z');
    assert.equal(writeSeenAt(moment, brokenStorage), moment);
    assert.equal(readSeenAt(brokenStorage), null);
});
