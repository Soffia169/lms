/**
 * Тосты: короткие уведомления о результате действий.
 *
 * Контейнер живёт в index.html (#toasts) с aria-live, поэтому сообщения
 * озвучиваются скринридером. Одинаковые сообщения не дублируются подряд.
 */

import { el } from './dom.js';
import { createIcon } from './icons.js';

const ICONS = {
    success: 'check',
    error: 'alert',
    warning: 'alert',
    info: 'alert',
};

let lastKey = '';
let lastAt = 0;

/**
 * @param {object} options
 * @param {() => HTMLElement|null} [options.getContainer]
 * @returns {{show: Function, success: Function, error: Function, info: Function, warn: Function, clear: Function}}
 */
export function createToasts({ getContainer = () => document.getElementById('toasts') } = {}) {
    function show({ title = '', message = '', type = 'info', timeout = 5000 } = {}) {
        const host = getContainer();
        if (!host) {
            return null;
        }

        const key = `${type}|${title}|${message}`;
        const now = Date.now();
        if (key === lastKey && now - lastAt < 1500) {
            return null;
        }
        lastKey = key;
        lastAt = now;

        const toast = el('div', { class: 'toast', dataset: { type }, role: type === 'error' ? 'alert' : 'status' },
            createIcon(ICONS[type] ?? 'alert', { size: 18 }),
            el('div', { class: 'grow' },
                title ? el('div', { class: 'toast__title', text: title }) : null,
                message ? el('div', { class: 'toast__message', text: message }) : null),
            el('button', {
                type: 'button',
                class: 'toast__close',
                'aria-label': 'Закрыть уведомление',
                text: '×',
                onclick: () => dismiss(),
            }));

        let timer = null;
        function dismiss() {
            clearTimeout(timer);
            toast.remove();
        }

        host.appendChild(toast);
        if (timeout > 0) {
            timer = setTimeout(dismiss, timeout);
        }
        return toast;
    }

    function clear() {
        const host = getContainer();
        if (host) {
            host.replaceChildren();
        }
    }

    return {
        show,
        clear,
        success: (message, title = '') => show({ message, title, type: 'success' }),
        error: (message, title = 'Ошибка') => show({ message, title, type: 'error', timeout: 8000 }),
        warn: (message, title = 'Внимание') => show({ message, title, type: 'warning', timeout: 6500 }),
        info: (message, title = '') => show({ message, title, type: 'info' }),
    };
}

export const toasts = createToasts();
