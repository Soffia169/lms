/**
 * Декларативные формы: поля описываются данными, а не разметкой.
 *
 * Представления создают группу полей, читают значения и показывают ошибки
 * валидации бэкенда (`problem.errors`) прямо под нужным input — ключи там
 * совпадают с именами полей DTO (email, password, fullName, title, …).
 */

import { el } from './dom.js';

let fieldSeq = 0;

/**
 * @typedef {object} FieldSpec
 * @property {string} name
 * @property {string} label
 * @property {'text'|'email'|'password'|'number'|'textarea'|'select'} [type]
 * @property {boolean} [required]
 * @property {string} [placeholder]
 * @property {string} [hint]
 * @property {number} [maxLength]
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [rows]
 * @property {Array<{value: string, label: string}>} [options]
 * @property {string} [autocomplete]
 * @property {string} [inputMode]
 * @property {boolean} [optionalLabel] показывать «необязательно»
 */

/**
 * Создаёт группу полей.
 *
 * @param {FieldSpec[]} fields
 * @param {Record<string, unknown>} [values]
 * @returns {{element: HTMLElement, read: Function, validate: Function, setErrors: Function, clearErrors: Function, focusFirst: Function, setValue: Function, setDisabled: Function, controls: Map<string, HTMLElement>, fields: FieldSpec[]}}
 */
export function createFields(fields, values = {}) {
    const element = el('div', { class: 'stack stack--tight' });
    const controls = new Map();
    const errorNodes = new Map();
    const wrappers = new Map();

    for (const spec of fields) {
        const id = `field-${++fieldSeq}`;
        const errorId = `${id}-error`;
        const hintId = `${id}-hint`;
        const control = createControl(spec, id, values[spec.name], hintId, errorId);
        controls.set(spec.name, control);

        const errorNode = el('p', { class: 'field__error', id: errorId, 'aria-live': 'polite' });
        errorNodes.set(spec.name, errorNode);

        const wrapper = el('div', { class: 'field' },
            el('label', { class: 'field__label', for: id },
                el('span', { text: spec.label }),
                spec.required
                    ? el('span', { class: 'field__optional', text: 'обязательно' })
                    : spec.optionalLabel
                        ? el('span', { class: 'field__optional', text: 'необязательно' })
                        : null),
            control,
            spec.hint ? el('p', { class: 'hint', id: hintId, text: spec.hint }) : null,
            errorNode);

        wrappers.set(spec.name, wrapper);
        element.appendChild(wrapper);
    }

    function read() {
        const result = {};
        for (const spec of fields) {
            const control = controls.get(spec.name);
            const raw = control instanceof HTMLInputElement && control.type === 'number'
                ? control.valueAsNumber
                : control.value;
            if (spec.type === 'password') {
                result[spec.name] = control.value;
            } else if (spec.type === 'number') {
                result[spec.name] = Number.isNaN(raw) || control.value === '' ? null : raw;
            } else {
                result[spec.name] = typeof control.value === 'string' ? control.value.trim() : control.value;
            }
        }
        return result;
    }

    function validate() {
        const errors = {};
        const valuesRead = read();
        for (const spec of fields) {
            const value = valuesRead[spec.name];
            const empty = value === null || value === undefined || value === '';
            if (spec.required && empty) {
                errors[spec.name] = 'Обязательное поле';
                continue;
            }
            if (empty) {
                continue;
            }
            if (spec.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
                errors[spec.name] = 'Некорректный email';
                continue;
            }
            if (spec.minLength && String(value).length < spec.minLength) {
                errors[spec.name] = `Минимум ${spec.minLength} символов`;
                continue;
            }
            if (spec.maxLength && String(value).length > spec.maxLength) {
                errors[spec.name] = `Максимум ${spec.maxLength} символов`;
                continue;
            }
            if (spec.type === 'number' && typeof value === 'number') {
                if (spec.min !== undefined && value < spec.min) {
                    errors[spec.name] = `Не меньше ${spec.min}`;
                } else if (spec.max !== undefined && value > spec.max) {
                    errors[spec.name] = `Не больше ${spec.max}`;
                }
            }
        }
        setErrors(errors);
        return errors;
    }

    /**
     * Показывает ошибки по полям. Возвращает те, для которых поля нет —
     * представление может вывести их общим алертом.
     *
     * @param {Record<string, string>} errorsByField
     * @returns {Record<string, string>}
     */
    function setErrors(errorsByField = {}) {
        const leftover = { ...errorsByField };
        for (const [name, node] of errorNodes) {
            const message = errorsByField[name];
            node.textContent = message ?? '';
            const control = controls.get(name);
            if (message) {
                control.setAttribute('aria-invalid', 'true');
                delete leftover[name];
            } else {
                control.removeAttribute('aria-invalid');
            }
        }
        const firstInvalid = [...errorNodes.entries()].find(([, node]) => node.textContent);
        if (firstInvalid) {
            controls.get(firstInvalid[0])?.focus();
        }
        return leftover;
    }

    function clearErrors() {
        setErrors({});
    }

    function focusFirst() {
        const first = fields[0];
        if (first) {
            controls.get(first.name)?.focus();
        }
    }

    function setValue(name, value) {
        const control = controls.get(name);
        if (!control) {
            return;
        }
        control.value = value ?? '';
    }

    function setDisabled(disabled) {
        for (const control of controls.values()) {
            control.disabled = disabled;
        }
    }

    return { element, read, validate, setErrors, clearErrors, focusFirst, setValue, setDisabled, controls, fields };
}

/**
 * Контрол для спецификации поля.
 *
 * @param {FieldSpec} spec
 * @param {string} id
 * @param {unknown} value
 * @param {string} hintId
 * @param {string} errorId
 * @returns {HTMLElement}
 */
function createControl(spec, id, value, hintId, errorId) {
    const describedBy = spec.hint ? `${hintId} ${errorId}` : errorId;
    const common = {
        id,
        name: spec.name,
        'aria-describedby': describedBy,
        required: spec.required ? true : undefined,
        disabled: spec.disabled ? true : undefined,
        maxlength: spec.maxLength ? String(spec.maxLength) : undefined,
        autocomplete: spec.autocomplete,
        inputmode: spec.inputMode ?? (spec.type === 'number' ? 'numeric' : undefined),
        placeholder: spec.placeholder,
    };

    switch (spec.type) {
        case 'textarea':
            return el('textarea', {
                ...common,
                class: 'textarea',
                rows: String(spec.rows ?? 4),
            }, value ?? '');
        case 'select':
            return el('select', { ...common, class: 'select' },
                ...(spec.options ?? []).map((option) => el('option', {
                    value: option.value,
                    text: option.label,
                    selected: String(option.value) === String(value ?? '') || undefined,
                })));
        case 'number':
            return el('input', {
                ...common,
                class: 'input',
                type: 'number',
                min: spec.min !== undefined ? String(spec.min) : undefined,
                max: spec.max !== undefined ? String(spec.max) : undefined,
                step: '1',
                value: value ?? '',
            });
        default:
            return el('input', {
                ...common,
                class: 'input',
                type: spec.type ?? 'text',
                value: value ?? '',
            });
    }
}

/**
 * Собирает значения формы в объект, отбрасывая пустые строки и null.
 * Удобно для DTO, где необязательные поля можно не передавать.
 *
 * @param {Record<string, unknown>} values
 * @returns {Record<string, unknown>}
 */
export function compact(values) {
    return Object.fromEntries(Object.entries(values).filter(([, value]) => {
        return value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '');
    }));
}
