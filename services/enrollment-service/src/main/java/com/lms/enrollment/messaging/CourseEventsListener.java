package com.lms.enrollment.messaging;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lms.common.events.EventEnvelope;
import com.lms.common.events.EventPayloads.CoursePublishedEvent;
import com.lms.common.events.EventPayloads.CourseUpdatedEvent;
import com.lms.common.events.RabbitQueues;
import com.lms.enrollment.service.CourseSnapshotService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Снапшот курса обновляется по событиям course-service. */
@Component
public class CourseEventsListener {

    private static final Logger log = LoggerFactory.getLogger(CourseEventsListener.class);
    static final String HANDLER = "enrollment.course-snapshot";

    private final CourseSnapshotService snapshotService;
    private final ProcessedEventGuard guard;
    private final ObjectMapper objectMapper;

    public CourseEventsListener(CourseSnapshotService snapshotService, ProcessedEventGuard guard,
                                ObjectMapper objectMapper) {
        this.snapshotService = snapshotService;
        this.guard = guard;
        this.objectMapper = objectMapper;
    }

    @RabbitListener(queues = RabbitQueues.ENROLLMENT_COURSE_PUBLISHED)
    @Transactional
    public void onCoursePublished(EventEnvelope envelope) throws Exception {
        if (!guard.firstProcessing(envelope.eventId(), HANDLER)) {
            log.debug("Дубликат course.published {} проигнорирован", envelope.eventId());
            return;
        }
        CoursePublishedEvent event = objectMapper.treeToValue(envelope.payload(), CoursePublishedEvent.class);
        snapshotService.applyPublished(event);
        log.info("Снапшот опубликованного курса обновлён: {}", event.courseId());
    }

    @RabbitListener(queues = RabbitQueues.ENROLLMENT_COURSE_UPDATED)
    @Transactional
    public void onCourseUpdated(EventEnvelope envelope) throws Exception {
        if (!guard.firstProcessing(envelope.eventId(), HANDLER)) {
            log.debug("Дубликат course.updated {} проигнорирован", envelope.eventId());
            return;
        }
        CourseUpdatedEvent event = objectMapper.treeToValue(envelope.payload(), CourseUpdatedEvent.class);
        snapshotService.applyUpdated(event);
        log.info("Снапшот курса обновлён: {}", event.courseId());
    }
}
