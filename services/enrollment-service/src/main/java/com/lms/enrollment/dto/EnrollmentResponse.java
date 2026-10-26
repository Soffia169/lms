package com.lms.enrollment.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.lms.enrollment.model.CourseSnapshot;
import com.lms.enrollment.model.Enrollment;
import com.lms.enrollment.model.LessonProgress;

public record EnrollmentResponse(
        UUID id,
        UUID courseId,
        String courseTitle,
        String status,
        Instant enrolledAt,
        Instant cancelledAt,
        List<LessonProgressResponse> progress) {

    public static EnrollmentResponse from(Enrollment enrollment, CourseSnapshot snapshot,
                                          List<LessonProgress> progress) {
        return new EnrollmentResponse(
                enrollment.getId(),
                enrollment.getCourseId(),
                snapshot != null ? snapshot.getTitle() : null,
                enrollment.getStatus().name(),
                enrollment.getEnrolledAt(),
                enrollment.getCancelledAt(),
                progress.stream().map(LessonProgressResponse::from).toList());
    }

    public record LessonProgressResponse(UUID lessonId, Instant completedAt, BigDecimal score) {

        public static LessonProgressResponse from(LessonProgress progress) {
            return new LessonProgressResponse(progress.getLessonId(), progress.getCompletedAt(),
                    progress.getScore());
        }
    }
}
