package com.lms.course;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lms.common.events.EventEnvelope;
import com.lms.common.events.EventPayloads.EnrollmentCancelledEvent;
import com.lms.common.events.EventPayloads.EnrollmentCreatedEvent;
import com.lms.common.events.EventTopics;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Сквозные сценарии course-service на реальной PostgreSQL:
 * владение курсом, роли, модули/уроки, публикация.
 */
@SpringBootTest(classes = CourseServiceApplication.class)
@AutoConfigureMockMvc
@Testcontainers
@Import(TestJwtConfiguration.class)
class CourseIT {

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

    private final UUID instructorId = UUID.randomUUID();
    private final UUID otherInstructorId = UUID.randomUUID();
    private final UUID studentId = UUID.randomUUID();
    private final UUID adminId = UUID.randomUUID();

    @Test
    void instructorBuildsPublishesAndDeletesCourse() throws Exception {
        String instructorToken = TestJwtConfiguration.token(instructorId, "INSTRUCTOR");

        String courseId = createCourse(instructorToken, "Java Basics");
        String moduleId = addModule(instructorToken, courseId, "Introduction");
        String lessonId = addLesson(instructorToken, moduleId, "What is JVM?");

        mockMvc.perform(get("/api/courses/{id}", courseId).header("Authorization", "Bearer " + instructorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Java Basics"))
                .andExpect(jsonPath("$.published").value(false))
                .andExpect(jsonPath("$.modules[0].id").value(moduleId))
                .andExpect(jsonPath("$.modules[0].lessons[0].id").value(lessonId))
                .andExpect(jsonPath("$.modules[0].lessons[0].content").value("JVM is a virtual machine"));

        mockMvc.perform(post("/api/courses/{id}/publish", courseId)
                        .header("Authorization", "Bearer " + instructorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.published").value(true))
                .andExpect(jsonPath("$.publishedAt").isNotEmpty());

        mockMvc.perform(get("/api/courses").queryParam("published", "true")
                        .header("Authorization", "Bearer " + instructorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '%s')]".formatted(courseId)).exists());

        mockMvc.perform(delete("/api/courses/{id}", courseId)
                        .header("Authorization", "Bearer " + instructorToken))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/courses/{id}", courseId).header("Authorization", "Bearer " + instructorToken))
                .andExpect(status().isNotFound());
    }

    @Test
    void studentCannotCreateCourse() throws Exception {
        mockMvc.perform(post("/api/courses")
                        .header("Authorization", "Bearer " + TestJwtConfiguration.token(studentId, "STUDENT"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("title", "Student course"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void unauthenticatedRequestIsRejected() throws Exception {
        mockMvc.perform(get("/api/courses"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void instructorCannotModifyForeignCourse() throws Exception {
        String ownerToken = TestJwtConfiguration.token(instructorId, "INSTRUCTOR");
        String intruderToken = TestJwtConfiguration.token(otherInstructorId, "INSTRUCTOR");
        String courseId = createCourse(ownerToken, "Owner course");

        mockMvc.perform(put("/api/courses/{id}", courseId)
                        .header("Authorization", "Bearer " + intruderToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("title", "Hijacked"))))
                .andExpect(status().isForbidden());

        mockMvc.perform(delete("/api/courses/{id}", courseId)
                        .header("Authorization", "Bearer " + intruderToken))
                .andExpect(status().isForbidden());

        // Владелец по-прежнему может менять свой курс
        mockMvc.perform(put("/api/courses/{id}", courseId)
                        .header("Authorization", "Bearer " + ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("title", "Renamed by owner"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Renamed by owner"));
    }

    @Test
    void adminCanModifyForeignCourse() throws Exception {
        String ownerToken = TestJwtConfiguration.token(instructorId, "INSTRUCTOR");
        String adminToken = TestJwtConfiguration.token(adminId, "ADMIN");
        String courseId = createCourse(ownerToken, "Admin managed course");

        mockMvc.perform(put("/api/courses/{id}", courseId)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("title", "Updated by admin"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Updated by admin"));
    }

    @Test
    void studentCanReadCourses() throws Exception {
        String instructorToken = TestJwtConfiguration.token(instructorId, "INSTRUCTOR");
        String courseId = createCourse(instructorToken, "Readable course");
        String studentToken = TestJwtConfiguration.token(studentId, "STUDENT");

        mockMvc.perform(get("/api/courses/{id}", courseId).header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(courseId));
    }

    @Test
    void validationErrorsAreProblemDetails() throws Exception {
        mockMvc.perform(post("/api/courses")
                        .header("Authorization", "Bearer " + TestJwtConfiguration.token(instructorId, "INSTRUCTOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("title", " "))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Validation Failed"))
                .andExpect(jsonPath("$.errors.title").exists());
    }

    @Test
    void moduleAndLessonCanBeUpdatedAndDeleted() throws Exception {
        String token = TestJwtConfiguration.token(instructorId, "INSTRUCTOR");
        String courseId = createCourse(token, "Editable course");
        String moduleId = addModule(token, courseId, "Module");
        String lessonId = addLesson(token, moduleId, "Lesson");

        mockMvc.perform(put("/api/modules/{id}", moduleId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("title", "Renamed module", "position", 2))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Renamed module"))
                .andExpect(jsonPath("$.position").value(2));

        mockMvc.perform(put("/api/lessons/{id}", lessonId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("title", "Renamed lesson", "content", "new", "position", 0))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Renamed lesson"))
                .andExpect(jsonPath("$.content").value("new"));

        mockMvc.perform(delete("/api/lessons/{id}", lessonId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/courses/{id}", courseId).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.modules[0].lessons").isEmpty());
    }

    @Test
    void publishIsIdempotentAndUnpublishClearsTimestamp() throws Exception {
        String token = TestJwtConfiguration.token(instructorId, "INSTRUCTOR");
        String courseId = createCourse(token, "Publishing course");

        mockMvc.perform(post("/api/courses/{id}/publish", courseId).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/courses/{id}/publish", courseId).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.published").value(true));

        mockMvc.perform(post("/api/courses/{id}/unpublish", courseId).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.published").value(false))
                .andExpect(jsonPath("$.publishedAt").isEmpty());
    }

    @Test
    void enrollmentCreatedIncrementsCounterAndDuplicateIsIgnored() throws Exception {
        String token = TestJwtConfiguration.token(instructorId, "INSTRUCTOR");
        String courseId = createCourse(token, "Counter course");
        UUID eventId = UUID.randomUUID();

        sendEnrollmentEvent(EventTopics.ENROLLMENT_CREATED,
                enrollmentCreated(envelopeId(eventId), courseId));
        awaitEnrolledCount(token, courseId, 1);

        // Повторная доставка того же события: счётчик не меняется
        sendEnrollmentEvent(EventTopics.ENROLLMENT_CREATED,
                enrollmentCreated(envelopeId(eventId), courseId));
        awaitProcessedOnce(eventId);
        assertThat(currentEnrolledCount(token, courseId)).isEqualTo(1);
    }

    @Test
    void enrollmentCancelledDecrementsCounter() throws Exception {
        String token = TestJwtConfiguration.token(instructorId, "INSTRUCTOR");
        String courseId = createCourse(token, "Cancellation course");

        sendEnrollmentEvent(EventTopics.ENROLLMENT_CREATED,
                enrollmentCreated(UUID.randomUUID(), courseId));
        awaitEnrolledCount(token, courseId, 1);

        EventEnvelope cancelled = new EventEnvelope(
                UUID.randomUUID(), EventTopics.ENROLLMENT_CANCELLED, EventEnvelope.CURRENT_VERSION,
                Instant.now(),
                objectMapper.valueToTree(new EnrollmentCancelledEvent(
                        UUID.randomUUID(), UUID.fromString(courseId), studentId, Instant.now())));
        sendEnrollmentEvent(EventTopics.ENROLLMENT_CANCELLED, cancelled);

        awaitEnrolledCount(token, courseId, 0);
    }

    @Test
    void publishingCourseWritesOutboxEvent() throws Exception {
        String token = TestJwtConfiguration.token(instructorId, "INSTRUCTOR");
        String courseId = createCourse(token, "Outbox course");

        mockMvc.perform(post("/api/courses/{id}/publish", courseId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        for (int attempt = 0; attempt < 50; attempt++) {
            Integer events = jdbcTemplate.queryForObject(
                    "select count(*) from outbox where type = 'course.published' and payload->>'courseId' = ?",
                    Integer.class, courseId);
            if (events != null && events > 0) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("outbox-событие course.published не появилось");
    }

    private EventEnvelope enrollmentCreated(UUID eventId, String courseId) {
        return new EventEnvelope(
                eventId, EventTopics.ENROLLMENT_CREATED, EventEnvelope.CURRENT_VERSION, Instant.now(),
                objectMapper.valueToTree(new EnrollmentCreatedEvent(
                        UUID.randomUUID(), UUID.fromString(courseId), studentId, Instant.now())));
    }

    private UUID envelopeId(UUID eventId) {
        return eventId;
    }

    private void sendEnrollmentEvent(String routingKey, EventEnvelope envelope) {
        rabbitTemplate.convertAndSend(EventTopics.ENROLLMENT_EVENTS, routingKey, envelope);
    }

    private void awaitEnrolledCount(String token, String courseId, int expected) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        int actual = -1;
        while (System.currentTimeMillis() < deadline) {
            actual = currentEnrolledCount(token, courseId);
            if (actual == expected) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("enrolledCount = " + actual + ", ожидалось " + expected);
    }

    private int currentEnrolledCount(String token, String courseId) throws Exception {
        String body = mockMvc.perform(get("/api/courses/{id}", courseId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(body).get("enrolledCount").asInt();
    }

    private void awaitProcessedOnce(UUID eventId) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            Integer processed = jdbcTemplate.queryForObject(
                    "select count(*) from processed_events where event_id = ?::uuid", Integer.class, eventId.toString());
            if (processed != null && processed == 1) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("processed_events не содержит событие " + eventId);
    }

    private String createCourse(String token, String title) throws Exception {
        String response = mockMvc.perform(post("/api/courses")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("title", title, "description", "Description"))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(response).get("id").asText();
    }

    private String addModule(String token, String courseId, String title) throws Exception {
        String response = mockMvc.perform(post("/api/courses/{id}/modules", courseId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("title", title))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        JsonNode body = objectMapper.readTree(response);
        assertThat(body.get("title").asText()).isEqualTo(title);
        return body.get("id").asText();
    }

    private String addLesson(String token, String moduleId, String title) throws Exception {
        String response = mockMvc.perform(post("/api/modules/{id}/lessons", moduleId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("title", title, "content", "JVM is a virtual machine"))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(response).get("id").asText();
    }

    private String json(Object body) throws Exception {
        return objectMapper.writeValueAsString(body);
    }
}
