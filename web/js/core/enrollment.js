/**
 * Логика записей на курс для UI.
 *
 * Без DOM и без сети: чистые функции над ответами enrollment-service и
 * course-service, поэтому их можно проверять в Node. Представления лишь
 * рисуют результат.
 *
 * Прогресс считается по урокам курса (course-service), а не по размеру
 * прогресса: в записи приходит только список пройденных уроков, а общее
 * число уроков знает только сам курс.
 */

/**
 * Уроки курса в порядке модулей и уроков.
 *
 * @param {{modules?: Array<{lessons?: Array<object>}>}|null|undefined} course
 * @returns {Array<object>}
 */
export function courseLessons(course) {
    const modules = Array.isArray(course?.modules) ? course.modules : [];
    const lessons = [];
    for (const module of modules) {
        for (const lesson of Array.isArray(module?.lessons) ? module.lessons : []) {
            lessons.push(lesson);
        }
    }
    return lessons;
}

/**
 * Идентификаторы пройденных уроков записи (в виде строк — id из JSON).
 *
 * @param {{progress?: Array<{lessonId: string}>}|null|undefined} enrollment
 * @returns {Set<string>}
 */
export function completedLessonIds(enrollment) {
    const progress = Array.isArray(enrollment?.progress) ? enrollment.progress : [];
    return new Set(progress.map((entry) => String(entry?.lessonId)));
}

/**
 * Сводка прогресса: сколько уроков курса пройдено.
 *
 * @param {{progress?: Array<{lessonId: string}>}|null|undefined} enrollment
 * @param {{modules?: Array<{lessons?: Array<object>}>}|null|undefined} course
 * @returns {{completed: number, total: number, percent: number, done: Set<string>}}
 */
export function enrollmentProgress(enrollment, course) {
    const lessons = courseLessons(course);
    const done = completedLessonIds(enrollment);
    let completed = 0;
    for (const lesson of lessons) {
        if (done.has(String(lesson?.id))) {
            completed += 1;
        }
    }
    const total = lessons.length;
    return {
        completed,
        total,
        percent: total === 0 ? 0 : Math.round((completed / total) * 100),
        done,
    };
}

/**
 * Ищет запись по курсу (опционально — по статусу).
 *
 * @param {Array<object>|null|undefined} enrollments
 * @param {string} courseId
 * @param {'ACTIVE'|'CANCELLED'|'COMPLETED'|null} [status]
 * @returns {object|null}
 */
export function findEnrollment(enrollments, courseId, status = null) {
    const list = Array.isArray(enrollments) ? enrollments : [];
    return list.find((item) => String(item?.courseId) === String(courseId)
        && (status === null || item?.status === status)) ?? null;
}
