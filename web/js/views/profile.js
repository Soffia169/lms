/**
 * Профиль: кто вошёл, состояние сессии, настройки API и админ-панель.
 *
 * Это единственное место, где пользователь видит технические детали (id,
 * TTL токена, адрес API): они нужны для отладки pet-проекта и для демонстрации
 * работы refresh-ротации.
 */

import { actionButton, el } from '../ui/dom.js';
import { createIcon } from '../ui/icons.js';
import { createFields } from '../ui/forms.js';
import { alertBox } from '../ui/states.js';
import { toasts } from '../ui/toast.js';
import {
    formatDateTime,
    formatDuration,
    initials,
    roleLabel,
    roleTone,
    shortId,
} from '../core/format.js';
import { isAbsoluteApiBase, swaggerAuthUrl } from '../core/config.js';
import { describeError } from '../core/errors.js';

const ROLES = ['STUDENT', 'INSTRUCTOR', 'ADMIN'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {object} ctx контекст приложения
 * @returns {{el: HTMLElement, title: string, dispose: () => void}}
 */
export function profileView(ctx) {
    const { session, client, auth, courses, logout, reload, openSettings } = ctx;
    const snapshot = session.get();
    const user = snapshot?.user ?? {};
    const roles = session.roles();

    let tokenTimer = null;

    const expiryText = el('span', { class: 'mono', text: '—' });
    const expiryBar = el('div', { class: 'progress__bar', style: { width: '0%' } });

    const sessionPanel = el('section', { class: 'card panel' },
        el('div', { class: 'panel__head' },
            el('div', { class: 'panel__title' }, createIcon('key', { size: 18 }), el('h2', { text: 'Сессия' })),
            el('span', {
                class: `badge badge--dot ${session.isAuthenticated() ? 'badge--success' : 'badge--danger'}`,
                text: session.isAuthenticated() ? 'активна' : 'нет сессии',
            })),
        el('p', { class: 'panel__subtitle', text: 'Access-токен живёт 15 минут, refresh-токен — 7 дней и ротируется при каждом обновлении.' }),
        el('div', { class: 'token-state' },
            createIcon('key', { size: 16 }),
            el('span', { text: 'Access истекает через' }),
            expiryText),
        el('div', { class: 'progress', role: 'presentation' }, expiryBar),
        el('dl', { class: 'kv' },
            el('dt', { text: 'Выдан' }),
            el('dd', { text: formatDateTime(snapshot?.savedAt ? new Date(snapshot.savedAt).toISOString() : null) }),
            el('dt', { text: 'Истекает' }),
            el('dd', { text: formatDateTime(snapshot?.expiresAt ? new Date(snapshot.expiresAt).toISOString() : null) }),
            el('dt', { text: 'Роли в токене' }),
            el('dd', { text: (snapshot?.tokenRoles ?? []).map(roleLabel).join(' · ') || '—' }),
            el('dt', { text: 'Refresh-токен' }),
            el('dd', { text: snapshot?.refreshToken ? `есть (${snapshot.refreshToken.length} символов)` : '—' })),
        el('div', { class: 'row' },
            actionButton({
                type: 'button',
                label: 'Обновить токены',
                variant: 'outline',
                icon: createIcon('refresh', { size: 16 }),
                onClick: () => {
                    void rotateTokens();
                },
            }),
            el('button', {
                type: 'button',
                class: 'btn btn--ghost',
                onclick: () => {
                    void logout();
                },
            }, createIcon('logout', { size: 16 }), el('span', { text: 'Выйти' }))),
        el('p', {
            class: 'hint',
            text: 'Обновление демонстрирует ротацию: старый refresh-токен отзывается, выдаётся новый. Повторное предъявление отозванного токена гасит все сессии пользователя.',
        }));

    const identityPanel = el('section', { class: 'card panel' },
        el('div', { class: 'panel__head' },
            el('div', { class: 'panel__title' }, createIcon('user', { size: 18 }), el('h2', { text: 'Профиль' }))),
        el('div', { class: 'identity' },
            el('div', { class: 'identity__avatar', 'aria-hidden': 'true', text: initials(user.fullName || user.email) }),
            el('div', { class: 'grow' },
                el('div', { class: 'identity__name', text: user.fullName || '—' }),
                el('div', { class: 'identity__email', text: user.email || '—' }))),
        el('div', { class: 'row' }, ...roles.map((role) => el('span', {
            class: `badge badge--${roleTone(role)}`,
            text: roleLabel(role),
        }))),
        el('dl', { class: 'kv' },
            el('dt', { text: 'userId' }),
            el('dd', { class: 'mono', title: user.id ?? '', text: user.id ?? '—' }),
            el('dt', { text: 'Профиль из' }),
            el('dd', { text: 'GET /api/auth/me' })),
        el('p', { class: 'hint', text: 'Роль выдаёт администратор через PATCH /api/auth/users/{id}/role. После смены роли нужно перелогиниться: роли берутся из токена.' }));

    const apiPanel = el('section', { class: 'card panel' },
        el('div', { class: 'panel__head' },
            el('div', { class: 'panel__title' }, createIcon('link', { size: 18 }), el('h2', { text: 'Подключение к API' })),
            el('span', { class: 'badge', text: isAbsoluteApiBase(ctx.apiBase()) ? 'внешний' : 'same-origin' })),
        el('dl', { class: 'kv' },
            el('dt', { text: 'Базовый адрес' }),
            el('dd', { class: 'mono', text: ctx.apiBase() })),
        el('p', {
            class: 'hint',
            text: isAbsoluteApiBase(ctx.apiBase())
                ? 'UI открыт отдельным сервером: запросы идут напрямую в gateway по CORS-политике.'
                : 'UI и API отдаются с одного origin (nginx проксирует /api на gateway) — CORS не участвует.',
        }),
        el('div', { class: 'row' },
            el('button', {
                type: 'button',
                class: 'btn btn--outline',
                onclick: openSettings,
            }, createIcon('settings', { size: 16 }), el('span', { text: 'Настройки API' })),
            actionButton({
                type: 'button',
                label: 'Проверить соединение',
                variant: 'ghost',
                icon: createIcon('refresh', { size: 16 }),
                onClick: () => {
                    void checkConnection();
                },
            })),
        el('p', { class: 'hint' }, 'Swagger UI: ', el('a', {
            href: swaggerAuthUrl(ctx.apiBase()),
            target: '_blank',
            rel: 'noreferrer noopener',
            text: 'auth-service',
        }), ' · ', el('a', {
            href: 'http://localhost:8082/swagger-ui.html',
            target: '_blank',
            rel: 'noreferrer noopener',
            text: 'course-service',
        })));

    const children = [identityPanel, sessionPanel, apiPanel];

    if (session.isAdmin()) {
        children.push(adminPanel());
    }

    children.push(stagePanel());

    const root = el('div', { class: 'stack' },
        el('div', { class: 'page-head' },
            el('div', { class: 'page-head__text' },
                el('h1', { class: 'page-head__title', text: 'Профиль' }),
                el('p', { class: 'page-head__subtitle', text: 'Кто вошёл, сколько живёт сессия и как UI подключён к gateway.' }))),
        staleRoleWarning(),
        el('div', { class: 'profile-grid' }, ...children));

    startTokenTimer();

    function staleRoleWarning() {
        const fromToken = snapshot?.tokenRoles ?? [];
        const currentRole = user.role ? String(user.role).toUpperCase() : '';
        if (currentRole && !fromToken.includes(currentRole)) {
            return alertBox({
                type: 'warning',
                title: 'Роль изменилась',
                message: `В токене роль ${fromToken.map(roleLabel).join(' · ') || 'отсутствует'}, а в профиле — ${roleLabel(currentRole)}. Выйдите и войдите снова, чтобы получить новые права.`,
            });
        }
        return null;
    }

    async function rotateTokens() {
        try {
            await client.refreshAccessToken(session.accessToken());
            toasts.success('Пара токенов обновлена: refresh-токен ротирован', 'Готово');
            reload();
        } catch (error) {
            toasts.error(describeError(error), 'Не удалось обновить токены');
        }
    }

    async function checkConnection() {
        const result = await ctx.pingApi();
        if (result.ok) {
            toasts.success(`Gateway и auth-service отвечают (${result.latencyMs} мс)`, 'Соединение есть');
        } else {
            toasts.error(describeError(result.error), 'API недоступен');
        }
    }

    function startTokenTimer() {
        const total = snapshot?.expiresAt && snapshot?.savedAt
            ? Math.max(1, snapshot.expiresAt - snapshot.savedAt)
            : 15 * 60 * 1000;

        function tick() {
            const left = session.msUntilExpiry();
            if (left === null) {
                expiryText.textContent = '—';
                expiryBar.style.width = '0%';
                return;
            }
            expiryText.textContent = formatDuration(left);
            const percent = Math.max(0, Math.min(100, (left / total) * 100));
            expiryBar.style.width = `${percent.toFixed(1)}%`;
            expiryBar.dataset.low = left < 120_000 ? 'true' : 'false';
        }

        tick();
        tokenTimer = setInterval(tick, 1_000);
    }

    function adminPanel() {
        const fields = createFields([
            {
                name: 'userId',
                label: 'userId пользователя',
                required: true,
                placeholder: '00000000-0000-0000-0000-000000000000',
                hint: 'Списка всех пользователей на этапе 2 нет: id можно скопировать здесь (из подсказок ниже) или со страницы курса.',
                autocomplete: 'off',
            },
            {
                name: 'role',
                label: 'Новая роль',
                type: 'select',
                required: true,
                options: ROLES.map((role) => ({ value: role, label: roleLabel(role) })),
            },
        ], { role: 'INSTRUCTOR' });

        const resultSlot = el('div', { 'aria-live': 'polite' });
        const quickPicks = el('div', { class: 'quick-picks', 'aria-label': 'Известные пользователи' });
        const submit = actionButton({ type: 'submit', label: 'Изменить роль' });

        const form = el('form', {
            class: 'stack stack--tight',
            novalidate: true,
            onsubmit: (event) => {
                event.preventDefault();
                void submitChange();
            },
        },
        resultSlot,
        fields.element,
        quickPicks,
        el('div', { class: 'row' }, submit));

        void loadKnownUsers();

        async function loadKnownUsers() {
            try {
                const list = await courses.list({});
                const seen = new Map();
                for (const course of Array.isArray(list) ? list : []) {
                    seen.set(String(course.instructorId), course.title);
                }
                for (const [id] of seen) {
                    quickPicks.appendChild(el('button', {
                        type: 'button',
                        class: 'quick-pick',
                        title: seen.get(id),
                        text: shortId(id, 12),
                        onclick: () => fields.setValue('userId', id),
                    }));
                }
                if (seen.size === 0) {
                    quickPicks.appendChild(el('span', { class: 'hint', text: 'Курсов ещё нет — известных пользователей не найдено.' }));
                }
            } catch {
                // Список — подсказка, а не обязательная часть: молча пропускаем.
            }
        }

        async function submitChange() {
            resultSlot.replaceChildren();
            const errors = fields.validate();
            const values = fields.read();
            if (!errors.userId && !UUID_PATTERN.test(String(values.userId ?? ''))) {
                fields.setErrors({ userId: 'Ожидается UUID' });
            }
            if (Object.keys(fields.validate()).length > 0) {
                return;
            }

            submit.disabled = true;
            try {
                const updated = await auth.changeRole(values.userId.trim(), values.role);
                const self = String(updated.id) === String(user.id);
                resultSlot.replaceChildren(alertBox({
                    type: 'success',
                    title: 'Роль обновлена',
                    message: `${updated.email} — теперь ${roleLabel(updated.role)}.`,
                    items: [
                        self
                            ? 'Вы изменили собственную роль: выйдите и войдите заново, чтобы получить новые права.'
                            : 'Пользователю нужно перелогиниться: роли берутся из access-токена.',
                    ],
                }));
                toasts.success(`${updated.email}: ${roleLabel(updated.role)}`, 'Роль изменена');
                if (self) {
                    void logout();
                }
            } catch (error) {
                resultSlot.replaceChildren(alertBox({
                    type: 'danger',
                    title: 'Не удалось изменить роль',
                    message: describeError(error),
                }));
            } finally {
                submit.disabled = false;
            }
        }

        return el('section', { class: 'card panel' },
            el('div', { class: 'panel__head' },
                el('div', { class: 'panel__title' }, createIcon('shield', { size: 18 }), el('h2', { text: 'Администрирование' })),
                el('span', { class: 'badge badge--accent', text: 'ADMIN' })),
            el('p', { class: 'panel__subtitle', text: 'PATCH /api/auth/users/{userId}/role — доступно только администратору.' }),
            form);
    }

    function stagePanel() {
        return el('section', { class: 'card panel' },
            el('div', { class: 'panel__head' },
                el('div', { class: 'panel__title' }, createIcon('layers', { size: 18 }), el('h2', { text: 'Что уже работает' }))),
            el('ul', { class: 'alert__list' },
                el('li', { text: 'Регистрация, вход, refresh-ротация, выход, роли' }),
                el('li', { text: 'CRUD курсов, модулей и уроков, публикация' }),
                el('li', { text: 'Проверка JWT на gateway и в каждом сервисе' }),
                el('li', { text: 'Запись на курс, прогресс уроков, «Мои курсы»' }),
                el('li', { text: 'Колокольчик уведомлений и экран событий' })),
            el('p', { class: 'hint', text: 'Дальше по roadmap: оценивание (этап 3), медиа (этап 4).' }),
            el('div', { class: 'row' },
                el('a', { class: 'btn btn--outline btn--sm', href: '#/catalog', text: 'Перейти в каталог' })));
    }

    return {
        el: root,
        title: 'Профиль',
        dispose: () => {
            if (tokenTimer) {
                clearInterval(tokenTimer);
                tokenTimer = null;
            }
        },
    };
}
