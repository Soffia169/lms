/**
 * Состояния экрана: загрузка, пустой список, ошибка.
 *
 * Используются роутером и представлениями, чтобы одинаковые ситуации
 * выглядели и объяснялись одинаково во всём интерфейсе.
 */

import { el } from './dom.js';
import { createIcon } from './icons.js';
import { ApiError, describeError, fieldErrorsOf, hintForError } from '../core/errors.js';

/**
 * @param {string} [label]
 * @returns {HTMLElement}
 */
export function loadingState(label = 'Загрузка…') {
    return el('div', { class: 'page-loading' },
        el('span', { class: 'spinner spinner--lg', 'aria-hidden': 'true' }),
        el('p', { text: label }));
}

/**
 * Скелетон каталога на время загрузки.
 *
 * @param {number} [count]
 * @returns {HTMLElement}
 */
export function skeletonCards(count = 6) {
    const grid = el('div', { class: 'course-grid', 'aria-busy': 'true', 'aria-label': 'Загрузка курсов' });
    for (let index = 0; index < count; index += 1) {
        grid.appendChild(el('div', { class: 'card' },
            el('div', { class: 'card__body stack stack--tight' },
                el('div', { class: 'skeleton', style: { height: '18px', width: '70%' } }),
                el('div', { class: 'skeleton', style: { height: '12px', width: '100%' } }),
                el('div', { class: 'skeleton', style: { height: '12px', width: '85%' } }),
                el('div', { class: 'skeleton', style: { height: '12px', width: '40%', marginTop: '8px' } }))));
    }
    return grid;
}

/**
 * Пустое состояние.
 *
 * @param {object} options
 * @param {string} [options.icon]
 * @param {string} options.title
 * @param {string} [options.text]
 * @param {Node|null} [options.action]
 * @returns {HTMLElement}
 */
export function emptyState({ icon = 'book', title, text = '', action = null }) {
    return el('div', { class: 'empty' },
        el('div', { class: 'empty__icon' }, createIcon(icon, { size: 22 })),
        el('p', { class: 'empty__title', text: title }),
        text ? el('p', { class: 'empty__text', text }) : null,
        action);
}

/**
 * Панель ошибки с человеческим описанием и путём восстановления.
 *
 * @param {unknown} error
 * @param {object} [options]
 * @param {() => void} [options.retry]
 * @param {() => void} [options.onLogin]
 * @returns {HTMLElement}
 */
export function errorState(error, { retry = null, onLogin = null } = {}) {
    const isAuthError = error instanceof ApiError && error.isUnauthorized;
    const fields = Object.entries(fieldErrorsOf(error));

    return el('div', { class: 'card', style: { maxWidth: '620px', margin: '32px auto' } },
        el('div', { class: 'card__body stack' },
            el('div', { class: 'row', style: { color: 'var(--danger)' } },
                createIcon('alert', { size: 22 }),
                el('h2', { text: isAuthError ? 'Требуется вход' : 'Не удалось загрузить данные' })),
            el('p', { class: 'muted', text: describeError(error) }),
            hintForError(error) ? el('p', { class: 'hint', text: hintForError(error) }) : null,
            fields.length > 0
                ? el('ul', { class: 'alert__list' },
                    ...fields.map(([field, message]) => el('li', { text: `${field}: ${message}` })))
                : null,
            el('div', { class: 'row' },
                retry ? el('button', {
                    type: 'button',
                    class: 'btn btn--primary',
                    text: 'Повторить',
                    onclick: retry,
                }) : null,
                isAuthError && onLogin
                    ? el('button', {
                        type: 'button',
                        class: 'btn btn--outline',
                        text: 'Войти',
                        onclick: onLogin,
                    })
                    : null)));
}

/**
 * Инлайновый алерт (для форм и панелей).
 *
 * @param {object} options
 * @param {'info'|'warning'|'danger'|'success'} [options.type]
 * @param {string} [options.title]
 * @param {string} options.message
 * @param {string[]} [options.items]
 * @param {() => void} [options.onClose]
 * @returns {HTMLElement}
 */
export function alertBox({ type = 'info', title = '', message = '', items = [], onClose = null }) {
    return el('div', { class: `alert alert--${type}`, role: type === 'danger' ? 'alert' : 'status' },
        title || onClose
            ? el('div', { class: 'row row--between' },
                el('span', { class: 'alert__title', text: title }),
                onClose
                    ? el('button', {
                        type: 'button',
                        class: 'btn btn--ghost btn--sm',
                        text: 'Скрыть',
                        onclick: onClose,
                    })
                    : null)
            : null,
        message ? el('p', { text: message }) : null,
        items.length > 0
            ? el('ul', { class: 'alert__list' }, ...items.map((item) => el('li', { text: item })))
            : null);
}
