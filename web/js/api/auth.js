/**
 * auth-service API.
 *
 * Пути повторяют README (этап 1). Публичные вызовы идут через тот же клиент
 * с `auth: false`: так у них общая обработка ошибок и таймаутов, но нет
 * заголовка Authorization и повторных попыток refresh.
 */

/**
 * @param {object} options
 * @param {object} options.client клиент из core/client.js
 * @returns {object} методы auth-service
 */
export function createAuthApi({ client }) {
    return {
        /**
         * @param {{email: string, password: string, fullName: string}} payload
         * @returns {Promise<{id: string, email: string, fullName: string, role: string}>}
         */
        register: (payload) => client.post('/auth/register', { body: payload, auth: false }),

        /**
         * @param {{email: string, password: string}} payload
         * @returns {Promise<{accessToken: string, refreshToken: string, tokenType: string, expiresIn: number}>}
         */
        login: (payload) => client.post('/auth/login', { body: payload, auth: false }),

        /**
         * @param {string} refreshToken
         * @returns {Promise<{accessToken: string, refreshToken: string, tokenType: string, expiresIn: number}>}
         */
        refresh: (refreshToken) => client.post('/auth/refresh', {
            body: { refreshToken },
            auth: false,
        }),

        /**
         * @param {string} refreshToken
         * @returns {Promise<void>}
         */
        logout: (refreshToken) => client.post('/auth/logout', {
            body: { refreshToken },
            auth: true,
        }),

        /**
         * @returns {Promise<{id: string, email: string, fullName: string, role: string}>}
         */
        me: () => client.get('/auth/me'),

        /**
         * @param {string} userId
         * @param {'STUDENT'|'INSTRUCTOR'|'ADMIN'} role
         * @returns {Promise<{id: string, email: string, fullName: string, role: string}>}
         */
        changeRole: (userId, role) => client.patch(`/auth/users/${encodeURIComponent(userId)}/role`, {
            body: { role },
        }),
    };
}
