package com.lms.course.dto;

import java.time.Instant;
import java.util.UUID;

import com.lms.course.model.Course;

public record CourseSummaryResponse(
        UUID id,
        String title,
        String description,
        UUID instructorId,
        boolean published,
        Instant publishedAt,
        int enrolledCount,
        Instant createdAt,
        Instant updatedAt) {

    public static CourseSummaryResponse from(Course course) {
        return new CourseSummaryResponse(
                course.getId(),
                course.getTitle(),
                course.getDescription(),
                course.getInstructorId(),
                course.isPublished(),
                course.getPublishedAt(),
                course.getEnrolledCount(),
                course.getCreatedAt(),
                course.getUpdatedAt());
    }
}
