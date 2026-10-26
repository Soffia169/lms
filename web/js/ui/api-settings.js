/**
 * Диалог «Настройки API».
 *
 * Нужен для двух сценариев:
 *   1. UI открыт отдельным статическим сервером (режим разработки) — надо
 *      указать абсолютный адрес gateway, например http://localhost:8080/api;
 *   2. отладка: быстро проверить, что выбранный адрес отвечает.
 */

import { el } from './dom.js';
import { createIcon } from './icons.js';
import { openModal } from './modal.js';
import { alertBox } from './states.js';
import { DEFAULT_API_BASE, isAbsoluteApiBase, normalizeApiBase } from '../core/config.js';
import { httpRequest } from '../core/http.js';
import { describeError } from '../core/errors.js';

/**
 * @param {object} options
 * @param {string} options.currentBase
 * @param {(base: string) => void} options.onSave
 * @param {() => void} [options.onReset]
 * @returns {void}
 */
export function openApiSettings({ currentBase, onSave, onReset = () => {} }) {
    const input = el('input', {
        id: 'api-base-input',
        class: 'input',
        type: 'text',
        value: currentBase,
        spellcheck: 'false',
        autocomplete: 'off',
        'aria-label': 'Базовый адрес API',
    });
    const statusSlot = el('div', { 'aria-live': 'polite' });

    const checkButton = el('button', {
        type: 'button',
        class: 'btn btn--outline',
    }, createIcon('refresh', { size: 15 }), el('span', { text: 'Проверить' }));

    const resetButton = el('button', {
        type: 'button',
        class: 'btn btn--ghost',
        text: 'По умолчанию',
    });

    const saveButton = el('button', {
        type: 'button',
        class: 'btn btn--primary',
    }, createIcon('check', { size: 15 }), el('span', { text: 'Сохранить' }));

    const { close } = openModal({
        title: 'Настройки API',
        description: 'Адрес, по которому интерфейс обращается к gateway.',
        body: el('div', { class: 'stack stack--tight' },
            statusSlot,
            el('div', { class: 'field' },
                el('label', { class: 'field__label', for: 'api-base-input' }, el('span', { text: 'Базовый адрес' })),
                input,
                el('p', {
                    class: 'hint',
                    text: 'По умолчанию /api — nginx из docker compose проксирует этот путь на gateway-service. Для статического сервера разработки укажите http://localhost:8080/api.',
                })),
            el('p', {
                class: 'hint',
                text: `Значение хранится в localStorage (lms.apiBase) и переопределяет window.__LMS_CONFIG__.apiBase. По умолчанию: ${DEFAULT_API_BASE}.`,
            })),
        footer: el('div', { class: 'row', style: { marginLeft: 'auto' } },
            checkButton,
            resetButton,
            saveButton),
    });

    // Связываем label с input: id задан при создании элемента.
    checkButton.addEventListener('click', () => {
        void runCheck();
    });

    resetButton.addEventListener('click', () => {
        onReset();
        close();
    });

    saveButton.addEventListener('click', () => {
        const next = normalizeApiBase(input.value);
        if (!isValidBase(next)) {
            statusSlot.replaceChildren(alertBox({
                type: 'danger',
                message: 'Адрес должен начинаться с / или http(s)://',
            }));
            return;
        }
        onSave(next);
        close();
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            saveButton.click();
        }
    });

    async function runCheck() {
        const next = normalizeApiBase(input.value);
        statusSlot.replaceChildren(alertBox({ type: 'info', message: `Проверяю ${next} …` }));
        checkButton.disabled = true;
        const startedAt = Date.now();
        try {
            await httpRequest(`${next}/auth/.well-known/jwks.json`, { timeoutMs: 4_000 });
            statusSlot.replaceChildren(alertBox({
                type: 'success',
                message: `API отвечает (${Date.now() - startedAt} мс): получен JWK Set auth-service.`,
            }));
        } catch (error) {
            statusSlot.replaceChildren(alertBox({
                type: 'danger',
                title: 'API недоступен',
                message: describeError(error),
                items: [
                    isAbsoluteApiBase(next)
                        ? 'Проверьте, что gateway запущен и этот origin разрешён в LMS_CORS_ALLOWED_ORIGINS.'
                        : 'Относительный путь работает только когда UI и API отдаёт один сервер (nginx из compose).',
                ],
            }));
        } finally {
            checkButton.disabled = false;
        }
    }
}

function isValidBase(base) {
    return typeof base === 'string' && (base.startsWith('/') || /^https?:\/\//i.test(base));
}
