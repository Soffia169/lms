package com.lms.notification.messaging;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lms.common.events.EventEnvelope;
import com.lms.common.events.EventPayloads.EnrollmentCreatedEvent;
import com.lms.common.events.EventPayloads.LessonCompletedEvent;
import com.lms.common.events.EventPayloads.UserRegisteredEvent;
import com.lms.common.events.RabbitQueues;
import com.lms.notification.service.NotificationService;

import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

/** Слушатели событий, на которые отвечает notification-service. */
@Component
public class NotificationEventsListener {

    private final NotificationService notificationService;
    private final ObjectMapper objectMapper;

    public NotificationEventsListener(NotificationService notificationService, ObjectMapper objectMapper) {
        this.notificationService = notificationService;
        this.objectMapper = objectMapper;
    }

    @RabbitListener(queues = RabbitQueues.NOTIFICATION_USER_REGISTERED)
    public void onUserRegistered(EventEnvelope envelope) throws Exception {
        notificationService.onUserRegistered(envelope.eventId(),
                objectMapper.treeToValue(envelope.payload(), UserRegisteredEvent.class));
    }

    @RabbitListener(queues = RabbitQueues.NOTIFICATION_ENROLLMENT_CREATED)
    public void onEnrollmentCreated(EventEnvelope envelope) throws Exception {
        notificationService.onEnrollmentCreated(envelope.eventId(),
                objectMapper.treeToValue(envelope.payload(), EnrollmentCreatedEvent.class));
    }

    @RabbitListener(queues = RabbitQueues.NOTIFICATION_LESSON_COMPLETED)
    public void onLessonCompleted(EventEnvelope envelope) throws Exception {
        notificationService.onLessonCompleted(envelope.eventId(),
                objectMapper.treeToValue(envelope.payload(), LessonCompletedEvent.class));
    }
}
