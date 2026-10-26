import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeBase64Url, decodeJwt, isExpired, tokenExpiresAt, tokenRoles } from '../js/core/jwt.js';
import { makeJwt } from './helpers.js';

test('decodeBase64Url поддерживает UTF-8 и base64url без padding', () => {
    // Кириллица в email — проверка, что декодируем байты, а не латиницу.
    const encoded = Buffer.from('привет@lms.local', 'utf8').toString('base64url');
    assert.equal(decodeBase64Url(encoded), 'привет@lms.local');
});

test('decodeJwt разбирает header и payload', () => {
    const token = makeJwt({ sub: 'user-1', roles: ['ADMIN'], exp: 123 }, { alg: 'RS256', kid: 'abc' });
    const decoded = decodeJwt(token);

    assert.equal(decoded.header.alg, 'RS256');
    assert.equal(decoded.header.kid, 'abc');
    assert.equal(decoded.payload.sub, 'user-1');
});

test('decodeJwt возвращает null для не-JWT', () => {
    assert.equal(decodeJwt('not-a-token'), null);
    assert.equal(decodeJwt('a.b'), null);
    assert.equal(decodeJwt(null), null);
    assert.equal(decodeJwt(undefined), null);
    assert.equal(decodeJwt('a.b.c'), null, 'невалидный base64 не должен бросать');
});

test('tokenRoles нормализует массив, строку и убирает дубликаты', () => {
    assert.deepEqual(tokenRoles({ roles: ['admin', 'INSTRUCTOR', 'admin'] }), ['ADMIN', 'INSTRUCTOR']);
    assert.deepEqual(tokenRoles({ roles: 'STUDENT, instructor' }), ['STUDENT', 'INSTRUCTOR']);
    assert.deepEqual(tokenRoles({ roles: [] }), []);
    assert.deepEqual(tokenRoles({}), []);
    assert.deepEqual(tokenRoles(null), []);
    assert.deepEqual(tokenRoles({ roles: ['  ', null, 'ADMIN '] }), ['ADMIN']);
});

test('tokenExpiresAt переводит exp в миллисекунды', () => {
    assert.equal(tokenExpiresAt({ exp: 1_700_000_000 }), 1_700_000_000_000);
    assert.equal(tokenExpiresAt({}), null);
    assert.equal(tokenExpiresAt({ exp: 'nope' }), null);
    assert.equal(tokenExpiresAt(null), null);
});

test('isExpired учитывает skew и отсутствие exp', () => {
    // exp в JWT — секунды, клиент переводит их в миллисекунды.
    const payload = { exp: 2_000 }; // 2_000_000 мс
    assert.equal(isExpired(payload, { now: 1_999_000 }), false);
    assert.equal(isExpired(payload, { now: 2_000_000 }), true, 'ровно в момент истечения');
    // Запас 60 секунд: 2_000_000 - 60_000 = 1_940_000
    assert.equal(isExpired(payload, { now: 1_900_000, skewMs: 60_000 }), false);
    assert.equal(isExpired(payload, { now: 1_950_000, skewMs: 60_000 }), true);
    assert.equal(isExpired({}, { now: 0 }), true, 'без exp токен считается недействительным');
});
