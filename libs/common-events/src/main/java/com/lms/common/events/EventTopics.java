package com.lms.common.events;

/**
 * Каталог событий LMS: имена topic-exchange и routing keys.
 *
 * <p>Каталог — общий контракт всех producer/consumer. Имена нельзя менять без
 * синхронного обновления документации ({@code Architecture_Vision.md}, §6.2) и
 * всех участников обмена, иначе события начнут теряться в никуда.</p>
 */
public final class EventTopics {

    /** Exchange событий auth-service: {@code user.*}. */
    public static final String USER_EVENTS = "user.events";
    public static final String USER_REGISTERED = "user.registered";

    /** Exchange событий course-service: {@code course.*}. */
    public static final String COURSE_EVENTS = "course.events";
    public static final String COURSE_PUBLISHED = "course.published";
    public static final String COURSE_UPDATED = "course.updated";

    /** Exchange событий enrollment-service: {@code enrollment.*} и {@code lesson.*}. */
    public static final String ENROLLMENT_EVENTS = "enrollment.events";
    public static final String ENROLLMENT_CREATED = "enrollment.created";
    public static final String ENROLLMENT_CANCELLED = "enrollment.cancelled";
    public static final String LESSON_COMPLETED = "lesson.completed";

    /** Exchange событий assessment-service: {@code assessment.*}. */
    public static final String ASSESSMENT_EVENTS = "assessment.events";
    public static final String ASSESSMENT_SUBMITTED = "assessment.submitted";
    public static final String ASSESSMENT_GRADED = "assessment.graded";

    /**
     * Exchange для routing key события. Тип события совпадает с routing key,
     * поэтому producer'у достаточно одного поля.
     *
     * @throws IllegalArgumentException для неизвестного префикса
     */
    public static String exchangeFor(String routingKey) {
        if (routingKey.startsWith("user.")) {
            return USER_EVENTS;
        }
        if (routingKey.startsWith("course.")) {
            return COURSE_EVENTS;
        }
        if (routingKey.startsWith("enrollment.") || routingKey.startsWith("lesson.")) {
            return ENROLLMENT_EVENTS;
        }
        if (routingKey.startsWith("assessment.")) {
            return ASSESSMENT_EVENTS;
        }
        throw new IllegalArgumentException("Unknown routing key: " + routingKey);
    }

    private EventTopics() {
        throw new UnsupportedOperationException("Constants holder");
    }
}
