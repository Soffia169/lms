import assert from 'node:assert/strict';
import test from 'node:test';

import {
    completedLessonIds,
    courseLessons,
    enrollmentProgress,
    findEnrollment,
} from '../js/core/enrollment.js';

const course = {
    modules: [
        { title: 'Введение', lessons: [{ id: 'l-1' }, { id: 'l-2' }] },
        { title: 'База', lessons: [{ id: 'l-3' }] },
    ],
};

test('courseLessons разворачивает уроки в порядке модулей', () => {
    assert.deepEqual(courseLessons(course).map((lesson) => lesson.id), ['l-1', 'l-2', 'l-3']);
    assert.deepEqual(courseLessons(null), []);
    assert.deepEqual(courseLessons({ modules: [] }), []);
    assert.deepEqual(courseLessons({ modules: [{ lessons: null }] }), []);
});

test('completedLessonIds приводит id к строкам', () => {
    const done = completedLessonIds({ progress: [{ lessonId: 'l-1' }, { lessonId: 'l-3' }] });
    assert.equal(done.size, 2);
    assert.equal(done.has('l-1'), true);
    assert.equal(done.has('l-3'), true);
    assert.deepEqual(completedLessonIds(null), new Set());
    assert.deepEqual(completedLessonIds({}), new Set());
});

test('enrollmentProgress считает по урокам курса, а не по длине прогресса', () => {
    const enrollment = { progress: [{ lessonId: 'l-1' }, { lessonId: 'чужой-урок' }] };
    assert.deepEqual(enrollmentProgress(enrollment, course), {
        completed: 1,
        total: 3,
        percent: 33,
        done: new Set(['l-1', 'чужой-урок']),
    });
});

test('enrollmentProgress корректен при пустом курсе и при 100%', () => {
    assert.deepEqual(enrollmentProgress(null, null), { completed: 0, total: 0, percent: 0, done: new Set() });
    const full = { progress: [{ lessonId: 'l-1' }, { lessonId: 'l-2' }, { lessonId: 'l-3' }] };
    assert.equal(enrollmentProgress(full, course).percent, 100);
    // округление: 2 из 3 → 67%
    assert.equal(enrollmentProgress({ progress: [{ lessonId: 'l-1' }, { lessonId: 'l-2' }] }, course).percent, 67);
});

test('findEnrollment ищет по курсу и статусу', () => {
    const list = [
        { courseId: 'c-1', status: 'CANCELLED', id: 'e-0' },
        { courseId: 'c-1', status: 'ACTIVE', id: 'e-1' },
        { courseId: 'c-2', status: 'ACTIVE', id: 'e-2' },
    ];
    assert.equal(findEnrollment(list, 'c-1')?.id, 'e-0');
    assert.equal(findEnrollment(list, 'c-1', 'ACTIVE')?.id, 'e-1');
    assert.equal(findEnrollment(list, 'c-2', 'CANCELLED'), null);
    assert.equal(findEnrollment(list, 'c-9'), null);
    assert.equal(findEnrollment(null, 'c-1'), null);
    // id курса приходит строкой или UUID — сравнение строковое
    assert.equal(findEnrollment(list, 'c-2')?.id, 'e-2');
});
