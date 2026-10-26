package com.lms.common.events;

/**
 * Имена очередей и DLQ. Одна очередь — один консьюмер; имя содержит сервис,
 * чтобы владельца было видно в RabbitMQ management.
 */
public final class RabbitQueues {

    /** Dead-letter exchange, общий для всех событий LMS. */
    public static final String DLX = "lms.dlx";

    public static final String NOTIFICATION_USER_REGISTERED = "q.notification.user-registered";
    public static final String NOTIFICATION_ENROLLMENT_CREATED = "q.notification.enrollment-created";
    public static final String NOTIFICATION_LESSON_COMPLETED = "q.notification.lesson-completed";

    public static final String COURSE_ENROLLMENT_CREATED = "q.course.enrollment-created";
    public static final String COURSE_ENROLLMENT_CANCELLED = "q.course.enrollment-cancelled";

    public static final String ENROLLMENT_COURSE_PUBLISHED = "q.enrollment.course-published";
    public static final String ENROLLMENT_COURSE_UPDATED = "q.enrollment.course-updated";

    private RabbitQueues() {
    }

    public static String dlq(String queueName) {
        return queueName + ".dlq";
    }
}
