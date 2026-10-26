/**
 * Страница курса: содержимое и управление им.
 *
 * Управление (правка, публикация, модули и уроки) показывается только
 * владельцу курса и ADMIN — ровно как проверяет CourseAccessGuard в
 * course-service. Бэкенд остаётся источником правды: скрытые кнопки — это
 * про удобство, а не про безопасность.
 */

import { actionButton, el, iconButton } from '../ui/dom.js';
import { createIcon } from '../ui/icons.js';
import { confirmDialog, openFormModal } from '../ui/modal.js';
import { compact } from '../ui/forms.js';
import { alertBox, emptyState } from '../ui/states.js';
import { toasts } from '../ui/toast.js';
import {
    formatDateTime,
    formatRelative,
    pluralRu,
    shortId,
    truncate,
} from '../core/format.js';
import { canManageCourse } from '../core/session.js';
import { courseLessons, findEnrollment } from '../core/enrollment.js';
import { ApiError, describeError } from '../core/errors.js';

/**
 * Поля формы курса (создание и редактирование — одинаковый набор).
 *
 * @returns {import('../ui/forms.js').FieldSpec[]}
 */
function courseFields() {
    return [
        {
            name: 'title',
            label: 'Название',
            required: true,
            maxLength: 200,
            placeholder: 'Например, Java для начинающих',
            autocomplete: 'off',
        },
        {
            name: 'description',
            label: 'Описание',
            type: 'textarea',
            maxLength: 5000,
            rows: 5,
            optionalLabel: true,
            placeholder: 'Чему научится студент, для кого курс',
        },
    ];
}

/**
 * Позиция в интерфейсе с 1, в API — с 0.
 *
 * @param {number|null|undefined} position
 * @returns {number|undefined}
 */
export function positionToInput(position) {
    return typeof position === 'number' ? position + 1 : undefined;
}

/**
 * @param {number|null|undefined} value значение из формы (с 1)
 * @returns {number|null} значение для API (с 0) либо null — «в конец»
 */
export function positionFromInput(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
        return null;
    }
    return Math.trunc(number) - 1;
}

/**
 * @param {object} ctx контекст приложения
 * @returns {Promise<{el: HTMLElement, title: string}>}
 */
export async function courseView(ctx) {
    const { courses, enrollments, session, params, navigate, reload } = ctx;

    const course = await courses.get(params.id);
    const manage = canManageCourse(session.user(), course, session.isAdmin());
    const modules = Array.isArray(course.modules) ? course.modules : [];
    const totalLessons = courseLessons(course).length;

    // Запись и прогресс доступны студенту, который не управляет курсом:
    // enrollment-service записывает только STUDENT, а владелец видит свои
    // инструменты управления.
    const isStudent = session.hasRole('STUDENT');
    const canEnroll = isStudent && !manage;
    let enrollment = null;
    if (canEnroll) {
        try {
            enrollment = findEnrollment(await enrollments.listMine(), course.id, 'ACTIVE');
        } catch (error) {
            // Список записей нужен только для панели записи: ошибку показываем
            // только в консоль, страница курса остаётся рабочий.
            console.warn('[lms] запись не загружена:', describeError(error));
        }
    }

    /**
     * Действие с тостом и перезагрузкой страницы.
     *
     * @param {() => Promise<unknown>} action
     * @param {string} successMessage
     * @returns {Promise<void>}
     */
    async function perform(action, successMessage) {
        try {
            await action();
            toasts.success(successMessage);
            reload();
        } catch (error) {
            toasts.error(describeError(error), 'Не удалось выполнить');
        }
    }

    // ---------- Запись на курс (этап 2) ----------

    /**
     * Понятный текст ошибки записи: пока снапшот курса ещё не поступил из
     * course-service, бэкенд отвечает 404 «Course is not available yet» —
     * достаточно подождать пару секунд.
     *
     * @param {unknown} error
     * @returns {string}
     */
    function describeEnrollError(error) {
        const base = describeError(error);
        if (error instanceof ApiError && error.status === 404) {
            return `${base} Снапшот курса долетает до enrollment-service не мгновенно — подождите пару секунд и попробуйте ещё раз.`;
        }
        return base;
    }

    async function enroll() {
        try {
            await enrollments.enroll(course.id);
            toasts.success('Вы записаны на курс', 'Запись активна');
            reload();
        } catch (error) {
            toasts.error(describeEnrollError(error), 'Не удалось записаться');
        }
    }

    async function cancelEnrollment() {
        const confirmed = await confirmDialog({
            title: 'Отменить запись?',
            message: 'Запись получит статус CANCELLED, отметки уроков сохранятся в истории.',
            confirmLabel: 'Отменить запись',
            note: 'Отмечать уроки можно только при активной записи: после отмены потребуется записаться снова.',
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

    async function completeLesson(lesson) {
        try {
            await enrollments.completeLesson(enrollment.id, lesson.id);
            toasts.success(`Урок «${lesson.title}» отмечен пройденным`);
            reload();
        } catch (error) {
            toasts.error(describeError(error), 'Не удалось отметить урок');
        }
    }

    const doneLessonIds = new Set((enrollment?.progress ?? [])
        .map((entry) => String(entry?.lessonId)));

    async function editCourse() {
        await openFormModal({
            title: 'Редактировать курс',
            submitLabel: 'Сохранить',
            fields: courseFields(),
            initial: { title: course.title, description: course.description ?? '' },
            onSubmit: async (values) => {
                await courses.update(course.id, compact(values));
                toasts.success('Курс обновлён');
                reload();
            },
        });
    }

    async function deleteCourse() {
        const confirmed = await confirmDialog({
            title: 'Удалить курс?',
            message: `Курс «${course.title}» будет удалён вместе с модулями и уроками. Действие необратимо.`,
            confirmLabel: 'Удалить курс',
            note: 'Связанные данные удаляются каскадом в course_db.',
        });
        if (!confirmed) {
            return;
        }
        try {
            await courses.remove(course.id);
            toasts.success('Курс удалён');
            navigate('/catalog');
        } catch (error) {
            toasts.error(describeError(error), 'Не удалось удалить курс');
        }
    }

    async function togglePublish() {
        const published = course.published;
        await perform(
            () => (published ? courses.unpublish(course.id) : courses.publish(course.id)),
            published ? 'Курс снят с публикации' : 'Курс опубликован',
        );
    }

    async function addModule() {
        await openFormModal({
            title: 'Новый модуль',
            description: 'Модуль — раздел курса, внутри него добавляются уроки.',
            submitLabel: 'Добавить модуль',
            fields: [
                { name: 'title', label: 'Название', required: true, maxLength: 200, autocomplete: 'off' },
                {
                    name: 'position',
                    label: 'Порядок',
                    type: 'number',
                    min: 1,
                    optionalLabel: true,
                    hint: 'Если не указать, модуль встанет в конец.',
                },
            ],
            onSubmit: async (values) => {
                await courses.addModule(course.id, {
                    title: values.title,
                    position: positionFromInput(values.position),
                });
                toasts.success('Модуль добавлен');
                reload();
            },
        });
    }

    async function editModule(module) {
        await openFormModal({
            title: 'Редактировать модуль',
            submitLabel: 'Сохранить',
            fields: [
                { name: 'title', label: 'Название', required: true, maxLength: 200, autocomplete: 'off' },
                { name: 'position', label: 'Порядок', type: 'number', min: 1, optionalLabel: true },
            ],
            initial: { title: module.title, position: positionToInput(module.position) },
            onSubmit: async (values) => {
                await courses.updateModule(module.id, {
                    title: values.title,
                    position: positionFromInput(values.position),
                });
                toasts.success('Модуль сохранён');
                reload();
            },
        });
    }

    async function deleteModule(module) {
        const lessonsCount = module.lessons?.length ?? 0;
        const confirmed = await confirmDialog({
            title: 'Удалить модуль?',
            message: `Модуль «${module.title}» будет удалён${lessonsCount > 0 ? ` вместе с уроками (${lessonsCount})` : ''}.`,
            confirmLabel: 'Удалить модуль',
        });
        if (!confirmed) {
            return;
        }
        await perform(() => courses.removeModule(module.id), 'Модуль удалён');
    }

    async function addLesson(module) {
        await openFormModal({
            title: 'Новый урок',
            description: `Модуль «${module.title}»`,
            wide: true,
            submitLabel: 'Добавить урок',
            fields: [
                { name: 'title', label: 'Название', required: true, maxLength: 200, autocomplete: 'off' },
                {
                    name: 'content',
                    label: 'Содержимое',
                    type: 'textarea',
                    rows: 8,
                    maxLength: 20000,
                    optionalLabel: true,
                    hint: 'Обычный текст: переносы строк сохраняются. Файлы и видео появятся на этапе 4.',
                },
                { name: 'position', label: 'Порядок', type: 'number', min: 1, optionalLabel: true },
            ],
            onSubmit: async (values) => {
                await courses.addLesson(module.id, {
                    title: values.title,
                    content: values.content || null,
                    position: positionFromInput(values.position),
                });
                toasts.success('Урок добавлен');
                reload();
            },
        });
    }

    async function editLesson(lesson) {
        await openFormModal({
            title: 'Редактировать урок',
            wide: true,
            submitLabel: 'Сохранить',
            fields: [
                { name: 'title', label: 'Название', required: true, maxLength: 200, autocomplete: 'off' },
                { name: 'content', label: 'Содержимое', type: 'textarea', rows: 8, maxLength: 20000, optionalLabel: true },
                { name: 'position', label: 'Порядок', type: 'number', min: 1, optionalLabel: true },
            ],
            initial: {
                title: lesson.title,
                content: lesson.content ?? '',
                position: positionToInput(lesson.position),
            },
            onSubmit: async (values) => {
                await courses.updateLesson(lesson.id, {
                    title: values.title,
                    content: values.content || null,
                    position: positionFromInput(values.position),
                });
                toasts.success('Урок сохранён');
                reload();
            },
        });
    }

    async function deleteLesson(lesson) {
        const confirmed = await confirmDialog({
            title: 'Удалить урок?',
            message: `Урок «${lesson.title}» будет удалён из модуля.`,
            confirmLabel: 'Удалить урок',
        });
        if (!confirmed) {
            return;
        }
        await perform(() => courses.removeLesson(lesson.id), 'Урок удалён');
    }

    /**
     * Отметки студента у урока: пройден/отметить. Показываются только при
     * активной записи; прогресс считает enrollment-service.
     *
     * @param {object} lesson
     * @returns {HTMLElement|null}
     */
    function lessonProgressState(lesson) {
        if (!enrollment || enrollment.status !== 'ACTIVE') {
            return null;
        }
        if (doneLessonIds.has(String(lesson.id))) {
            return el('span', { class: 'lesson__state', title: 'Урок пройден' },
                createIcon('check-circle', { size: 15 }),
                el('span', { text: 'Пройден' }));
        }
        return actionButton({
            type: 'button',
            label: 'Отметить пройденным',
            variant: 'outline',
            size: 'sm',
            icon: createIcon('check-circle', { size: 15 }),
            onClick: () => {
                void completeLesson(lesson);
            },
        });
    }

    function lessonNode(lesson, index) {
        const contentId = `lesson-content-${lesson.id}`;
        const contentNode = el('div', {
            class: 'lesson__content',
            id: contentId,
            hidden: true,
            text: lesson.content ?? '',
        });

        const toggle = el('button', {
            type: 'button',
            class: 'lesson__toggle',
            'aria-expanded': 'false',
            'aria-controls': contentId,
            onclick: () => {
                const expanded = toggle.getAttribute('aria-expanded') === 'true';
                toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
                contentNode.hidden = expanded;
            },
        },
        el('span', { class: 'lesson__chevron' }, createIcon('chevron-right', { size: 15 })),
        el('span', { class: 'lesson__index', text: String(index + 1) }),
        el('span', { class: 'lesson__title', text: lesson.title }));

        const actions = [];
        const progressState = lessonProgressState(lesson);
        if (progressState) {
            actions.push(el('div', { class: 'lesson__progress' }, progressState));
        }
        if (manage) {
            actions.push(el('div', { class: 'lesson__actions' },
                iconButton({
                    icon: createIcon('edit', { size: 15 }),
                    label: `Изменить урок «${lesson.title}»`,
                    onClick: () => {
                        void editLesson(lesson);
                    },
                }),
                iconButton({
                    icon: createIcon('trash', { size: 15 }),
                    label: `Удалить урок «${lesson.title}»`,
                    onClick: () => {
                        void deleteLesson(lesson);
                    },
                })));
        }

        return el('div', {
            class: `lesson${doneLessonIds.has(String(lesson.id)) ? ' lesson--done' : ''}`,
            dataset: { done: doneLessonIds.has(String(lesson.id)) ? 'true' : 'false' },
        },
        el('div', { class: 'lesson__row' },
            toggle,
            ...actions),
        contentNode);
    }

    function moduleNode(module, index) {
        const lessons = Array.isArray(module.lessons) ? module.lessons : [];
        return el('section', { class: 'module' },
            el('div', { class: 'module__head' },
                el('span', { class: 'module__index', 'aria-hidden': 'true', text: String(index + 1) }),
                el('div', { class: 'grow' },
                    el('div', { class: 'module__title', text: module.title }),
                    el('div', {
                        class: 'module__count',
                        text: `${lessons.length} ${pluralRu(lessons.length, ['урок', 'урока', 'уроков'])}`,
                    })),
                manage
                    ? el('div', { class: 'module__actions' },
                        iconButton({
                            icon: createIcon('plus', { size: 15 }),
                            label: `Добавить урок в модуль «${module.title}»`,
                            onClick: () => {
                                void addLesson(module);
                            },
                        }),
                        iconButton({
                            icon: createIcon('edit', { size: 15 }),
                            label: `Изменить модуль «${module.title}»`,
                            onClick: () => {
                                void editModule(module);
                            },
                        }),
                        iconButton({
                            icon: createIcon('trash', { size: 15 }),
                            label: `Удалить модуль «${module.title}»`,
                            onClick: () => {
                                void deleteModule(module);
                            },
                        }))
                    : null),
            el('div', { class: 'module__body' },
                lessons.length === 0
                    ? el('p', { class: 'hint', style: { padding: '8px 6px' }, text: manage ? 'В модуле нет уроков — добавьте первый.' : 'В модуле нет уроков.' })
                    : lessons.map((lesson, lessonIndex) => lessonNode(lesson, lessonIndex))));
    }

    const statusBadge = el('span', {
        class: `badge badge--dot ${course.published ? 'badge--success' : 'badge--warning'}`,
        text: course.published ? 'Опубликован' : 'Черновик',
    });

    const hero = el('section', { class: 'course-hero' },
        el('div', { class: 'row row--between', style: { alignItems: 'flex-start' } },
            el('div', { class: 'stack stack--tight grow' },
                el('div', { class: 'row' },
                    el('h1', { class: 'grow', style: { overflowWrap: 'anywhere' }, text: course.title }),
                    statusBadge),
                el('div', { class: 'meta' },
                    el('span', { class: 'meta__item', text: `создан ${formatDateTime(course.createdAt)}` }),
                    el('span', { class: 'meta__item', text: `обновлён ${formatRelative(course.updatedAt)}` }),
                    course.publishedAt
                        ? el('span', { class: 'meta__item', text: `опубликован ${formatDateTime(course.publishedAt)}` })
                        : null,
                    typeof course.enrolledCount === 'number'
                        ? el('span', { class: 'meta__item', text: `записались: ${course.enrolledCount}` })
                        : null,
                    el('span', { class: 'meta__item' },
                        'инструктор ',
                        el('code', { title: course.instructorId, text: shortId(course.instructorId) }),
                        String(course.instructorId) === String(session.user()?.id) ? ' (вы)' : ''),
                    el('span', { class: 'meta__item' },
                        'id ',
                        el('code', { title: course.id, text: shortId(course.id) })))),
            manage
                ? el('div', { class: 'course-hero__actions' },
                    actionButton({
                        type: 'button',
                        label: course.published ? 'Снять с публикации' : 'Опубликовать',
                        variant: 'outline',
                        icon: createIcon(course.published ? 'eye-off' : 'eye', { size: 16 }),
                        onClick: () => {
                            void togglePublish();
                        },
                    }),
                    actionButton({
                        type: 'button',
                        label: 'Редактировать',
                        variant: 'outline',
                        icon: createIcon('edit', { size: 16 }),
                        onClick: () => {
                            void editCourse();
                        },
                    }),
                    actionButton({
                        type: 'button',
                        label: 'Удалить',
                        variant: 'danger',
                        icon: createIcon('trash', { size: 16 }),
                        onClick: () => {
                            void deleteCourse();
                        },
                    }))
                : null),
        el('p', {
            class: `course-hero__description${course.description ? '' : ' faint'}`,
            text: course.description || 'Описание не заполнено.',
        }));

    const sectionHead = el('div', { class: 'section-head' },
        el('div', { class: 'section-head__title' },
            el('h2', { text: 'Модули' }),
            el('span', { class: 'badge', text: String(modules.length) })),
        manage
            ? actionButton({
                type: 'button',
                label: 'Добавить модуль',
                icon: createIcon('plus', { size: 16 }),
                onClick: () => {
                    void addModule();
                },
            })
            : null);

    /**
     * Панель записи (только для студентов, не управляющих курсом). Строится
     * по текущему состоянию: `enrollment` — активная запись, иначе кнопка
     * «Записаться» или подсказка о закрытом курсе.
     *
     * @returns {HTMLElement}
     */
    function enrollPanelNode() {
        const completed = doneLessonIds.size;
        const percent = totalLessons === 0 ? 0 : Math.round((completed / totalLessons) * 100);

        if (enrollment) {
            return el('section', { class: 'card panel enroll-panel' },
                el('div', { class: 'panel__head' },
                    el('div', { class: 'panel__title' }, createIcon('check-circle', { size: 18 }), el('h2', { text: 'Прогресс обучения' })),
                    el('span', { class: 'badge badge--dot badge--success', text: 'Вы записаны' })),
                el('div', { class: 'progress', role: 'presentation' },
                    el('div', {
                        class: 'progress__bar',
                        'data-done': completed === totalLessons ? 'true' : 'false',
                        style: { width: `${percent}%` },
                    })),
                el('p', {
                    class: 'progress-meta',
                    text: totalLessons === 0
                        ? 'В курсе пока нет уроков.'
                        : `Пройдено ${completed} из ${totalLessons} ${pluralRu(totalLessons, ['урок', 'урока', 'уроков'])} · ${percent}%`,
                }),
                el('p', {
                    class: 'hint',
                    text: `Запись активна с ${formatDateTime(enrollment.enrolledAt)} (id ${shortId(enrollment.id)}). Отмечайте уроки кнопкой «Отметить пройденным» — прогресс и уведомления придут через enrollment-service.`,
                }),
                el('div', { class: 'row' },
                    actionButton({
                        type: 'button',
                        label: 'Отменить запись',
                        variant: 'danger',
                        size: 'sm',
                        icon: createIcon('x', { size: 15 }),
                        onClick: () => {
                            void cancelEnrollment();
                        },
                    })),
                el('p', { class: 'hint', text: 'Отмена записи не удаляет прогресс: отметки уроков остаются в lesson_progress.' }));
        }

        if (!course.published) {
            return el('section', { class: 'card panel enroll-panel' },
                el('div', { class: 'panel__head' },
                    el('div', { class: 'panel__title' }, createIcon('book', { size: 18 }), el('h2', { text: 'Запись на курс' }))),
                el('p', {
                    class: 'progress-meta',
                    text: 'Записаться на черновик нельзя: enrollment-service принимает только опубликованные курсы.',
                }));
        }

        return el('section', { class: 'card panel enroll-panel' },
            el('div', { class: 'panel__head' },
                el('div', { class: 'panel__title' }, createIcon('book', { size: 18 }), el('h2', { text: 'Запись на курс' }))),
            el('p', {
                class: 'progress-meta',
                text: 'Вы не записаны на этот курс. Запись создаётся в enrollment-service: событие enrollment.created отправит уведомление, а уроки получат отметки прогресса.',
            }),
            el('div', { class: 'row' },
                actionButton({
                    type: 'button',
                    label: 'Записаться',
                    variant: 'primary',
                    icon: createIcon('check-circle', { size: 16 }),
                    onClick: () => {
                        void enroll();
                    },
                }),
                typeof course.enrolledCount === 'number'
                    ? el('span', { class: 'hint', text: `Уже записались: ${course.enrolledCount}` })
                    : null),
            el('p', { class: 'hint', text: 'Запись доступна роли STUDENT; одна активная запись на курс.' }));
    }

    const root = el('div', { class: 'stack' },
        el('nav', { class: 'breadcrumbs', 'aria-label': 'Навигация по разделу' },
            el('a', { href: '#/catalog', text: 'Каталог' }),
            el('span', { class: 'breadcrumbs__sep', text: '/' }),
            el('span', { text: truncate(course.title, 70) })),
        hero,
        canEnroll ? enrollPanelNode() : null,
        !manage
            ? alertBox({
                type: 'info',
                title: 'Режим просмотра',
                message: isStudent
                    ? 'Управлять курсом может инструктор-владелец или администратор. Запись и отметки уроков — в панели записи выше.'
                    : 'Управлять курсом может инструктор-владелец или администратор. Запись на курс доступна студентам.',
            })
            : !course.published
                ? alertBox({
                    type: 'warning',
                    title: 'Черновик',
                    message: 'Курс ещё не опубликован. Публикация выставляет флаг is_published и отправляет событие course.published — студенты увидят курс в каталоге.',
                })
                : null,
        sectionHead,
        modules.length === 0
            ? emptyState({
                icon: 'layers',
                title: 'Модулей пока нет',
                text: manage
                    ? 'Добавьте первый модуль, затем уроки внутри него.'
                    : 'Инструктор ещё не добавил модули в этот курс.',
                action: manage
                    ? el('button', {
                        type: 'button',
                        class: 'btn btn--primary btn--sm',
                        text: 'Добавить модуль',
                        onclick: () => {
                            void addModule();
                        },
                    })
                    : null,
            })
            : el('div', { class: 'module-list' }, ...modules.map((module, index) => moduleNode(module, index))),
        el('p', { class: 'hint', text: 'Порядок модулей и уроков задаётся полем position — сервис сортирует по нему.' }));

    return { el: root, title: course.title };
}
