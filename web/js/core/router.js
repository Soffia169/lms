/**
 * Хеш-роутер.
 *
 * Хеш-навигация (#/catalog) выбрана осознанно: статике не нужен rewrite на
 * сервере, интерфейс открывается и из nginx, и из простого статического
 * сервера, и даже с file://. Состояние не выдумываем — источник истины один,
 * location.hash.
 *
 * Контракт представления: `async view(ctx) → { el, title?, dispose? }`
 * или просто DOM-элемент. ctx: { params, query, path, signal, navigate, reload }.
 */

import { loadingState, errorState } from '../ui/states.js';

export const ROUTE_NOT_FOUND = '__not_found__';

/**
 * Разбирает `location.hash` на путь и query.
 *
 * @param {string} hash
 * @returns {{path: string, query: Record<string, string>, search: string}}
 */
export function parseLocation(hash = '') {
    const raw = String(hash ?? '');
    const withoutHash = raw.startsWith('#') ? raw.slice(1) : raw;
    const [pathPart, queryPart = ''] = withoutHash.split('?');
    const path = normalizePath(pathPart);
    const params = new URLSearchParams(queryPart);
    const query = Object.fromEntries(params.entries());
    return {
        path,
        query,
        search: queryPart ? `?${queryPart}` : '',
    };
}

/**
 * Приводит путь к виду `/a/b` без хвостового слэша.
 *
 * @param {string} path
 * @returns {string}
 */
export function normalizePath(path) {
    const value = String(path ?? '').trim();
    if (value === '' || value === '/') {
        return '/';
    }
    const withSlash = value.startsWith('/') ? value : `/${value}`;
    return withSlash.replace(/\/+$/, '') || '/';
}

/**
 * Собирает хеш-адрес.
 *
 * @param {string} path
 * @returns {string} `#/path`
 */
export function normalizeHash(path) {
    return `#${normalizePath(path)}`;
}

/**
 * Сопоставляет шаблон маршрута с путём.
 *
 * @param {string} pattern например `/courses/:id`
 * @param {string} path
 * @returns {Record<string, string>|null} параметры либо null
 */
export function matchPath(pattern, path) {
    const patternParts = splitPath(pattern);
    const pathParts = splitPath(path);
    if (patternParts.length !== pathParts.length) {
        return null;
    }
    const params = {};
    for (let index = 0; index < patternParts.length; index += 1) {
        const expected = patternParts[index];
        const actual = pathParts[index];
        if (expected.startsWith(':')) {
            if (actual === '') {
                return null;
            }
            try {
                params[expected.slice(1)] = decodeURIComponent(actual);
            } catch {
                params[expected.slice(1)] = actual;
            }
            continue;
        }
        if (expected !== actual) {
            return null;
        }
    }
    return params;
}

function splitPath(path) {
    return normalizePath(path).split('/').filter(Boolean);
}

/**
 * Создаёт роутер.
 *
 * @param {object} options
 * @param {HTMLElement} options.outlet контейнер представлений
 * @param {Array<{name: string, path: string, view: Function, title?: string, auth?: boolean, guest?: boolean}>} options.routes
 * @param {Function} options.notFoundView представление 404
 * @param {string} [options.defaultPath]
 * @param {() => boolean} [options.isAuthenticated]
 * @param {object} [options.context] общий контекст приложения (api, session, …)
 * @param {(route: object|null, location: object) => void} [options.onNavigate]
 * @param {(title: string) => void} [options.setTitle]
 * @param {Location} [options.location]
 * @param {History} [options.history]
 * @returns {object} роутер
 */
export function createRouter({
    outlet,
    routes,
    notFoundView,
    defaultPath = '/catalog',
    isAuthenticated = () => false,
    context = {},
    onNavigate = () => {},
    setTitle = (title) => { globalThis.document.title = title; },
    location = globalThis.location,
    history = globalThis.history,
}) {
    let current = null;
    let renderToken = 0;
    let started = false;

    function navigate(path, { replace = false } = {}) {
        const target = normalizeHash(path);
        if (location.hash === target) {
            render({ reason: 'same' });
            return;
        }
        if (replace) {
            history.replaceState(null, '', target);
            render({ reason: 'replace' });
        } else {
            location.hash = target;
        }
    }

    function resolveRedirect(route, path, search) {
        if (!route) {
            return null;
        }
        if (route.auth && !isAuthenticated()) {
            const next = encodeURIComponent(`${path}${search}`);
            return `/login?next=${next}`;
        }
        if (route.guest && isAuthenticated()) {
            return defaultPath;
        }
        return null;
    }

    async function render({ reason = 'render', depth = 0 } = {}) {
        const token = ++renderToken;
        current?.abort?.abort();
        current?.dispose?.();
        current = null;

        const { path, query, search } = parseLocation(location.hash);
        const route = routes.find((candidate) => matchPath(candidate.path, path));
        const redirect = resolveRedirect(route, path, search);

        if (redirect) {
            if (depth >= 3) {
                outlet.replaceChildren(errorState(new Error('Цикл редиректов в маршрутах'), {
                    retry: () => render(),
                }));
                return;
            }
            // replaceState не вызывает hashchange — рендерим явно, сохраняя depth
            // как счётчик защит от цикла гардов.
            history.replaceState(null, '', normalizeHash(redirect));
            await render({ reason: 'redirect', depth: depth + 1 });
            return;
        }

        const controller = new AbortController();
        const pending = {
            route: route ?? null,
            path,
            query,
            abort: controller,
            dispose: null,
        };
        current = pending;
        outlet.replaceChildren(loadingState());

        let result;
        try {
            result = route
                ? await route.view({
                    ...context,
                    params: matchPath(route.path, path) ?? {},
                    query,
                    path,
                    signal: controller.signal,
                    navigate,
                    reload: () => render({ reason: 'reload' }),
                })
                : await notFoundView({
                    ...context,
                    path,
                    query,
                    signal: controller.signal,
                    navigate,
                });
        } catch (error) {
            if (controller.signal.aborted || token !== renderToken) {
                return;
            }
            console.error(`[router] ${path}:`, error);
            outlet.replaceChildren(errorState(error, { retry: () => render({ reason: 'retry' }) }));
            onNavigate(null, { path, query, reason });
            return;
        }

        if (token !== renderToken) {
            // Пока представление грузилось, пользователь ушёл на другой маршрут.
            return;
        }

        const node = isDomNode(result) ? result : result?.el ?? null;
        if (!node) {
            outlet.replaceChildren(errorState(new Error(`Представление ${path} не вернуло DOM`)));
            return;
        }

        outlet.replaceChildren(node);
        pending.dispose = typeof result?.dispose === 'function' ? result.dispose : null;
        // У DOM-узла есть собственное свойство title (атрибут), поэтому
        // заголовок страницы читаем только у объектного контракта { el, title }.
        const resultTitle = isDomNode(result) ? '' : (result?.title ?? '');
        const title = resultTitle || route?.title || '';
        setTitle(title ? `${title} · LMS` : 'LMS');
        onNavigate(route ?? null, { path, query, reason });
    }

    function start() {
        if (started) {
            return;
        }
        started = true;
        globalThis.addEventListener('hashchange', () => render({ reason: 'hashchange' }));
        if (!location.hash || location.hash === '#') {
            history.replaceState(null, '', normalizeHash(defaultPath));
        }
        render({ reason: 'start' });
    }

    return {
        start,
        navigate,
        render,
        reload: () => render({ reason: 'reload' }),
        get current() {
            return current;
        },
        get routes() {
            return routes;
        },
    };
}

function isDomNode(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const elementCtor = globalThis.Element;
    const fragmentCtor = globalThis.DocumentFragment;
    return (typeof elementCtor === 'function' && value instanceof elementCtor)
        || (typeof fragmentCtor === 'function' && value instanceof fragmentCtor)
        || (typeof value.nodeType === 'number' && typeof value.nodeName === 'string');
}
