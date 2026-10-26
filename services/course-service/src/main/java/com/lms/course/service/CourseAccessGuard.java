package com.lms.course.service;

import com.lms.course.model.Course;

import org.springframework.security.access.AccessDeniedException;

/**
 * Проверка владения курсом. Инструктор управляет только своими курсами,
 * ADMIN — любыми.
 */
public final class CourseAccessGuard {

    private CourseAccessGuard() {
    }

    public static void requireManageable(Course course, CurrentUser user) {
        if (user.admin()) {
            return;
        }
        if (!course.getInstructorId().equals(user.id())) {
            throw new AccessDeniedException("Course belongs to another instructor");
        }
    }
}
