/**
 * Форматирование для UI. Отдельный модуль без DOM: покрыт unit-тестами.
 */

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
});

const ROLE_LABELS = {
    ADMIN: 'Администратор',
    INSTRUCTOR: 'Инструктор',
    STUDENT: 'Студент',
};

const ROLE_TONES = {
    ADMIN: 'accent',
    INSTRUCTOR: 'success',
    STUDENT: 'warning',
};

/**
 * @param {string|null|undefined} iso
 * @returns {string} «—», если даты нет
 */
export function formatDateTime(iso) {
    const date = toDate(iso);
    return date ? dateTimeFormatter.format(date) : '—';
}

/**
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function formatDate(iso) {
    const date = toDate(iso);
    return date ? dateFormatter.format(date) : '—';
}

/**
 * Относительное описание даты: «только что», «12 мин назад», «сегодня, 14:20».
 *
 * @param {string|null|undefined} iso
 * @param {number} [now]
 * @returns {string}
 */
export function formatRelative(iso, now = Date.now()) {
    const date = toDate(iso);
    if (!date) {
        return '—';
    }
    const diff = now - date.getTime();
    if (diff < 0) {
        return formatDate(iso);
    }
    if (diff < 60_000) {
        return 'только что';
    }
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) {
        return `${minutes} ${pluralRu(minutes, ['минуту', 'минуты', 'минут'])} назад`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24 && isSameDay(date, new Date(now))) {
        return `${hours} ${pluralRu(hours, ['час', 'часа', 'часов'])} назад`;
    }
    const days = Math.floor(hours / 24);
    if (days === 1) {
        return 'вчера';
    }
    if (days < 7) {
        return `${days} ${pluralRu(days, ['день', 'дня', 'дней'])} назад`;
    }
    return formatDate(iso);
}

/**
 * Длительность в человеческом виде (для TTL токена).
 *
 * @param {number|null|undefined} ms
 * @returns {string}
 */
export function formatDuration(ms) {
    if (!Number.isFinite(ms)) {
        return '—';
    }
    if (ms <= 0) {
        return 'истёк';
    }
    const totalMinutes = Math.round(ms / 60_000);
    if (totalMinutes < 1) {
        return 'меньше минуты';
    }
    if (totalMinutes < 60) {
        return `${totalMinutes} ${pluralRu(totalMinutes, ['минута', 'минуты', 'минут'])}`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const hoursLabel = `${hours} ${pluralRu(hours, ['час', 'часа', 'часов'])}`;
    return minutes === 0
        ? hoursLabel
        : `${hoursLabel} ${minutes} ${pluralRu(minutes, ['минута', 'минуты', 'минут'])}`;
}

/**
 * Русские формы множественного числа.
 *
 * @param {number} count
 * @param {[string, string, string]} forms [один, два, пять]
 * @returns {string}
 */
export function pluralRu(count, [one, few, many]) {
    const abs = Math.abs(Math.trunc(count));
    const mod100 = abs % 100;
    if (mod100 >= 11 && mod100 <= 14) {
        return many;
    }
    switch (abs % 10) {
        case 1: return one;
        case 2:
        case 3:
        case 4: return few;
        default: return many;
    }
}

/**
 * Инициалы для аватара: «Иван Петров» → «ИП», «admin» → «AD».
 *
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function initials(name) {
    const parts = String(name ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (parts.length === 0) {
        return '?';
    }
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

/**
 * Короткий идентификатор для интерфейса (полный UUID остаётся в title).
 *
 * @param {string|null|undefined} id
 * @param {number} [length]
 * @returns {string}
 */
export function shortId(id, length = 8) {
    if (!id) {
        return '—';
    }
    const value = String(id);
    return value.length <= length ? value : `${value.slice(0, length)}…`;
}

/**
 * @param {string|null|undefined} role
 * @returns {string}
 */
export function roleLabel(role) {
    const key = String(role ?? '').toUpperCase();
    return ROLE_LABELS[key] ?? (key || 'Без роли');
}

/**
 * Тон бейджа для роли (совпадает с классами .badge--*).
 *
 * @param {string|null|undefined} role
 * @returns {string}
 */
export function roleTone(role) {
    return ROLE_TONES[String(role ?? '').toUpperCase()] ?? 'neutral';
}

/**
 * @param {string[]|null|undefined} roles
 * @returns {string}
 */
export function rolesLabel(roles) {
    const list = Array.isArray(roles) ? roles : [];
    return list.length === 0 ? 'Без ролей' : list.map(roleLabel).join(' · ');
}

/**
 * Обрезает текст по границе слова.
 *
 * @param {string|null|undefined} text
 * @param {number} max
 * @returns {string}
 */
export function truncate(text, max = 160) {
    const value = String(text ?? '').trim();
    if (value.length <= max) {
        return value;
    }
    const cut = value.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function toDate(iso) {
    if (!iso) {
        return null;
    }
    const date = iso instanceof Date ? iso : new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
}

function isSameDay(left, right) {
    return left.getFullYear() === right.getFullYear()
        && left.getMonth() === right.getMonth()
        && left.getDate() === right.getDate();
}
