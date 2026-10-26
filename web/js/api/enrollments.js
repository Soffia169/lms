/**
 * enrollment-service API (этап 2).
 *
 * Запись на курс, отмена и прогресс уроков. Пути повторяют README этапа 2.
 * Права проверяет бэкенд: записаться может только STUDENT, а отменять запись
 * и отмечать уроки — только её владелец (проверка в service-слое).
 */

/**
 * @param {object} options
 * @param {object} options.client клиент из core/client.js
 * @returns {object} методы enrollment-service
 */
export function createEnrollmentsApi({ client }) {
    const enrollmentPath = (id, suffix = '') => `/enrollments/${encodeURIComponent(id)}${suffix}`;

    return {
        /**
         * Запись на опубликованный курс. Требует роль STUDENT.
         *
         * @param {string} courseId
         * @returns {Promise<object>} созданная запись
         */
        enroll: (courseId) => client.post('/enrollments', { body: { courseId } }),

        /**
         * @returns {Promise<Array<object>>} мои записи с прогрессом
         */
        listMine: () => client.get('/enrollments'),

        /**
         * @param {string} enrollmentId
         * @returns {Promise<object>} запись + прогресс
         */
        get: (enrollmentId) => client.get(enrollmentPath(enrollmentId)),

        /**
         * @param {string} enrollmentId
         * @returns {Promise<Array<{lessonId: string, completedAt: string, score: number|null}>>}
         */
        progress: (enrollmentId) => client.get(enrollmentPath(enrollmentId, '/progress')),

        /**
         * @param {string} enrollmentId
         * @returns {Promise<object>} запись со статусом CANCELLED
         */
        cancel: (enrollmentId) => client.post(enrollmentPath(enrollmentId, '/cancel')),

        /**
         * Идемпотентная отметка урока пройденным.
         *
         * @param {string} enrollmentId
         * @param {string} lessonId
         * @returns {Promise<{lessonId: string, completedAt: string, score: number|null}>}
         */
        completeLesson: (enrollmentId, lessonId) => client.post(
            enrollmentPath(enrollmentId, `/lessons/${encodeURIComponent(lessonId)}/complete`),
        ),
    };
}
