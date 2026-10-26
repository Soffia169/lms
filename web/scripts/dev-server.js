/**
 * Мини-сервер для разработки UI без Docker.
 *
 * Делает ровно то же, что nginx в контейнере: отдаёт статику из web/ и
 * проксирует /api на gateway, чтобы браузер работал с одним origin.
 *
 *   cd web
 *   node scripts/dev-server.js           # http://localhost:5500
 *   API_TARGET=http://localhost:8080 node scripts/dev-server.js
 *
 * Зависимостей нет: только node:http, node:fs и fetch.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT ?? 5500);
const API_TARGET = (process.env.API_TARGET ?? 'http://localhost:8080').replace(/\/+$/, '');

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
};

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length']);

const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') {
        proxy(request, response, url);
        return;
    }
    serveStatic(response, url.pathname);
});

async function proxy(request, response, url) {
    const targetPath = url.pathname === '/healthz' ? '/actuator/health' : `${url.pathname}${url.search}`;
    const headers = {};
    for (const [name, value] of Object.entries(request.headers)) {
        if (!HOP_BY_HOP.has(name.toLowerCase())) {
            headers[name] = value;
        }
    }

    try {
        const body = await readBody(request);
        const upstream = await fetch(`${API_TARGET}${targetPath}`, {
            method: request.method,
            headers,
            body: body.length > 0 ? body : undefined,
        });

        response.statusCode = upstream.status;
        for (const [name, value] of upstream.headers.entries()) {
            if (!HOP_BY_HOP.has(name.toLowerCase())) {
                response.setHeader(name, value);
            }
        }
        response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
        response.statusCode = 502;
        response.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
        response.end(JSON.stringify({
            title: 'Bad Gateway',
            status: 502,
            detail: `gateway недоступен по адресу ${API_TARGET}: ${error.message}`,
        }));
    }
}

async function serveStatic(response, pathname) {
    const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
    const candidate = resolve(join(ROOT, relative === '' ? 'index.html' : relative));

    if (!candidate.startsWith(ROOT + sep) && candidate !== ROOT) {
        sendText(response, 403, 'Forbidden');
        return;
    }

    const target = await pickFile(candidate);
    if (!target) {
        // SPA-фолбэк: неизвестный путь отдаёт index.html (хеш-роутинг).
        const index = join(ROOT, 'index.html');
        sendFile(response, index);
        return;
    }
    sendFile(response, target);
}

async function pickFile(candidate) {
    try {
        const info = await stat(candidate);
        if (info.isFile()) {
            return candidate;
        }
        if (info.isDirectory()) {
            const index = join(candidate, 'index.html');
            const indexInfo = await stat(index).catch(() => null);
            if (indexInfo?.isFile()) {
                return index;
            }
        }
    } catch {
        return null;
    }
    return null;
}

async function sendFile(response, file) {
    try {
        const content = await readFile(file);
        response.statusCode = 200;
        response.setHeader('Content-Type', CONTENT_TYPES[extname(file)] ?? 'application/octet-stream');
        response.setHeader('Cache-Control', 'no-store');
        response.end(content);
    } catch {
        sendText(response, 404, 'Not Found');
    }
}

function sendText(response, status, message) {
    response.statusCode = status;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.end(message);
}

async function readBody(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

server.listen(PORT, '127.0.0.1', () => {
    console.log(`LMS web dev server: http://localhost:${PORT}`);
    console.log(`API (/api, /healthz) → ${API_TARGET}`);
    console.log('Остановка: Ctrl+C');
});
