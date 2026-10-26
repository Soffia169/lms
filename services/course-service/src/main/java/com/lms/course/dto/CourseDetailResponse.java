package com.lms.course.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.lms.course.model.Course;

public record CourseDetailResponse(
        UUID id,
        String title,
        String description,
        UUID instructorId,
        boolean published,
        Instant publishedAt,
        int enrolledCount,
        Instant createdAt,
        Instant updatedAt,
        List<ModuleResponse> modules) {

    public static CourseDetailResponse from(Course course) {
        return new CourseDetailResponse(
                course.getId(),
                course.getTitle(),
                course.getDescription(),
                course.getInstructorId(),
                course.isPublished(),
                course.getPublishedAt(),
                course.getEnrolledCount(),
                course.getCreatedAt(),
                course.getUpdatedAt(),
                course.getModules().stream().map(ModuleResponse::from).toList());
    }
}
