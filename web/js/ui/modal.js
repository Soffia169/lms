/**
 * Модальные окна на нативном <dialog>.
 *
 * Нативный dialog даёт бесплатно: фокус-ловушку, закрытие по Esc, инертный фон
 * и ::backdrop. Поверх — единый вид формы, состояние «отправка» и разбор
 * ошибок problem+json в поля.
 */

import { actionButton, el, setBusy } from './dom.js';
import { createIcon } from './icons.js';
import { createFields } from './forms.js';
import { ApiError, describeError, fieldErrorsOf, hintForError } from '../core/errors.js';

let dialogSeq = 0;

/**
 * Открывает произвольное модальное окно.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.description]
 * @param {Node|null} [options.body]
 * @param {Node|null} [options.footer]
 * @param {boolean} [options.wide]
 * @param {() => void} [options.onClose]
 * @returns {{dialog: HTMLDialogElement, close: () => void}}
 */
export function openModal({ title, description = '', body = null, footer = null, wide = false, onClose = () => {} }) {
    const titleId = `modal-title-${++dialogSeq}`;
    const dialog = el('dialog', {
        class: `modal${wide ? ' modal--wide' : ''}`,
        'aria-labelledby': titleId,
    });

    dialog.appendChild(el('div', { class: 'modal__form' },
        el('div', { class: 'modal__header' },
            el('div', { class: 'modal__heading grow' },
                el('h2', { class: 'modal__title', id: titleId, text: title }),
                description ? el('p', { class: 'modal__description', text: description }) : null)),
        el('div', { class: 'modal__body' }, body),
        footer ? el('div', { class: 'modal__footer' }, footer) : null));

    document.body.appendChild(dialog);
    dialog.showModal();

    const firstFocusable = dialog.querySelector('input, textarea, select, button');
    firstFocusable?.focus();

    let closed = false;
    function close() {
        if (closed) {
            return;
        }
        closed = true;
        dialog.close();
    }

    dialog.addEventListener('close', () => {
        dialog.remove();
        onClose();
    });

    return { dialog, close };
}

/**
 * Модальное окно с формой.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.description]
 * @param {import('./forms.js').FieldSpec[]} options.fields
 * @param {Record<string, unknown>} [options.initial]
 * @param {string} [options.submitLabel]
 * @param {string} [options.cancelLabel]
 * @param {boolean} [options.danger]
 * @param {string} [options.note]
 * @param {(values: Record<string, any>) => Promise<void>} options.onSubmit
 * @param {boolean} [options.wide]
 * @returns {Promise<boolean>} true, если форма успешно отправлена
 */
export function openFormModal({
    title,
    description = '',
    fields,
    initial = {},
    submitLabel = 'Сохранить',
    cancelLabel = 'Отмена',
    danger = false,
    note = '',
    onSubmit,
    wide = false,
}) {
    const group = createFields(fields, initial);
    const alertSlot = el('div', { 'aria-live': 'polite' });

    const cancelButton = el('button', { type: 'button', class: 'btn btn--ghost', text: cancelLabel });
    const submitButton = actionButton({ label: submitLabel, variant: danger ? 'danger' : 'primary' });

    let submitted = false;

    return new Promise((resolve) => {
        const { dialog, close } = openModal({
            title,
            description,
            wide,
            body: el('div', { class: 'stack stack--tight' },
                alertSlot,
                group.element,
                note ? el('p', { class: 'hint', text: note }) : null),
            footer: el('div', { class: 'row', style: { marginLeft: 'auto' } }, cancelButton, submitButton),
            onClose: () => resolve(submitted),
        });

        // Enter в поле отправляет форму (а не перезагружает страницу).
        dialog.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' || event.shiftKey || !dialog.open) {
                return;
            }
            const target = event.target;
            if (target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement) {
                return;
            }
            event.preventDefault();
            void submit();
        });

        cancelButton.addEventListener('click', close);
        submitButton.addEventListener('click', (event) => {
            event.preventDefault();
            void submit();
        });

        async function submit() {
            alertSlot.replaceChildren();
            const errors = group.validate();
            if (Object.keys(errors).length > 0) {
                return;
            }
            setBusy(submitButton, true, 'Сохранение…');
            group.setDisabled(true);
            try {
                await onSubmit(group.read());
                submitted = true;
                close();
            } catch (error) {
                const leftover = group.setErrors(fieldErrorsOf(error));
                const validation = error instanceof ApiError && error.isValidation;
                alertSlot.replaceChildren(el('div', {
                    class: `alert alert--${validation ? 'warning' : 'danger'}`,
                    role: 'alert',
                },
                el('span', {
                    class: 'alert__title',
                    text: error instanceof ApiError ? error.title || 'Ошибка' : 'Ошибка',
                }),
                el('p', { text: describeError(error) }),
                Object.keys(leftover).length
                    ? el('ul', { class: 'alert__list' },
                        ...Object.entries(leftover).map(([field, message]) => el('li', { text: `${field}: ${message}` })))
                    : null,
                hintForError(error) ? el('p', { class: 'hint', text: hintForError(error) }) : null));
            } finally {
                setBusy(submitButton, false);
                group.setDisabled(false);
            }
        }

        group.focusFirst();
    });
}

/**
 * Диалог подтверждения (удаление, снятие с публикации).
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.confirmLabel]
 * @param {string} [options.cancelLabel]
 * @param {boolean} [options.danger]
 * @param {string} [options.note]
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
    title,
    message,
    confirmLabel = 'Подтвердить',
    cancelLabel = 'Отмена',
    danger = true,
    note = '',
}) {
    let confirmed = false;

    return new Promise((resolve) => {
        const cancelButton = el('button', { type: 'button', class: 'btn btn--ghost', text: cancelLabel });
        const confirmButton = actionButton({ label: confirmLabel, variant: danger ? 'danger' : 'primary' });

        const { close } = openModal({
            title,
            body: el('div', { class: 'stack stack--tight' },
                el('div', { class: 'row', style: { alignItems: 'flex-start', gap: '12px' } },
                    createIcon(danger ? 'alert' : 'shield', { size: 22 }),
                    el('p', { class: 'grow', text: message })),
                note ? el('p', { class: 'hint', text: note }) : null),
            footer: el('div', { class: 'row', style: { marginLeft: 'auto' } }, cancelButton, confirmButton),
            onClose: () => resolve(confirmed),
        });

        cancelButton.addEventListener('click', close);
        confirmButton.addEventListener('click', () => {
            confirmed = true;
            close();
        });
    });
}
