package com.lms.common.events;

/** Полезные нагрузки событий. Все поля — плоские, без вложенных сущностей. */

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class EventPayloads {

    private EventPayloads() {
    }

    public record UserRegisteredEvent(UUID userId, String email, String fullName, String role,
                                      Instant registeredAt) {
    }

    public record CoursePublishedEvent(UUID courseId, UUID instructorId, String title, String description,
                                       List<UUID> lessonIds, Instant publishedAt) {
    }

    public record CourseUpdatedEvent(UUID courseId, UUID instructorId, String title, String description,
                                     boolean published, Instant publishedAt, List<UUID> lessonIds,
                                     Instant updatedAt) {
    }

    public record EnrollmentCreatedEvent(UUID enrollmentId, UUID courseId, UUID studentId,
                                         Instant enrolledAt) {
    }

    public record EnrollmentCancelledEvent(UUID enrollmentId, UUID courseId, UUID studentId,
                                           Instant cancelledAt) {
    }

    public record LessonCompletedEvent(UUID enrollmentId, UUID courseId, UUID lessonId, UUID studentId,
                                       Instant completedAt) {
    }
}
