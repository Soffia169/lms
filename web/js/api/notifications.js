/**
 * notification-service API (этап 2).
 *
 * На этапе 2 сервис отдаёт только список своих уведомлений
 * (`GET /api/notifications`, до 100, свежие первыми). Отметка «прочитано»
 * появится вместе с PATCH-эндпоинтом; до этого «новые» считаются на клиенте
 * (см. core/notifications.js).
 */

/**
 * @param {object} options
 * @param {object} options.client клиент из core/client.js
 * @returns {object} методы notification-service
 */
export function createNotificationsApi({ client }) {
    return {
        /**
         * @returns {Promise<Array<{id: string, type: string, subject: string, body: string,
         *   createdAt: string, readAt: string|null}>>}
         */
        listMine: () => client.get('/notifications'),
    };
}
