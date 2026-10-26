/**
 * Светлая/тёмная тема.
 *
 * По умолчанию берём системную (prefers-color-scheme), явный выбор храним
 * в localStorage. Тема — только атрибут data-theme на <html>, поэтому
 * переключение не перерисовывает приложение.
 */

export const THEME_STORAGE_KEY = 'lms.theme';
const THEMES = ['light', 'dark'];

/**
 * @param {object} [options]
 * @param {Storage} [options.storage]
 * @param {Window} [options.window]
 * @returns {{get: () => 'light'|'dark', set: (theme: 'light'|'dark') => void, toggle: () => 'light'|'dark', apply: (theme: 'light'|'dark') => void, subscribe: (fn: (theme: string) => void) => () => void}}
 */
export function createTheme({ storage = globalThis.localStorage, window = globalThis.window } = {}) {
    const listeners = new Set();
    let current = resolveInitialTheme(storage, window);

    function apply(theme) {
        current = THEMES.includes(theme) ? theme : 'light';
        document.documentElement.dataset.theme = current;
        for (const listener of [...listeners]) {
            listener(current);
        }
    }

    function set(theme) {
        apply(theme);
        try {
            storage?.setItem(THEME_STORAGE_KEY, current);
        } catch {
            // Приватный режим — тема останется до перезагрузки.
        }
    }

    function toggle() {
        set(current === 'dark' ? 'light' : 'dark');
        return current;
    }

    function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    apply(current);

    return {
        get: () => current,
        set,
        toggle,
        apply,
        subscribe,
    };
}

function resolveInitialTheme(storage, window) {
    try {
        const stored = storage?.getItem(THEME_STORAGE_KEY);
        if (THEMES.includes(stored)) {
            return stored;
        }
    } catch {
        // см. set()
    }
    try {
        return window?.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
    } catch {
        return 'light';
    }
}
