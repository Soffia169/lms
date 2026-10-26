package com.lms.enrollment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lms.common.events.EventEnvelope;
import com.lms.common.events.EventPayloads.CoursePublishedEvent;
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
 * Сквозные сценарии enrollment-service: снапшот из событий, запись, прогресс,
 * отмена и идемпотентность консьюмера.
 */
@SpringBootTest(classes = EnrollmentServiceApplication.class)
@AutoConfigureMockMvc
@Testcontainers
@Import(TestJwtConfiguration.class)
class EnrollmentIT {

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
    private final UUID instructorId = UUID.randomUUID();

    @Test
    void enrollCompleteAndCancelFlow() throws Exception {
        String token = TestJwtConfiguration.token(studentId, "STUDENT");
        UUID courseId = UUID.randomUUID();
        UUID lessonId = UUID.randomUUID();
        publishCourse(courseId, lessonId);
        awaitSnapshot(courseId);

        String enrollmentId = enroll(token, courseId);

        mockMvc.perform(post("/api/enrollments")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("courseId", courseId))))
                .andExpect(status().isConflict());

        mockMvc.perform(get("/api/enrollments").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(enrollmentId))
                .andExpect(jsonPath("$[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$[0].courseTitle").value("Course"));

        mockMvc.perform(post("/api/enrollments/{id}/lessons/{lessonId}/complete", enrollmentId, lessonId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lessonId").value(lessonId.toString()));

        // Повторная отметка идемпотентна и не порождает второе событие
        mockMvc.perform(post("/api/enrollments/{id}/lessons/{lessonId}/complete", enrollmentId, lessonId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        awaitOutboxEvents("lesson.completed", enrollmentId, 1);

        mockMvc.perform(post("/api/enrollments/{id}/cancel", enrollmentId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));

        mockMvc.perform(post("/api/enrollments/{id}/cancel", enrollmentId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict());

        // После отмены можно записаться снова — новая активная запись
        enroll(token, courseId);
    }

    @Test
    void enrollRequiresSnapshotAndStudentRole() throws Exception {
        String studentToken = TestJwtConfiguration.token(studentId, "STUDENT");
        String instructorToken = TestJwtConfiguration.token(instructorId, "INSTRUCTOR");

        mockMvc.perform(post("/api/enrollments")
                        .header("Authorization", "Bearer " + studentToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("courseId", UUID.randomUUID()))))
                .andExpect(status().isNotFound());

        mockMvc.perform(post("/api/enrollments")
                        .header("Authorization", "Bearer " + instructorToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("courseId", UUID.randomUUID()))))
                .andExpect(status().isForbidden());
    }

    @Test
    void foreignEnrollmentIsForbidden() throws Exception {
        String token = TestJwtConfiguration.token(studentId, "STUDENT");
        UUID courseId = UUID.randomUUID();
        publishCourse(courseId, UUID.randomUUID());
        awaitSnapshot(courseId);

        String enrollmentId = enroll(token, courseId);
        String otherToken = TestJwtConfiguration.token(otherStudentId, "STUDENT");

        mockMvc.perform(get("/api/enrollments/{id}", enrollmentId)
                        .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void lessonOutsideCourseIsRejected() throws Exception {
        String token = TestJwtConfiguration.token(studentId, "STUDENT");
        UUID courseId = UUID.randomUUID();
        publishCourse(courseId, UUID.randomUUID());
        awaitSnapshot(courseId);

        String enrollmentId = enroll(token, courseId);

        mockMvc.perform(post("/api/enrollments/{id}/lessons/{lessonId}/complete",
                        enrollmentId, UUID.randomUUID())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    @Test
    void duplicateCoursePublishedEventIsIdempotent() throws Exception {
        UUID courseId = UUID.randomUUID();
        UUID lessonId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        EventEnvelope envelope = coursePublished(eventId, courseId, lessonId);

        send(envelope);
        awaitSnapshot(courseId);
        send(envelope);

        awaitProcessed(eventId);
        Thread.sleep(300);

        Integer processed = jdbcTemplate.queryForObject(
                "select count(*) from processed_events where event_id = ?::uuid",
                Integer.class, eventId.toString());
        Integer lessons = jdbcTemplate.queryForObject(
                "select count(*) from course_snapshot_lesson where course_id = ?::uuid",
                Integer.class, courseId.toString());

        assertThat(processed).isEqualTo(1);
        assertThat(lessons).isEqualTo(1);
    }

    private void publishCourse(UUID courseId, UUID lessonId) {
        send(coursePublished(UUID.randomUUID(), courseId, lessonId));
    }

    private EventEnvelope coursePublished(UUID eventId, UUID courseId, UUID lessonId) {
        return new EventEnvelope(
                eventId, EventTopics.COURSE_PUBLISHED, EventEnvelope.CURRENT_VERSION, Instant.now(),
                objectMapper.valueToTree(new CoursePublishedEvent(
                        courseId, instructorId, "Course", "Description",
                        List.of(lessonId), Instant.now())));
    }

    private void send(EventEnvelope envelope) {
        rabbitTemplate.convertAndSend(EventTopics.COURSE_EVENTS, envelope.type(), envelope);
    }

    private String enroll(String token, UUID courseId) throws Exception {
        String response = mockMvc.perform(post("/api/enrollments")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("courseId", courseId))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        JsonNode body = objectMapper.readTree(response);
        assertThat(body.get("status").asText()).isEqualTo("ACTIVE");
        return body.get("id").asText();
    }

    private void awaitSnapshot(UUID courseId) throws Exception {
        for (int attempt = 0; attempt < 50; attempt++) {
            Integer count = jdbcTemplate.queryForObject(
                    "select count(*) from course_snapshot where course_id = ?::uuid",
                    Integer.class, courseId.toString());
            if (count != null && count > 0) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("снапшот курса не появился: " + courseId);
    }

    private void awaitProcessed(UUID eventId) throws Exception {
        for (int attempt = 0; attempt < 50; attempt++) {
            Integer count = jdbcTemplate.queryForObject(
                    "select count(*) from processed_events where event_id = ?::uuid",
                    Integer.class, eventId.toString());
            if (count != null && count == 1) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("событие не обработано: " + eventId);
    }

    private void awaitOutboxEvents(String type, String enrollmentId, int expected) throws Exception {
        for (int attempt = 0; attempt < 50; attempt++) {
            Integer count = jdbcTemplate.queryForObject(
                    "select count(*) from outbox where type = ? and payload->>'enrollmentId' = ?",
                    Integer.class, type, enrollmentId);
            if (count != null && count == expected) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("ожидалось " + expected + " событий " + type + " для " + enrollmentId);
    }

    private String json(Object body) throws Exception {
        return objectMapper.writeValueAsString(body);
    }
}
