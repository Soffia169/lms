/**
 * Общий каркас приложения: шапка с навигацией и подвал со состоянием API.
 *
 * Каркас один на все страницы, поэтому состояние (активный маршрут, статус API,
 * тема) живёт здесь, а представления занимаются только содержимым.
 */

import { el } from './dom.js';
import { createIcon } from './icons.js';
import { initials, roleLabel, roleTone } from '../core/format.js';
import { isAbsoluteApiBase, swaggerAuthUrl } from '../core/config.js';

/**
 * Пункты навигации. «Мои курсы» есть только у студентов: записаться и вести
 * прогресс может лишь роль STUDENT (так же проверяет enrollment-service).
 *
 * @param {object} session store из core/session.js
 * @returns {Array<{name: string, label: string, href: string, icon: string}>}
 */
function navItems(session) {
    const items = [
        { name: 'catalog', label: 'Каталог', href: '/catalog', icon: 'book' },
    ];
    if (session.hasRole('STUDENT')) {
        items.push({ name: 'my-courses', label: 'Мои курсы', href: '/my-courses', icon: 'bookmark' });
    }
    items.push({ name: 'profile', label: 'Профиль', href: '/profile', icon: 'user' });
    return items;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.header контейнер шапки
 * @param {HTMLElement} options.footer контейнер подвала
 * @param {object} options.session store из core/session.js
 * @param {object} options.theme из ui/theme.js
 * @param {() => string} options.apiBase текущий адрес API
 * @param {() => Promise<void>} options.onLogout
 * @param {() => void} options.onOpenSettings
 * @returns {object} layout
 */
export function createLayout({ header, footer, session, theme, apiBase, onLogout, onOpenSettings }) {
    const state = {
        active: null,
        status: { state: 'checking', label: 'проверка соединения…', title: '' },
        // Счётчик «новых» уведомлений — клиентский (см. core/notifications.js).
        notifications: 0,
    };

    let statusDotNode = null;
    let statusLabelNode = null;
    let notificationBadgeNode = null;

    function render() {
        header.replaceChildren(headerContent());
        renderFooter();
        updateNotificationBadge();
    }

    /**
     * Сколько «новых» уведомлений показывает колокольчик.
     *
     * @param {number} count
     * @returns {void}
     */
    function setNotificationCount(count) {
        state.notifications = Number.isFinite(Number(count)) ? Math.max(0, Math.trunc(Number(count))) : 0;
        updateNotificationBadge();
    }

    function updateNotificationBadge() {
        if (!notificationBadgeNode) {
            return;
        }
        const value = state.notifications;
        notificationBadgeNode.hidden = value === 0;
        notificationBadgeNode.textContent = value > 99 ? '99+' : String(value);
        const link = notificationBadgeNode.closest('[data-notifications]');
        if (link) {
            link.title = value > 0 ? `Уведомления: ${value} новых` : 'Уведомления';
            link.setAttribute('aria-label', value > 0 ? `Уведомления, новых: ${value}` : 'Уведомления');
        }
    }

    function setActive(routeName) {
        state.active = routeName;
        for (const link of header.querySelectorAll('[data-route]')) {
            if (link.dataset.route === state.active) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        }
    }

    function setApiStatus(status) {
        state.status = { ...state.status, ...status };
        updateStatusNode();
    }

    function renderFooter() {
        statusDotNode = el('span', {
            class: 'status-dot',
            dataset: { state: state.status.state },
            title: state.status.title || '',
        }, el('span', { text: 'API' }), el('code', { text: apiBase() }));
        statusLabelNode = el('span', { text: state.status.label });

        footer.replaceChildren(el('div', { class: 'site-footer' },
            el('div', { class: 'site-footer__inner' },
                el('span', { text: 'LMS · этап 2 — обучение и события' }),
                statusDotNode,
                statusLabelNode,
                el('span', { class: 'site-footer__spacer' }),
                el('a', {
                    href: swaggerAuthUrl(apiBase()),
                    target: '_blank',
                    rel: 'noreferrer noopener',
                    text: 'Swagger auth',
                }),
                el('a', {
                    href: 'http://localhost:8082/swagger-ui.html',
                    target: '_blank',
                    rel: 'noreferrer noopener',
                    text: 'Swagger course',
                }),
                el('button', {
                    type: 'button',
                    class: 'btn btn--ghost btn--sm',
                    onclick: onOpenSettings,
                }, createIcon('settings', { size: 15 }), el('span', { text: 'Настройки API' })))));
    }

    function updateStatusNode() {
        if (statusDotNode) {
            statusDotNode.dataset.state = state.status.state;
            statusDotNode.title = state.status.title || '';
        }
        if (statusLabelNode) {
            statusLabelNode.textContent = state.status.label;
        }
    }

    function headerContent() {
        const authenticated = session.isAuthenticated();

        return el('div', { class: 'topbar' },
            el('div', { class: 'topbar__inner' },
                el('a', {
                    class: 'brand',
                    href: authenticated ? '#/catalog' : '#/login',
                    'aria-label': 'LMS — на главную',
                },
                el('span', { class: 'brand__mark', 'aria-hidden': 'true', text: 'LM' }),
                el('span', { class: 'brand__text' },
                    el('span', { class: 'brand__title', text: 'LMS' }),
                    el('span', { class: 'brand__subtitle', text: 'учебная платформа' }))),
                el('nav', { class: 'topbar__nav', 'aria-label': 'Основная навигация' },
                    ...navItems(session).map((item) => navLink(item, authenticated))),
                el('span', { class: 'topbar__spacer' }),
                el('div', { class: 'topbar__actions' },
                    authenticated ? notificationBell() : null,
                    themeButton(),
                    authenticated ? userArea() : guestArea())));
    }

    function navLink(item, authenticated) {
        if (!authenticated) {
            return null;
        }
        return el('a', {
            class: 'nav-link',
            href: `#${item.href}`,
            'data-route': item.name,
            'aria-current': state.active === item.name ? 'page' : null,
        }, el('span', { class: 'nav-link__icon' }, createIcon(item.icon, { size: 16 })), el('span', { text: item.label }));
    }

    function notificationBell() {
        notificationBadgeNode = el('span', {
            class: 'notification-badge',
            hidden: true,
            'aria-hidden': 'true',
        });
        return el('a', {
            class: 'btn btn--ghost btn--icon notification-bell',
            href: '#/notifications',
            'data-notifications': '',
            title: 'Уведомления',
            'aria-label': 'Уведомления',
        }, createIcon('bell', { size: 18 }), notificationBadgeNode);
    }

    function themeButton() {
        const dark = theme.get() === 'dark';
        return el('button', {
            type: 'button',
            class: 'btn btn--ghost btn--icon',
            title: dark ? 'Светлая тема' : 'Тёмная тема',
            'aria-label': dark ? 'Включить светлую тему' : 'Включить тёмную тему',
            onclick: () => theme.toggle(),
        }, createIcon(dark ? 'sun' : 'moon', { size: 18 }));
    }

    function userArea() {
        const user = session.user() ?? {};
        const role = user.role ?? session.roles()[0] ?? '';
        const name = user.fullName || user.email || 'Пользователь';

        return el('div', { class: 'row', style: { gap: '6px' } },
            el('a', { class: 'user-chip', href: '#/profile', title: `${name} · ${roleLabel(role)}` },
                el('span', { class: 'avatar', 'aria-hidden': 'true', text: initials(name) }),
                el('span', { class: 'user-chip__meta' },
                    el('span', { class: 'user-chip__name', text: name }),
                    el('span', { class: 'user-chip__role', text: roleLabel(role) })),
                el('span', { class: `badge badge--${roleTone(role)}`, text: role || '—' })),
            el('button', {
                type: 'button',
                class: 'btn btn--ghost btn--icon',
                title: 'Выйти',
                'aria-label': 'Выйти',
                onclick: onLogout,
            }, createIcon('logout', { size: 18 })));
    }

    function guestArea() {
        return el('div', { class: 'row', style: { gap: '8px' } },
            el('a', { class: 'btn btn--outline', href: '#/login', text: 'Войти' }),
            el('a', { class: 'btn btn--primary', href: '#/register', text: 'Регистрация' }));
    }

    render();

    return {
        render,
        setActive,
        setApiStatus,
        setNotificationCount,
        get apiBase() {
            return apiBase();
        },
        isAbsoluteApiBase: () => isAbsoluteApiBase(apiBase()),
    };
}
