package com.lms.course.dto;

import java.util.List;
import java.util.UUID;

import com.lms.course.model.CourseModule;
import com.lms.course.model.Lesson;

public record ModuleResponse(UUID id, String title, int position, List<LessonResponse> lessons) {

    public static ModuleResponse from(CourseModule module) {
        return new ModuleResponse(
                module.getId(),
                module.getTitle(),
                module.getPosition(),
                module.getLessons().stream().map(LessonResponse::from).toList());
    }

    public record LessonResponse(UUID id, String title, String content, int position) {

        public static LessonResponse from(Lesson lesson) {
            return new LessonResponse(lesson.getId(), lesson.getTitle(), lesson.getContent(), lesson.getPosition());
        }
    }
}
