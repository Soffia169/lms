/**
 * Общая оболочка экранов входа и регистрации.
 *
 * Слева — что это за платформа и что уже работает (этап 1), справа — форма.
 * На узких экранах остаётся только форма.
 */

import { el } from '../ui/dom.js';
import { createIcon } from '../ui/icons.js';

const FEATURES = [
    { icon: 'shield', text: 'JWT RS256, refresh-ротация и роли STUDENT / INSTRUCTOR / ADMIN' },
    { icon: 'book', text: 'Курсы, модули и уроки: создание, публикация, редактирование' },
    { icon: 'bookmark', text: 'Запись на курс и прогресс уроков для студентов' },
    { icon: 'bell', text: 'Уведомления о регистрации, записи и завершении уроков' },
];

/**
 * @param {object} options
 * @param {string} options.eyebrow
 * @param {string} options.title
 * @param {string} options.subtitle
 * @param {Node} options.form
 * @param {Node} [options.footer]
 * @param {Node} [options.extra]
 * @returns {HTMLElement}
 */
export function authPage({ eyebrow, title, subtitle, form, footer = null, extra = null }) {
    return el('div', { class: 'auth-page' },
        el('section', { class: 'auth-page__intro' },
            el('span', { class: 'eyebrow' }, createIcon('layers', { size: 14 }), el('span', { text: eyebrow })),
            el('h1', { class: 'auth-page__title', text: 'Платформа обучения LMS' }),
            el('p', { class: 'auth-page__lead', text: 'Инструкторы собирают курсы из модулей и уроков, студенты видят каталог. Ниже — документация архитектуры и OpenAPI сервисов.' }),
            el('ul', { class: 'feature-list' },
                ...FEATURES.map((feature) => el('li', null,
                    el('span', { class: 'feature-list__icon' }, createIcon(feature.icon, { size: 15 })),
                    el('span', { text: feature.text }))))),
        el('section', { class: 'card auth-card' },
            el('div', { class: 'auth-card__head' },
                el('h2', { class: 'auth-card__title', text: title }),
                el('p', { class: 'auth-card__subtitle', text: subtitle })),
            form,
            footer,
            extra));
}

/**
 * Подсказка с демо-учётными данными администратора.
 *
 * @param {object} options
 * @param {{email: string, password: string}} options.credentials
 * @param {() => void} options.onFill
 * @returns {HTMLElement}
 */
export function demoHint({ credentials, onFill }) {
    return el('div', { class: 'demo-hint' },
        el('div', { text: 'Демо-учётка из Flyway-миграции V2__seed_admin.sql (только для локальной среды):' }),
        el('div', { class: 'demo-hint__row' },
            el('code', { text: `${credentials.email} / ${credentials.password}` }),
            el('button', {
                type: 'button',
                class: 'btn btn--outline btn--sm',
                text: 'Подставить',
                onclick: onFill,
            })));
}
