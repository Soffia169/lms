/**
 * Экран входа.
 *
 * После успешного логина клиент сохраняет пару токенов и забирает профиль
 * (/auth/me) — из него берутся имя и актуальная роль. Роли в JWT могут быть
 * «старыми» после смены роли администратором: это отдельно подсвечивается
 * в профиле.
 */

import { actionButton, el, setBusy } from '../ui/dom.js';
import { createFields } from '../ui/forms.js';
import { alertBox } from '../ui/states.js';
import { toasts } from '../ui/toast.js';
import { ApiError, describeError, hintForError } from '../core/errors.js';
import { authPage, demoHint } from './auth-shell.js';

const DEMO = { email: 'admin@lms.local', password: 'Admin123!' };

/**
 * @param {object} ctx контекст приложения
 * @returns {HTMLElement}
 */
export function loginView(ctx) {
    const { auth, session, navigate } = ctx;
    const fields = createFields([
        {
            name: 'email',
            label: 'Email',
            type: 'email',
            required: true,
            autocomplete: 'username',
            placeholder: 'admin@lms.local',
        },
        {
            name: 'password',
            label: 'Пароль',
            type: 'password',
            required: true,
            autocomplete: 'current-password',
            placeholder: '••••••••',
        },
    ], { email: DEMO.email });

    const alertSlot = el('div', { 'aria-live': 'polite' });
    const submitButton = actionButton({ label: 'Войти' });

    const form = el('form', {
        class: 'auth-card__form',
        novalidate: true,
        onsubmit: (event) => {
            event.preventDefault();
            void submit();
        },
    },
    alertSlot,
    fields.element,
    submitButton,
    el('p', { class: 'hint', text: 'Access-токен живёт 15 минут и обновляется автоматически. Пароль хранится в BCrypt на сервере.' }));

    async function submit() {
        alertSlot.replaceChildren();
        if (Object.keys(fields.validate()).length > 0) {
            return;
        }
        setBusy(submitButton, true, 'Вход…');
        try {
            const { email, password } = fields.read();
            const tokens = await auth.login({ email, password });
            session.save({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
            const profile = await auth.me();
            session.updateUser(profile);
            toasts.success(`Вы вошли как ${profile.fullName || profile.email}`, 'Вход выполнен');
            navigate(nextPath(ctx.query?.next), { replace: true });
        } catch (error) {
            showError(error);
        } finally {
            setBusy(submitButton, false);
        }
    }

    function showError(error) {
        const items = [];
        if (error instanceof ApiError && error.isUnauthorized) {
            items.push('Неверный email или пароль.');
        }
        if (error instanceof ApiError && error.isNetwork) {
            items.push(`Адрес API: ${ctx.apiBase()}`);
        }
        alertSlot.replaceChildren(alertBox({
            type: 'danger',
            title: 'Не удалось войти',
            message: describeError(error),
            items: [...items, hintForError(error)].filter(Boolean),
        }));
        if (error instanceof ApiError && error.isNetwork) {
            alertSlot.appendChild(el('button', {
                type: 'button',
                class: 'btn btn--outline btn--sm',
                text: 'Настройки API',
                onclick: ctx.openSettings,
            }));
        }
    }

    const footer = el('p', { class: 'auth-card__footer' },
        'Нет аккаунта? ',
        el('a', { href: '#/register', text: 'Зарегистрироваться' }),
        ' — новая учётная запись получает роль STUDENT.');

    return authPage({
        eyebrow: 'этап 1 · ядро MVP',
        title: 'Вход в LMS',
        subtitle: 'Email и пароль, выданные при регистрации или администратором.',
        form,
        footer,
        extra: demoHint({
            credentials: DEMO,
            onFill: () => {
                fields.setValue('email', DEMO.email);
                fields.setValue('password', DEMO.password);
                fields.controls.get('email')?.focus();
            },
        }),
    });
}

/**
 * Безопасно разбирает `?next=` — только внутренний путь.
 *
 * @param {string|undefined} next
 * @returns {string}
 */
export function nextPath(next) {
    if (typeof next !== 'string' || next === '') {
        return '/catalog';
    }
    const decoded = next.startsWith('/') ? next : `/${next}`;
    // Защита от протокол-относительного URL (//evil.example).
    return decoded.startsWith('//') ? '/catalog' : decoded;
}
