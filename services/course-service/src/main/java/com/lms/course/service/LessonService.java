package com.lms.course.service;

import java.util.UUID;

import com.lms.course.model.Lesson;
import com.lms.course.repository.LessonRepository;
import com.lms.course.dto.LessonResponse;
import com.lms.course.dto.UpdateLessonRequest;
import com.lms.common.web.ResourceNotFoundException;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Сценарии урока. Владение проверяется по цепочке
 * lesson → module → course → instructor.
 */
@Service
public class LessonService {

    private final LessonRepository lessons;

    public LessonService(LessonRepository lessons) {
        this.lessons = lessons;
    }

    @Transactional
    public LessonResponse updateLesson(UUID lessonId, UpdateLessonRequest request, CurrentUser user) {
        Lesson lesson = requireLesson(lessonId);
        CourseAccessGuard.requireManageable(lesson.getModule().getCourse(), user);

        int position = request.position() != null ? request.position() : lesson.getPosition();
        lesson.update(request.title().trim(), request.content(), position);
        return LessonResponse.from(lesson);
    }

    @Transactional
    public void deleteLesson(UUID lessonId, CurrentUser user) {
        Lesson lesson = requireLesson(lessonId);
        CourseAccessGuard.requireManageable(lesson.getModule().getCourse(), user);
        lesson.getModule().removeLesson(lesson);
    }

    private Lesson requireLesson(UUID lessonId) {
        return lessons.findById(lessonId)
                .orElseThrow(() -> ResourceNotFoundException.of("Lesson", lessonId));
    }
}
