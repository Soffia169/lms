/**
 * Клиентский учёт «новых» уведомлений.
 *
 * На этапе 2 у notification-service только `GET /api/notifications`: отметить
 * уведомление прочитанным нельзя. Поэтому «новые» считаются на клиенте —
 * всё, что пришло позже последнего открытия экрана `#/notifications`. Момент
 * просмотра хранится в localStorage и никак не влияет на серверные данные.
 */

export const NOTIFICATIONS_SEEN_KEY = 'lms.notifications.seenAt';

/**
 * Время уведомления в миллисекундах.
 *
 * @param {{createdAt?: string}|null|undefined} item
 * @returns {number|null}
 */
export function notificationTime(item) {
    const value = item?.createdAt;
    if (!value) {
        return null;
    }
    const time = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(time) ? time : null;
}

/**
 * Самое свежее уведомление в списке.
 *
 * @param {Array<object>|null|undefined} items
 * @returns {number|null}
 */
export function latestNotificationAt(items) {
    let latest = null;
    for (const item of Array.isArray(items) ? items : []) {
        const time = notificationTime(item);
        if (time !== null && (latest === null || time > latest)) {
            latest = time;
        }
    }
    return latest;
}

/**
 * Сколько уведомлений появилось после отметки просмотра.
 *
 * @param {Array<object>|null|undefined} items
 * @param {number|null} seenAt null — ничего не просмотрено, значит новое всё
 * @returns {number}
 */
export function unseenCount(items, seenAt) {
    const list = Array.isArray(items) ? items : [];
    if (!Number.isFinite(seenAt)) {
        return list.length;
    }
    let count = 0;
    for (const item of list) {
        const time = notificationTime(item);
        if (time !== null && time > seenAt) {
            count += 1;
        }
    }
    return count;
}

/**
 * @param {Storage} [storage]
 * @returns {number|null}
 */
export function readSeenAt(storage = globalThis.localStorage) {
    try {
        const raw = storage?.getItem(NOTIFICATIONS_SEEN_KEY);
        if (raw === null || raw === undefined || raw === '') {
            return null;
        }
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
    } catch {
        return null;
    }
}

/**
 * @param {number|null} value момент просмотра (мс) или null — сбросить
 * @param {Storage} [storage]
 * @returns {number|null} записанное значение
 */
export function writeSeenAt(value, storage = globalThis.localStorage) {
    const normalized = value === null || value === undefined || !Number.isFinite(Number(value))
        ? null
        : Math.trunc(Number(value));
    try {
        if (normalized === null) {
            storage?.removeItem(NOTIFICATIONS_SEEN_KEY);
        } else {
            storage?.setItem(NOTIFICATIONS_SEEN_KEY, String(normalized));
        }
    } catch {
        // Приватный режим/квота: счётчик проживёт до перезагрузки страницы.
    }
    return normalized;
}
