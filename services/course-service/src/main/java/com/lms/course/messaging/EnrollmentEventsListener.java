package com.lms.course.messaging;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lms.common.events.EventEnvelope;
import com.lms.common.events.EventPayloads.EnrollmentCancelledEvent;
import com.lms.common.events.EventPayloads.EnrollmentCreatedEvent;
import com.lms.common.events.RabbitQueues;
import com.lms.course.repository.CourseRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Счётчик записавшихся в course_db.
 *
 * <p>События приходят с at-least-once, поэтому каждое проходит проверку
 * {@link ProcessedEventGuard} в той же транзакции, что и изменение счётчика.</p>
 */
@Component
public class EnrollmentEventsListener {

    private static final Logger log = LoggerFactory.getLogger(EnrollmentEventsListener.class);

    static final String HANDLER = "course.enrolled-count";

    private final CourseRepository courses;
    private final ProcessedEventGuard guard;
    private final ObjectMapper objectMapper;

    public EnrollmentEventsListener(CourseRepository courses, ProcessedEventGuard guard, ObjectMapper objectMapper) {
        this.courses = courses;
        this.guard = guard;
        this.objectMapper = objectMapper;
    }

    @RabbitListener(queues = RabbitQueues.COURSE_ENROLLMENT_CREATED)
    @Transactional
    public void onEnrollmentCreated(EventEnvelope envelope) throws Exception {
        if (!guard.firstProcessing(envelope.eventId(), HANDLER)) {
            log.debug("Дубликат enrollment.created {} проигнорирован", envelope.eventId());
            return;
        }
        EnrollmentCreatedEvent event = objectMapper.treeToValue(envelope.payload(), EnrollmentCreatedEvent.class);
        int updated = courses.adjustEnrolledCount(event.courseId(), 1);
        log.info("Курс {}: +1 записавшийся (updated={})", event.courseId(), updated);
    }

    @RabbitListener(queues = RabbitQueues.COURSE_ENROLLMENT_CANCELLED)
    @Transactional
    public void onEnrollmentCancelled(EventEnvelope envelope) throws Exception {
        if (!guard.firstProcessing(envelope.eventId(), HANDLER)) {
            log.debug("Дубликат enrollment.cancelled {} проигнорирован", envelope.eventId());
            return;
        }
        EnrollmentCancelledEvent event = objectMapper.treeToValue(envelope.payload(), EnrollmentCancelledEvent.class);
        int updated = courses.adjustEnrolledCount(event.courseId(), -1);
        log.info("Курс {}: -1 записавшийся (updated={})", event.courseId(), updated);
    }
}
