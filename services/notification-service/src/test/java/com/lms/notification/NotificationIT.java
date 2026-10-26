package com.lms.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lms.common.events.EventEnvelope;
import com.lms.common.events.EventPayloads.EnrollmentCreatedEvent;
import com.lms.common.events.EventPayloads.LessonCompletedEvent;
import com.lms.common.events.EventPayloads.UserRegisteredEvent;
import com.lms.common.events.EventTopics;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(classes = NotificationServiceApplication.class)
@AutoConfigureMockMvc
@Testcontainers
@Import(TestJwtConfiguration.class)
class NotificationIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");

    @Container
    @ServiceConnection
    static RabbitMQContainer rabbitmq = new RabbitMQContainer("rabbitmq:4-management-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final UUID studentId = UUID.randomUUID();
    private final UUID otherStudentId = UUID.randomUUID();

    @Test
    void eventsCreateNotificationsAndDuplicatesAreIgnored() throws Exception {
        UUID userEventId = UUID.randomUUID();
        EventEnvelope userRegistered = envelope(userEventId, EventTopics.USER_REGISTERED,
                new UserRegisteredEvent(studentId, "student@lms.local", "Ivan", "STUDENT", Instant.now()));

        send(EventTopics.USER_EVENTS, userRegistered);
        awaitNotifications(studentId, 1);

        // Повторная доставка не создаёт второе уведомление
        send(EventTopics.USER_EVENTS, userRegistered);
        Thread.sleep(500);
        assertThat(notificationCount(studentId)).isEqualTo(1);

        send(EventTopics.ENROLLMENT_EVENTS, envelope(UUID.randomUUID(), EventTopics.ENROLLMENT_CREATED,
                new EnrollmentCreatedEvent(UUID.randomUUID(), UUID.randomUUID(), studentId, Instant.now())));
        send(EventTopics.ENROLLMENT_EVENTS, envelope(UUID.randomUUID(), EventTopics.LESSON_COMPLETED,
                new LessonCompletedEvent(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                        studentId, Instant.now())));

        awaitNotifications(studentId, 3);

        String token = TestJwtConfiguration.token(studentId, "STUDENT");
        mockMvc.perform(get("/api/notifications").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].type").exists());
    }

    @Test
    void notificationsArePrivate() throws Exception {
        String token = TestJwtConfiguration.token(otherStudentId, "STUDENT");

        mockMvc.perform(get("/api/notifications").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void notificationsRequireToken() throws Exception {
        mockMvc.perform(get("/api/notifications"))
                .andExpect(status().isUnauthorized());
    }

    private EventEnvelope envelope(UUID eventId, String type, Object payload) {
        return new EventEnvelope(eventId, type, EventEnvelope.CURRENT_VERSION, Instant.now(),
                objectMapper.valueToTree(payload));
    }

    private void send(String exchange, EventEnvelope envelope) {
        rabbitTemplate.convertAndSend(exchange, envelope.type(), envelope);
    }

    private int notificationCount(UUID recipientId) {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from notifications where recipient_id = ?::uuid",
                Integer.class, recipientId.toString());
        return count == null ? 0 : count;
    }

    private void awaitNotifications(UUID recipientId, int expected) throws Exception {
        for (int attempt = 0; attempt < 50; attempt++) {
            if (notificationCount(recipientId) == expected) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("ожидалось " + expected + " уведомлений, получено " + notificationCount(recipientId));
    }
}
