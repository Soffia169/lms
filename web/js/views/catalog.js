/**
 * Каталог курсов.
 *
 * GET /api/courses?published= — единственный «списочный» endpoint этапа 1,
 * поэтому поиск и счётчики считаются на клиенте по уже загруженному списку:
 * дополнительных запросов на каждое нажатие клавиши нет.
 */

import { actionButton, debounce, el, iconButton } from '../ui/dom.js';
import { createIcon } from '../ui/icons.js';
import { openFormModal } from '../ui/modal.js';
import { compact } from '../ui/forms.js';
import { emptyState } from '../ui/states.js';
import { toasts } from '../ui/toast.js';
import { formatRelative, shortId, truncate } from '../core/format.js';

const FILTERS = [
    { value: 'all', label: 'Все', published: undefined },
    { value: 'published', label: 'Опубликованные', published: true },
    { value: 'draft', label: 'Черновики', published: false },
];

// Фильтр запоминается между перерисовками страницы (например, после создания курса).
let rememberedFilter = null;
let rememberedSearch = '';

/**
 * @param {object} ctx контекст приложения
 * @returns {Promise<{el: HTMLElement, title: string}>}
 */
export async function catalogView(ctx) {
    const { courses, session, navigate, reload } = ctx;
    const canAuthor = session.canAuthorCourses();

    // Фильтр запоминается между перерисовками, но «Все» не должен показывать
    // черновики студенту после входа другим пользователем в той же вкладке.
    if (rememberedFilter === null || (!canAuthor && rememberedFilter === 'all')) {
        rememberedFilter = canAuthor ? 'all' : 'published';
    }

    const state = { filter: rememberedFilter, search: rememberedSearch, items: [] };
    const items = await courses.list({ published: currentFilter().published });
    state.items = Array.isArray(items) ? items : [];

    const gridHolder = el('div');
    const countNode = el('p', { class: 'hint', 'aria-live': 'polite' });

    const filterButtons = FILTERS.map((filter) => el('button', {
        type: 'button',
        class: 'segmented__button',
        'aria-pressed': filter.value === state.filter ? 'true' : 'false',
        text: filter.label,
        onclick: () => selectFilter(filter.value),
    }));

    const searchInput = el('input', {
        class: 'input',
        type: 'search',
        placeholder: 'Поиск по названию и описанию',
        'aria-label': 'Поиск курсов',
        value: state.search,
        oninput: debounce((event) => {
            state.search = event.target.value;
            rememberedSearch = state.search;
            renderGrid();
        }, 180),
    });

    const toolbar = el('div', { class: 'toolbar' },
        el('div', { class: 'toolbar__search' },
            el('span', { class: 'toolbar__search-icon' }, createIcon('search', { size: 16 })),
            searchInput),
        el('div', { class: 'segmented', role: 'group', 'aria-label': 'Фильтр по публикации' }, ...filterButtons),
        iconButton({
            icon: createIcon('refresh', { size: 17 }),
            label: 'Обновить список',
            onClick: () => reload(),
        }));

    const createButton = canAuthor
        ? actionButton({
            type: 'button',
            label: 'Новый курс',
            icon: createIcon('plus', { size: 17 }),
            onClick: () => {
                void createCourse();
            },
        })
        : null;

    const root = el('div', { class: 'stack' },
        el('div', { class: 'page-head' },
            el('div', { class: 'page-head__text' },
                el('h1', { class: 'page-head__title', text: 'Каталог курсов' }),
                el('p', {
                    class: 'page-head__subtitle',
                    text: canAuthor
                        ? 'Ваши черновики и опубликованные курсы. Управление доступно на странице курса.'
                        : 'Опубликованные курсы платформы. Запись на курс — на странице курса студентом.',
                })),
            el('div', { class: 'page-head__actions' }, createButton)),
        toolbar,
        countNode,
        gridHolder);

    function currentFilter() {
        return FILTERS.find((filter) => filter.value === state.filter) ?? FILTERS[0];
    }

    function selectFilter(value) {
        if (state.filter === value) {
            return;
        }
        state.filter = value;
        rememberedFilter = value;
        for (const [index, button] of filterButtons.entries()) {
            button.setAttribute('aria-pressed', FILTERS[index].value === value ? 'true' : 'false');
        }
        // Фильтр по публикации — серверный параметр, поэтому перезагружаем страницу.
        reload();
    }

    function renderGrid() {
        const visible = state.items.filter(matchesSearch(state.search));
        countNode.textContent = describeCount(visible.length, state.items.length, state.search);
        gridHolder.replaceChildren(visible.length === 0
            ? emptyState({
                icon: 'book',
                title: state.search ? 'Ничего не найдено' : 'Курсов пока нет',
                text: state.search
                    ? `По запросу «${truncate(state.search, 60)}» курсов не найдено. Попробуйте другой текст.`
                    : canAuthor
                        ? 'Создайте первый курс: дальше добавите модули и уроки и опубликуете его.'
                        : 'Как только инструктор опубликует курс, он появится здесь.',
                action: state.search
                    ? el('button', {
                        type: 'button',
                        class: 'btn btn--outline btn--sm',
                        text: 'Сбросить поиск',
                        onclick: () => {
                            state.search = '';
                            rememberedSearch = '';
                            searchInput.value = '';
                            renderGrid();
                        },
                    })
                    : canAuthor
                        ? el('button', {
                            type: 'button',
                            class: 'btn btn--primary btn--sm',
                            text: 'Создать курс',
                            onclick: () => {
                                void createCourse();
                            },
                        })
                        : null,
            })
            : el('div', { class: 'course-grid' }, ...visible.map((course) => courseCard(course))));
    }

    function courseCard(course) {
        const own = String(course.instructorId) === String(session.user()?.id);
        return el('article', { class: 'course-card' },
            el('div', { class: 'course-card__top' },
                el('h2', { class: 'course-card__title' }, el('a', {
                    href: `#/courses/${course.id}`,
                    text: course.title,
                })),
                el('span', {
                    class: `badge badge--dot ${course.published ? 'badge--success' : 'badge--warning'}`,
                    text: course.published ? 'Опубликован' : 'Черновик',
                })),
            el('p', { class: 'course-card__text', text: course.description || 'Без описания' }),
            el('div', { class: 'course-card__footer' },
                el('span', {
                    class: 'nowrap',
                    title: `instructorId: ${course.instructorId}`,
                    text: own ? 'Ваш курс' : `Инструктор ${shortId(course.instructorId)}`,
                }),
                el('span', { class: 'nowrap', text: `создан ${formatRelative(course.createdAt)}` })));
    }

    async function createCourse() {
        await openFormModal({
            title: 'Новый курс',
            description: 'Курс создаётся черновиком: модули и уроки добавляются на странице курса.',
            submitLabel: 'Создать курс',
            fields: [
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
                    rows: 4,
                    optionalLabel: true,
                    placeholder: 'Чему научится студент, для кого курс',
                },
            ],
            onSubmit: async (values) => {
                const created = await courses.create(compact(values));
                toasts.success(`Курс «${created.title}» создан`, 'Готово');
                navigate(`/courses/${created.id}`);
            },
        });
    }

    renderGrid();
    return { el: root, title: 'Каталог' };
}

function matchesSearch(search) {
    const needle = String(search ?? '').trim().toLowerCase();
    if (needle === '') {
        return () => true;
    }
    return (course) => `${course.title ?? ''} ${course.description ?? ''}`.toLowerCase().includes(needle);
}

function describeCount(visible, total, search) {
    if (total === 0) {
        return 'В каталоге нет курсов.';
    }
    const suffix = search && visible !== total ? `, по фильтру показано ${visible}` : '';
    return `Курсов: ${total}${suffix}`;
}

