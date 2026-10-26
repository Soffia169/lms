/**
 * course-service API.
 *
 * Курсы, модули, уроки и публикация — всё, что реализовано на этапе 1.
 * Записи на курс, прогресса и оценивания здесь нет: это этапы 2–3.
 * Права проверяет бэкенд, UI только прячет недоступные действия.
 */

/**
 * @param {object} options
 * @param {object} options.client клиент из core/client.js
 * @returns {object} методы course-service
 */
export function createCoursesApi({ client }) {
    const coursePath = (id, suffix = '') => `/courses/${encodeURIComponent(id)}${suffix}`;

    return {
        /**
         * @param {{published?: boolean}} [filter] undefined — все курсы
         * @returns {Promise<Array<object>>}
         */
        list: (filter = {}) => client.get('/courses', {
            query: { published: filter.published },
        }),

        /**
         * @param {string} courseId
         * @returns {Promise<object>} курс с модулями и уроками
         */
        get: (courseId) => client.get(coursePath(courseId)),

        /**
         * @param {{title: string, description?: string}} payload
         * @returns {Promise<object>}
         */
        create: (payload) => client.post('/courses', { body: payload }),

        /**
         * @param {string} courseId
         * @param {{title: string, description?: string}} payload
         * @returns {Promise<object>}
         */
        update: (courseId, payload) => client.put(coursePath(courseId), { body: payload }),

        /**
         * @param {string} courseId
         * @returns {Promise<void>}
         */
        remove: (courseId) => client.del(coursePath(courseId)),

        /**
         * @param {string} courseId
         * @returns {Promise<object>}
         */
        publish: (courseId) => client.post(coursePath(courseId, '/publish')),

        /**
         * @param {string} courseId
         * @returns {Promise<object>}
         */
        unpublish: (courseId) => client.post(coursePath(courseId, '/unpublish')),

        /**
         * @param {string} courseId
         * @param {{title: string, position?: number|null}} payload
         * @returns {Promise<object>}
         */
        addModule: (courseId, payload) => client.post(coursePath(courseId, '/modules'), { body: payload }),

        /**
         * @param {string} moduleId
         * @param {{title: string, position?: number|null}} payload
         * @returns {Promise<object>}
         */
        updateModule: (moduleId, payload) => client.put(`/modules/${encodeURIComponent(moduleId)}`, {
            body: payload,
        }),

        /**
         * @param {string} moduleId
         * @returns {Promise<void>}
         */
        removeModule: (moduleId) => client.del(`/modules/${encodeURIComponent(moduleId)}`),

        /**
         * @param {string} moduleId
         * @param {{title: string, content?: string, position?: number|null}} payload
         * @returns {Promise<object>}
         */
        addLesson: (moduleId, payload) => client.post(`/modules/${encodeURIComponent(moduleId)}/lessons`, {
            body: payload,
        }),

        /**
         * @param {string} lessonId
         * @param {{title: string, content?: string, position?: number|null}} payload
         * @returns {Promise<object>}
         */
        updateLesson: (lessonId, payload) => client.put(`/lessons/${encodeURIComponent(lessonId)}`, {
            body: payload,
        }),

        /**
         * @param {string} lessonId
         * @returns {Promise<void>}
         */
        removeLesson: (lessonId) => client.del(`/lessons/${encodeURIComponent(lessonId)}`),
    };
}
