/**
 * Экран уведомлений (этап 2): список своих in-app уведомлений.
 *
 * notification-service отдаёт только `GET /api/notifications` (до 100,
 * свежие первыми). Отметки «прочитано» на бэкенде нет, поэтому экран сразу
 * обновляет клиентскую отметку просмотра (localStorage) — колокольчик
 * обнуляет счётчик новых.
 */

import { el } from '../ui/dom.js';
import { createIcon } from '../ui/icons.js';
import { emptyState } from '../ui/states.js';
import { formatDateTime, formatRelative } from '../core/format.js';

const TYPE_ICONS = {
    USER_REGISTERED: 'shield',
    ENROLLMENT_CREATED: 'book',
    LESSON_COMPLETED: 'check-circle',
};

/**
 * @param {object} ctx контекст приложения
 * @returns {Promise<{el: HTMLElement, title: string}>}
 */
export async function notificationsView(ctx) {
    const { notifications, markNotificationsSeen } = ctx;

    const items = await notifications.listMine();
    const list = Array.isArray(items) ? items : [];

    // Список показан — значит, просмотрен: счётчик «новых» обнуляется.
    markNotificationsSeen(list);

    const root = el('div', { class: 'stack' },
        el('div', { class: 'page-head' },
            el('div', { class: 'page-head__text' },
                el('h1', { class: 'page-head__title', text: 'Уведомления' }),
                el('p', {
                    class: 'page-head__subtitle',
                    text: 'События платформы: регистрация, запись на курс, отметки уроков. Открытие страницы снимает счётчик «новых».',
                })),
            el('div', { class: 'page-head__actions' },
                el('span', { class: 'badge', text: `всего: ${list.length}` }))),
        list.length === 0
            ? emptyState({
                icon: 'bell',
                title: 'Уведомлений пока нет',
                text: 'Здесь появятся события: приветствие после регистрации, запись на курс и отметки уроков.',
                action: el('a', { class: 'btn btn--primary btn--sm', href: '#/my-courses', text: 'Перейти в мои курсы' }),
            })
            : el('div', { class: 'notifications' }, ...list.map(notificationItem)),
        list.length > 0
            ? el('p', {
                class: 'hint',
                text: `Показано ${list.length} ${list.length === 100 ? '(ограничение сервиса — 100)' : 'новейших'}; отметка «прочитано» появится вместе с PATCH-эндпоинтом на бэкенде.`,
            })
            : null);

    function notificationItem(item) {
        return el('article', { class: 'notification', dataset: { type: item.type ?? '' } },
            el('div', { class: 'notification__icon' }, createIcon(TYPE_ICONS[item.type] ?? 'bell', { size: 17 })),
            el('div', { class: 'notification__body' },
                el('div', { class: 'notification__subject', text: item.subject ?? 'Уведомление' }),
                el('div', { class: 'notification__text', text: item.body ?? '' })),
            el('div', { class: 'notification__time' },
                el('span', { title: formatDateTime(item.createdAt), text: formatRelative(item.createdAt) }),
                el('code', { class: 'notification__id', title: item.id ?? '', text: String(item.id ?? '').slice(0, 8) })));
    }

    return { el: root, title: 'Уведомления' };
}
