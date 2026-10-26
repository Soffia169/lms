/**
 * «Мои курсы» — записи студента и прогресс по урокам (этап 2).
 *
 * Список записей отдаёт enrollment-service (`GET /api/enrollments`), а общее
 * число уроков знает только course-service, поэтому для процента догружаются
 * детали курсов (по одному запросу на курс — список у студента короткий).
 * Прогресс считается в core/enrollment.js, здесь только отрисовка.
 */

import { actionButton, el } from '../ui/dom.js';
import { createIcon } from '../ui/icons.js';
import { alertBox, emptyState } from '../ui/states.js';
import { confirmDialog } from '../ui/modal.js';
import { toasts } from '../ui/toast.js';
import { formatDateTime, pluralRu, shortId } from '../core/format.js';
import { enrollmentProgress } from '../core/enrollment.js';
import { describeError } from '../core/errors.js';

const STATUS_LABELS = {
    ACTIVE: 'Проходит',
    COMPLETED: 'Завершён',
    CANCELLED: 'Отменена',
};

const STATUS_TONES = {
    ACTIVE: 'badge--dot badge--success',
    COMPLETED: 'badge--dot badge--accent',
    CANCELLED: 'badge--dot',
};

/**
 * @param {object} ctx контекст приложения
 * @returns {Promise<{el: HTMLElement, title: string}>}
 */
export async function myCoursesView(ctx) {
    const { enrollments, courses, session, reload } = ctx;
    const isStudent = session.hasRole('STUDENT');

    const list = isStudent ? await enrollments.listMine() : [];
    const rows = await Promise.all(asList(list).map((enrollment) => attachCourse(enrollment, courses)));
    const active = rows.filter((row) => row.enrollment.status === 'ACTIVE');
    const archive = rows.filter((row) => row.enrollment.status !== 'ACTIVE');

    const root = el('div', { class: 'stack' },
        el('div', { class: 'page-head' },
            el('div', { class: 'page-head__text' },
                el('h1', { class: 'page-head__title', text: 'Мои курсы' }),
                el('p', {
                    class: 'page-head__subtitle',
                    text: 'Записи на курсы и прогресс по урокам. Отметки уроков — на странице курса.',
                }))),
        !isStudent
            ? alertBox({
                type: 'info',
                title: 'Запись доступна студентам',
                message: 'Записаться на курс может пользователь с ролью STUDENT — так же проверяет enrollment-service. Инструкторы и администраторы видят каталог, но записей у них нет.',
            })
            : null,
        sections());

    function sections() {
        if (active.length === 0 && archive.length === 0) {
            if (!isStudent) {
                return el('div');
            }
            return emptyState({
                icon: 'bookmark',
                title: 'Записей пока нет',
                text: 'Выберите курс в каталоге и нажмите «Записаться» — запись появится здесь, а страница курса покажет отметки уроков.',
                action: el('a', { class: 'btn btn--primary btn--sm', href: '#/catalog', text: 'Перейти в каталог' }),
            });
        }
        return el('div', { class: 'stack' },
            el('div', { class: 'stack stack--tight' },
                el('div', { class: 'section-head' },
                    el('div', { class: 'section-head__title' },
                        el('h2', { text: 'Активные записи' }),
                        el('span', { class: 'badge', text: String(active.length) }))),
                active.length === 0
                    ? el('p', { class: 'hint', text: 'Активных записей нет — можно записаться на курс в каталоге.' })
                    : el('div', { class: 'enroll-grid' }, ...active.map(enrollCard))),
            archive.length === 0
                ? null
                : el('div', { class: 'stack stack--tight' },
                    el('div', { class: 'section-head' },
                        el('div', { class: 'section-head__title' },
                            el('h2', { text: 'Архив' }),
                            el('span', { class: 'badge', text: String(archive.length) }))),
                    el('div', { class: 'enroll-grid' }, ...archive.map(enrollCard))),
            el('p', {
                class: 'hint',
                text: 'Прогресс считается по урокам курса; запись после отмены прогресс сохраняет, но отмечать уроки заново нельзя — потребуется новая запись.',
            }));
    }

    /**
     * @param {object} enrollment запись из enrollment-service
     * @param {object} courses api курса
     * @returns {Promise<{enrollment: object, course: object|null}>} course — детали или null (курс мог быть удалён)
     */
    async function attachCourse(enrollment, courses) {
        try {
            return { enrollment, course: await courses.get(enrollment.courseId) };
        } catch (error) {
            // Курс удалили после записи — карточка живёт по данным записи.
            console.warn('[lms] детали курса недоступны:', describeError(error));
            return { enrollment, course: null };
        }
    }

    function enrollCard({ enrollment, course }) {
        const summary = enrollmentProgress(enrollment, course);
        const statusLabel = STATUS_LABELS[enrollment.status] ?? enrollment.status;

        return el('article', { class: 'enroll-card', 'data-status': enrollment.status ?? '' },
            el('div', { class: 'course-card__top' },
                el('h2', { class: 'course-card__title' }, el('a', {
                    href: `#/courses/${enrollment.courseId}`,
                    text: enrollment.courseTitle || course?.title || 'Курс',
                })),
                el('span', { class: `badge ${STATUS_TONES[enrollment.status] ?? ''}`, text: statusLabel })),
            progressLine(summary),
            el('div', { class: 'course-card__footer' },
                el('span', { class: 'nowrap', text: `запись от ${formatDateTime(enrollment.enrolledAt)}` }),
                el('span', {
                    class: 'nowrap',
                    title: `enrollmentId: ${enrollment.id}`,
                    text: `id ${shortId(enrollment.id)}`,
                })),
            el('div', { class: 'row' },
                el('a', { class: 'btn btn--outline btn--sm', href: `#/courses/${enrollment.courseId}`, text: 'Открыть курс' }),
                enrollment.status === 'ACTIVE'
                    ? actionButton({
                        type: 'button',
                        label: 'Отменить запись',
                        variant: 'danger',
                        size: 'sm',
                        icon: createIcon('x', { size: 15 }),
                        onClick: () => {
                            void cancelEnrollment(enrollment);
                        },
                    })
                    : null));
    }

    function progressLine(summary) {
        const { completed, total } = summary;
        if (total === 0) {
            return el('p', { class: 'progress-meta faint', text: 'В курсе пока нет уроков.' });
        }
        const label = `${completed} из ${total} ${pluralRu(total, ['урок', 'урока', 'уроков'])}`;
        return el('div', { class: 'stack stack--tight' },
            el('div', { class: 'progress', role: 'presentation' },
                el('div', {
                    class: 'progress__bar',
                    'data-done': completed === total ? 'true' : 'false',
                    style: { width: `${summary.percent}%` },
                })),
            el('p', {
                class: 'progress-meta',
                text: `Пройдено ${label} · ${summary.percent}%`,
            }));
    }

    async function cancelEnrollment(enrollment) {
        const confirmed = await confirmDialog({
            title: 'Отменить запись?',
            message: `Запись на курс «${enrollment.courseTitle ?? 'курс'}» получит статус CANCELLED.`,
            confirmLabel: 'Отменить запись',
            note: 'Сохранённый прогресс не удаляется, но отмечать уроки можно только при активной записи.',
        });
        if (!confirmed) {
            return;
        }
        try {
            await enrollments.cancel(enrollment.id);
            toasts.success('Запись отменена');
            reload();
        } catch (error) {
            toasts.error(describeError(error), 'Не удалось отменить запись');
        }
    }

    return { el: root, title: 'Мои курсы' };
}

function asList(value) {
    return Array.isArray(value) ? value : [];
}
