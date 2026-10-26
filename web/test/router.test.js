import assert from 'node:assert/strict';
import test from 'node:test';

import { matchPath, normalizeHash, normalizePath, parseLocation } from '../js/core/router.js';

test('parseLocation разбирает путь и query', () => {
    assert.deepEqual(parseLocation('#/catalog'), { path: '/catalog', query: {}, search: '' });
    assert.deepEqual(parseLocation('#/courses/42'), { path: '/courses/42', query: {}, search: '' });
    assert.deepEqual(parseLocation(''), { path: '/', query: {}, search: '' });
    assert.deepEqual(parseLocation('#'), { path: '/', query: {}, search: '' });
    assert.deepEqual(parseLocation('#/catalog/'), { path: '/catalog', query: {}, search: '' });

    const withQuery = parseLocation('#/login?next=%2Fcourses%2F1&mode=x');
    assert.equal(withQuery.path, '/login');
    assert.deepEqual(withQuery.query, { next: '/courses/1', mode: 'x' });
    assert.equal(withQuery.search, '?next=%2Fcourses%2F1&mode=x');
});

test('normalizePath приводит путь к единому виду', () => {
    assert.equal(normalizePath(''), '/');
    assert.equal(normalizePath('/'), '/');
    assert.equal(normalizePath('catalog'), '/catalog');
    assert.equal(normalizePath('/catalog///'), '/catalog');
});

test('normalizeHash собирает адрес навигации', () => {
    assert.equal(normalizeHash('/catalog'), '#/catalog');
    assert.equal(normalizeHash('catalog'), '#/catalog');
    assert.equal(normalizeHash('/'), '#/');
});

test('matchPath сравнивает сегменты и извлекает параметры', () => {
    assert.deepEqual(matchPath('/catalog', '/catalog'), {});
    assert.deepEqual(matchPath('/courses/:id', '/courses/42'), { id: '42' });
    assert.deepEqual(matchPath('/a/:b/:c', '/a/1/2'), { b: '1', c: '2' });
    assert.deepEqual(matchPath('/courses/:id', '/courses/a%20b'), { id: 'a b' });
});

test('matchPath не совпадает с чужими путями', () => {
    assert.equal(matchPath('/catalog', '/profile'), null);
    assert.equal(matchPath('/courses/:id', '/courses'), null);
    assert.equal(matchPath('/courses/:id', '/courses/1/lessons'), null);
    assert.equal(matchPath('/:id', '/'), null);
});
