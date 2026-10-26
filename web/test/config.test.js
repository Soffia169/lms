import assert from 'node:assert/strict';
import test from 'node:test';

import {
    API_BASE_STORAGE_KEY,
    DEFAULT_API_BASE,
    isAbsoluteApiBase,
    normalizeApiBase,
    resetApiBase,
    resolveApiBase,
    setApiBase,
    swaggerAuthUrl,
} from '../js/core/config.js';
import { memoryStorage } from './helpers.js';

test('normalizeApiBase приводит адреса к одному виду', () => {
    assert.equal(normalizeApiBase(''), '/api');
    assert.equal(normalizeApiBase(null), '/api');
    assert.equal(normalizeApiBase('api'), '/api');
    assert.equal(normalizeApiBase('/api/'), '/api');
    assert.equal(normalizeApiBase('/gateway/api/'), '/gateway/api');
    assert.equal(normalizeApiBase('http://localhost:8080'), 'http://localhost:8080/api');
    assert.equal(normalizeApiBase('http://localhost:8080/'), 'http://localhost:8080/api');
    assert.equal(normalizeApiBase('https://lms.local/gateway/api'), 'https://lms.local/gateway/api');
    assert.equal(normalizeApiBase('  /api  '), '/api');
});

test('resolveApiBase соблюдает приоритет: query → storage → config → default', () => {
    const storage = memoryStorage({ [API_BASE_STORAGE_KEY]: 'http://stored.local/api' });

    assert.equal(
        resolveApiBase({ search: '?api=http://query.local/api', storage, config: { apiBase: 'http://config.local/api' } }),
        'http://query.local/api',
    );
    assert.equal(
        resolveApiBase({ search: '', storage, config: { apiBase: 'http://config.local/api' } }),
        'http://stored.local/api',
    );
    assert.equal(
        resolveApiBase({ search: '', storage: memoryStorage(), config: { apiBase: 'http://config.local/api' } }),
        'http://config.local/api',
    );
    assert.equal(resolveApiBase({ search: '', storage: memoryStorage(), config: null }), DEFAULT_API_BASE);
});

test('resolveApiBase не падает на битом query и недоступном storage', () => {
    const brokenStorage = {
        getItem() {
            throw new Error('denied');
        },
    };
    assert.equal(resolveApiBase({ search: '?api=', storage: brokenStorage, config: null }), DEFAULT_API_BASE);
});

test('setApiBase сохраняет нормализованное значение, resetApiBase удаляет', () => {
    const storage = memoryStorage();
    assert.equal(setApiBase('http://localhost:8080/', storage), 'http://localhost:8080/api');
    assert.equal(storage.getItem(API_BASE_STORAGE_KEY), 'http://localhost:8080/api');

    assert.equal(resetApiBase(storage), DEFAULT_API_BASE);
    assert.equal(storage.getItem(API_BASE_STORAGE_KEY), null);
});

test('isAbsoluteApiBase отличает внешний адрес от same-origin', () => {
    assert.equal(isAbsoluteApiBase('/api'), false);
    assert.equal(isAbsoluteApiBase('http://localhost:8080/api'), true);
    assert.equal(isAbsoluteApiBase('https://lms.local/api'), true);
});

test('swaggerAuthUrl ведёт на порт auth-service', () => {
    assert.equal(swaggerAuthUrl('/api'), 'http://localhost:8081/swagger-ui.html');
    assert.equal(swaggerAuthUrl('http://localhost:8080/api'), 'http://localhost:8081/swagger-ui.html');
    assert.equal(swaggerAuthUrl('http://127.0.0.1:8080/api'), 'http://127.0.0.1:8081/swagger-ui.html');
    // Внешний хост без явного порта: оставляем тот же origin, порт не выдумываем.
    assert.equal(swaggerAuthUrl('http://gateway.local/api'), 'http://gateway.local/swagger-ui.html');
    assert.equal(swaggerAuthUrl('https://lms.local:8443/gateway/api'), 'https://lms.local:8081/swagger-ui.html');
});
