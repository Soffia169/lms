package com.lms.course.dto;

import java.util.UUID;

import com.lms.course.model.Lesson;

public record LessonResponse(UUID id, String title, String content, int position) {

    public static LessonResponse from(Lesson lesson) {
        return new LessonResponse(lesson.getId(), lesson.getTitle(), lesson.getContent(), lesson.getPosition());
    }
}
