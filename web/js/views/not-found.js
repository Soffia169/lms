/**
 * Экран 404: адрес в hash-навигации не совпал ни с одним маршрутом.
 */

import { el } from '../ui/dom.js';
import { emptyState } from '../ui/states.js';

/**
 * @param {object} ctx
 * @returns {{el: HTMLElement, title: string}}
 */
export function notFoundView(ctx) {
    const authenticated = ctx.session?.isAuthenticated?.() ?? false;
    return {
        title: 'Страница не найдена',
        el: el('div', { class: 'stack', style: { maxWidth: '640px', margin: '40px auto' } },
            emptyState({
                icon: 'alert',
                title: 'Страница не найдена',
                text: `Маршрут «${ctx.path ?? ''}» не существует. Возможно, ссылка устарела или в адресе опечатка.`,
                action: el('div', { class: 'row' },
                    el('a', {
                        class: 'btn btn--primary btn--sm',
                        href: authenticated ? '#/catalog' : '#/login',
                        text: authenticated ? 'В каталог' : 'Ко входу',
                    }),
                    el('a', { class: 'btn btn--outline btn--sm', href: '#/catalog', text: 'Каталог' })),
            })),
    };
}
