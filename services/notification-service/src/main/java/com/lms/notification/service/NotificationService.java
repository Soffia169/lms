package com.lms.notification.service;

import java.time.Clock;
import java.util.UUID;

import com.lms.common.events.EventPayloads.EnrollmentCreatedEvent;
import com.lms.common.events.EventPayloads.LessonCompletedEvent;
import com.lms.common.events.EventPayloads.UserRegisteredEvent;
import com.lms.notification.messaging.ProcessedEventGuard;
import com.lms.notification.model.Notification;
import com.lms.notification.repository.NotificationRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Создание in-app уведомлений по событиям.
 *
 * <p>Email пока не отправляется — в лог пишется строка {@code [NOTIFICATION]},
 * этого достаточно для проверки сценария этапа 2. Каждое событие проходит
 * проверку идемпотентности в той же транзакции.</p>
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    static final String HANDLER_USER_REGISTERED = "notification.user-registered";
    static final String HANDLER_ENROLLMENT_CREATED = "notification.enrollment-created";
    static final String HANDLER_LESSON_COMPLETED = "notification.lesson-completed";

    private final NotificationRepository notifications;
    private final ProcessedEventGuard guard;
    private final Clock clock;

    public NotificationService(NotificationRepository notifications, ProcessedEventGuard guard, Clock clock) {
        this.notifications = notifications;
        this.guard = guard;
        this.clock = clock;
    }

    @Transactional
    public void onUserRegistered(UUID eventId, UserRegisteredEvent event) {
        if (!guard.firstProcessing(eventId, HANDLER_USER_REGISTERED)) {
            return;
        }
        save(event.userId(), "USER_REGISTERED", "Добро пожаловать в LMS",
                "Здравствуйте, " + event.fullName() + "! Аккаунт " + event.email() + " создан.",
                eventId);
        log.info("[NOTIFICATION] user.registered -> {} (email={})", event.userId(), event.email());
    }

    @Transactional
    public void onEnrollmentCreated(UUID eventId, EnrollmentCreatedEvent event) {
        if (!guard.firstProcessing(eventId, HANDLER_ENROLLMENT_CREATED)) {
            return;
        }
        save(event.studentId(), "ENROLLMENT_CREATED", "Вы записаны на курс",
                "Запись " + event.enrollmentId() + " на курс " + event.courseId() + " создана.",
                eventId);
        log.info("[NOTIFICATION] enrollment.created -> student={} course={}",
                event.studentId(), event.courseId());
    }

    @Transactional
    public void onLessonCompleted(UUID eventId, LessonCompletedEvent event) {
        if (!guard.firstProcessing(eventId, HANDLER_LESSON_COMPLETED)) {
            return;
        }
        save(event.studentId(), "LESSON_COMPLETED", "Урок завершён",
                "Урок " + event.lessonId() + " курса " + event.courseId() + " отмечен как пройденный.",
                eventId);
        log.info("[NOTIFICATION] lesson.completed -> student={} lesson={}",
                event.studentId(), event.lessonId());
    }

    private void save(UUID recipientId, String type, String subject, String body, UUID eventId) {
        notifications.save(new Notification(
                UUID.randomUUID(), recipientId, type, subject, body, eventId, clock.instant()));
    }
}
