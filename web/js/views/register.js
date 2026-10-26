/**
 * Экран регистрации.
 *
 * Бэкенд регистрирует всегда с ролью STUDENT, поэтому после создания
 * аккаунта сразу выполняем вход: пользователь не должен вводить пароль дважды.
 * Роль INSTRUCTOR выдаёт администратор (PATCH /api/auth/users/{id}/role).
 */

import { actionButton, el, setBusy } from '../ui/dom.js';
import { createFields } from '../ui/forms.js';
import { alertBox } from '../ui/states.js';
import { toasts } from '../ui/toast.js';
import { ApiError, describeError, fieldErrorsOf, hintForError } from '../core/errors.js';
import { authPage } from './auth-shell.js';

/**
 * @param {object} ctx контекст приложения
 * @returns {HTMLElement}
 */
export function registerView(ctx) {
    const { auth, session, navigate } = ctx;

    const fields = createFields([
        {
            name: 'fullName',
            label: 'Имя и фамилия',
            required: true,
            maxLength: 200,
            autocomplete: 'name',
            placeholder: 'Иван Петров',
        },
        {
            name: 'email',
            label: 'Email',
            type: 'email',
            required: true,
            maxLength: 320,
            autocomplete: 'email',
            placeholder: 'student@lms.local',
        },
        {
            name: 'password',
            label: 'Пароль',
            type: 'password',
            required: true,
            minLength: 8,
            maxLength: 100,
            autocomplete: 'new-password',
            hint: 'Минимум 8 символов — требование auth-service.',
        },
        {
            name: 'confirmPassword',
            label: 'Повторите пароль',
            type: 'password',
            required: true,
            autocomplete: 'new-password',
            hint: 'Проверяется только в браузере и не отправляется на сервер.',
        },
    ]);

    const alertSlot = el('div', { 'aria-live': 'polite' });
    const submitButton = actionButton({ label: 'Создать аккаунт' });

    const form = el('form', {
        class: 'auth-card__form',
        novalidate: true,
        onsubmit: (event) => {
            event.preventDefault();
            void submit();
        },
    }, alertSlot, fields.element, submitButton);

    async function submit() {
        alertSlot.replaceChildren();
        const values = fields.read();
        const errors = fields.validate();

        if (!errors.confirmPassword && values.password !== values.confirmPassword) {
            fields.setErrors({ confirmPassword: 'Пароли не совпадают' });
        }
        if (Object.keys(fields.validate()).length > 0) {
            return;
        }

        setBusy(submitButton, true, 'Создание…');
        try {
            await auth.register({
                email: values.email,
                password: values.password,
                fullName: values.fullName,
            });
            const tokens = await auth.login({ email: values.email, password: values.password });
            session.save({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
            const profile = await auth.me();
            session.updateUser(profile);
            toasts.success(`Аккаунт создан, роль ${profile.role}`, 'Готово');
            navigate('/catalog', { replace: true });
        } catch (error) {
            const leftover = fields.setErrors(fieldErrorsOf(error));
            const items = [];
            if (error instanceof ApiError && error.isConflict) {
                items.push('Пользователь с таким email уже зарегистрирован — войдите.');
            }
            if (error instanceof ApiError && error.isValidation) {
                items.push(...Object.entries(leftover).map(([field, message]) => `${field}: ${message}`));
            }
            items.push(hintForError(error));
            alertSlot.replaceChildren(alertBox({
                type: 'danger',
                title: 'Не удалось зарегистрироваться',
                message: describeError(error),
                items: items.filter(Boolean),
            }));
            if (error instanceof ApiError && error.isConflict) {
                alertSlot.appendChild(el('a', { class: 'btn btn--outline btn--sm', href: '#/login', text: 'Перейти ко входу' }));
            }
        } finally {
            setBusy(submitButton, false);
        }
    }

    return authPage({
        eyebrow: 'этап 1 · ядро MVP',
        title: 'Регистрация',
        subtitle: 'Новая учётная запись создаётся с ролью STUDENT.',
        form,
        footer: el('p', { class: 'auth-card__footer' },
            'Уже есть аккаунт? ',
            el('a', { href: '#/login', text: 'Войти' }),
            '. Инструктором пользователя назначает администратор.'),
    });
}
