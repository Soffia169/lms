import assert from 'node:assert/strict';
import test from 'node:test';

import {
    formatDate,
    formatDateTime,
    formatDuration,
    formatRelative,
    initials,
    pluralRu,
    roleLabel,
    roleTone,
    rolesLabel,
    shortId,
    truncate,
} from '../js/core/format.js';

test('pluralRu выбирает форму по русским правилам', () => {
    const forms = ['курс', 'курса', 'курсов'];
    assert.equal(pluralRu(1, forms), 'курс');
    assert.equal(pluralRu(2, forms), 'курса');
    assert.equal(pluralRu(4, forms), 'курса');
    assert.equal(pluralRu(5, forms), 'курсов');
    assert.equal(pluralRu(11, forms), 'курсов');
    assert.equal(pluralRu(12, forms), 'курсов');
    assert.equal(pluralRu(21, forms), 'курс');
    assert.equal(pluralRu(22, forms), 'курса');
    assert.equal(pluralRu(0, forms), 'курсов');
    assert.equal(pluralRu(-3, forms), 'курса');
});

test('initials строит инициалы для аватара', () => {
    assert.equal(initials('Иван Петров'), 'ИП');
    assert.equal(initials('admin'), 'AD');
    assert.equal(initials('  '), '?');
    assert.equal(initials(null), '?');
    assert.equal(initials('Анна Мария Смирнова'), 'АМ');
});

test('shortId не режет короткие значения', () => {
    assert.equal(shortId('abcdef12-3456'), 'abcdef12…');
    assert.equal(shortId('short'), 'short');
    assert.equal(shortId(null), '—');
    assert.equal(shortId('abcdef-1234567', 6), 'abcdef…');
});

test('roleLabel и roleTone знают все роли бэкенда', () => {
    assert.equal(roleLabel('ADMIN'), 'Администратор');
    assert.equal(roleLabel('INSTRUCTOR'), 'Инструктор');
    assert.equal(roleLabel('student'), 'Студент');
    assert.equal(roleLabel(''), 'Без роли');
    assert.equal(roleTone('ADMIN'), 'accent');
    assert.equal(roleTone('INSTRUCTOR'), 'success');
    assert.equal(roleTone('STUDENT'), 'warning');
    assert.equal(roleTone('UNKNOWN'), 'neutral');
    assert.equal(rolesLabel(['STUDENT', 'INSTRUCTOR']), 'Студент · Инструктор');
    assert.equal(rolesLabel([]), 'Без ролей');
});

test('formatDuration показывает минуты, часы и истёкший токен', () => {
    assert.equal(formatDuration(0), 'истёк');
    assert.equal(formatDuration(-1), 'истёк');
    assert.equal(formatDuration(null), '—');
    assert.equal(formatDuration(20_000), 'меньше минуты');
    assert.equal(formatDuration(60_000), '1 минута');
    assert.equal(formatDuration(5 * 60_000), '5 минут');
    assert.equal(formatDuration(60 * 60_000), '1 час');
    assert.equal(formatDuration(75 * 60_000), '1 час 15 минут');
});

test('formatDateTime и formatDate терпимы к пустым значениям', () => {
    assert.equal(formatDateTime(null), '—');
    assert.equal(formatDate('не дата'), '—');
    assert.match(formatDateTime('2026-10-19T16:32:30Z'), /\d{2}\.\d{2}\.\d{4}/);
    assert.match(formatDate('2026-10-19T16:32:30Z'), /2026/);
});

test('formatRelative описывает недавние события словами', () => {
    const now = Date.parse('2026-10-19T12:00:00Z');
    assert.equal(formatRelative(new Date(now - 10_000).toISOString(), now), 'только что');
    assert.equal(formatRelative(new Date(now - 5 * 60_000).toISOString(), now), '5 минут назад');
    assert.equal(formatRelative(new Date(now - 3 * 60 * 60_000).toISOString(), now), '3 часа назад');
    assert.equal(formatRelative(new Date(now - 26 * 60 * 60_000).toISOString(), now), 'вчера');
    assert.equal(formatRelative(new Date(now - 3 * 24 * 60 * 60_000).toISOString(), now), '3 дня назад');
    assert.equal(formatRelative(null, now), '—');
});

test('truncate обрезает по границе слова и добавляет многоточие', () => {
    assert.equal(truncate('короткий текст', 100), 'короткий текст');
    assert.equal(truncate('aaaa bbbb cccc', 10), 'aaaa bbbb…');
    assert.equal(truncate('', 10), '');
    assert.equal(truncate(null, 10), '');
});
