/**
 * Минимальные DOM-хелперы.
 *
 * Принципиально нет innerHTML: любой пользовательский текст (названия курсов,
 * описания, содержимое уроков) попадает в DOM только через textContent.
 * Это дешевле и надёжнее ручного экранирования.
 */

/**
 * Создаёт элемент.
 *
 * @param {string} tag
 * @param {object} [props]
 * @param {...unknown} children строки, узлы, массивы, null/false (пропускаются)
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    applyProps(node, props);
    append(node, children);
    return node;
}

/**
 * Фрагмент: несколько узлов без лишней обёртки.
 *
 * @param {...unknown} children
 * @returns {DocumentFragment}
 */
export function frag(...children) {
    const fragment = document.createDocumentFragment();
    append(fragment, children);
    return fragment;
}

/**
 * Текстовый узел.
 *
 * @param {unknown} value
 * @returns {Text}
 */
export function text(value) {
    return document.createTextNode(value === null || value === undefined ? '' : String(value));
}

/**
 * Добавляет детей в узел, разворачивая массивы и пропуская пустые значения.
 *
 * @param {Node} parent
 * @param {unknown[]} children
 * @returns {Node}
 */
export function append(parent, children) {
    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false || child === true) {
            continue;
        }
        parent.appendChild(child instanceof Node ? child : text(child));
    }
    return parent;
}

/**
 * @param {Node} node
 * @returns {Node}
 */
export function clear(node) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
    return node;
}

/**
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {HTMLElement|null}
 */
export function qs(selector, root = document) {
    return root.querySelector(selector);
}

/**
 * Отключает кнопку на время асинхронной операции, показывая спиннер.
 *
 * @param {HTMLButtonElement} button
 * @param {boolean} busy
 * @param {string} [busyLabel] подпись на время операции
 * @returns {void}
 */
export function setBusy(button, busy, busyLabel = 'Отправка…') {
    if (!button) {
        return;
    }
    if (busy) {
        button.dataset.busy = 'true';
        button.dataset.idleLabel = button.dataset.idleLabel || button.textContent;
        button.disabled = true;
        const label = button.querySelector('.btn__label');
        if (label) {
            label.textContent = busyLabel;
        }
    } else {
        delete button.dataset.busy;
        button.disabled = false;
        const label = button.querySelector('.btn__label');
        if (label && button.dataset.idleLabel) {
            label.textContent = button.dataset.idleLabel;
        }
    }
}

/**
 * Кнопка со спиннером внутри: `.btn__spinner` + `.btn__label`.
 *
 * @param {object} options
 * @returns {HTMLButtonElement}
 */
export function actionButton({ label, variant = 'primary', type = 'submit', icon = null, onClick = null, title = null, size = null }) {
    const button = el('button', {
        type,
        class: `btn btn--${variant}${size === 'sm' ? ' btn--sm' : ''}`,
        title,
        onclick: onClick ?? undefined,
    }, el('span', { class: 'spinner btn__spinner', 'aria-hidden': 'true' }),
        icon ? iconNode(icon) : null,
        el('span', { class: 'btn__label', text: label }));
    return button;
}

function iconNode(icon) {
    return icon instanceof Node ? icon : null;
}

/**
 * Иконка-кнопка с обязательной текстовой подписью для скринридеров.
 *
 * @param {object} options
 * @returns {HTMLButtonElement}
 */
export function iconButton({ icon, label, variant = 'ghost', onClick, title = null, disabled = false }) {
    return el('button', {
        type: 'button',
        class: `btn btn--${variant} btn--icon`,
        'aria-label': label,
        title: title ?? label,
        disabled,
        onclick: onClick,
    }, icon);
}

/**
 * Debounce для полей поиска.
 *
 * @template {(...args: any[]) => void} F
 * @param {F} fn
 * @param {number} waitMs
 * @returns {(...args: Parameters<F>) => void}
 */
export function debounce(fn, waitMs = 250) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), waitMs);
    };
}

function applyProps(node, props) {
    for (const [key, value] of Object.entries(props ?? {})) {
        if (value === undefined || value === null || value === false) {
            continue;
        }
        switch (key) {
            case 'class':
            case 'className':
                node.className = value;
                break;
            case 'dataset':
                Object.assign(node.dataset, value);
                break;
            case 'style':
                if (typeof value === 'string') {
                    node.setAttribute('style', value);
                } else {
                    Object.assign(node.style, value);
                }
                break;
            case 'text':
                node.textContent = value;
                break;
            case 'html':
                // Сознательный запрет: см. комментарий в начале файла.
                throw new Error('innerHTML запрещён — используйте el()/text()');
            case 'value':
                if (node instanceof HTMLTextAreaElement) {
                    node.value = value;
                } else {
                    node.setAttribute('value', value);
                }
                break;
            case 'checked':
                node.checked = !!value;
                break;
            case 'selected':
                node.selected = !!value;
                break;
            default:
                if (key.startsWith('on') && typeof value === 'function') {
                    node.addEventListener(key.slice(2).toLowerCase(), value);
                } else if (value === true) {
                    node.setAttribute(key, '');
                } else {
                    node.setAttribute(key, value);
                }
        }
    }
}
