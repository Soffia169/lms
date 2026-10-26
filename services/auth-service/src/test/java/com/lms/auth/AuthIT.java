package com.lms.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lms.common.events.RabbitQueues;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Сквозные сценарии auth-service на реальной PostgreSQL (Flyway + JPA validate).
 */
@SpringBootTest(classes = AuthServiceApplication.class)
@AutoConfigureMockMvc
@Testcontainers
@TestPropertySource(properties = "lms.auth.jwt.key-dir=target/test-keys")
class AuthIT {

    private static final String ADMIN_EMAIL = "admin@lms.local";
    private static final String ADMIN_PASSWORD = "Admin123!";

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
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Test
    void registerLoginAndReadProfile() throws Exception {
        String email = uniqueEmail("student");

        String userId = register(email, "Password123!", "Ivan Student");
        assertThat(userId).isNotBlank();

        String accessToken = login(email, "Password123!");

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(userId))
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.role").value("STUDENT"));
    }

    @Test
    void duplicateEmailIsRejectedWith409() throws Exception {
        String email = uniqueEmail("duplicate");
        register(email, "Password123!", "First");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "email", email,
                                "password", "Password123!",
                                "fullName", "Second"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.title").value("Conflict"));
    }

    @Test
    void invalidPasswordIsRejectedWith401() throws Exception {
        String email = uniqueEmail("wrong-password");
        register(email, "Password123!", "Ivan Student");

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", "WrongPassword1!"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.title").value("Unauthorized"));
    }

    @Test
    void profileRequiresToken() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void jwksIsPublicAndContainsOnlyPublicKey() throws Exception {
        mockMvc.perform(get("/api/auth/.well-known/jwks.json"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.keys").isArray())
                .andExpect(jsonPath("$.keys[0].kty").value("RSA"))
                .andExpect(jsonPath("$.keys[0].kid").isNotEmpty())
                .andExpect(jsonPath("$.keys[0].d").doesNotExist());
    }

    @Test
    void refreshRotatesRefreshTokenAndRejectsReuse() throws Exception {
        String email = uniqueEmail("refresh");
        register(email, "Password123!", "Refresh User");

        JsonNode firstLogin = loginResponse(email, "Password123!");
        String firstRefreshToken = firstLogin.get("refreshToken").asText();

        JsonNode refreshed = refresh(firstRefreshToken);
        String secondRefreshToken = refreshed.get("refreshToken").asText();

        assertThat(secondRefreshToken).isNotEqualTo(firstRefreshToken);
        assertThat(refreshed.get("accessToken").asText()).isNotBlank();

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", firstRefreshToken))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void logoutRevokesRefreshToken() throws Exception {
        String email = uniqueEmail("logout");
        register(email, "Password123!", "Logout User");

        JsonNode tokens = loginResponse(email, "Password123!");
        String accessToken = tokens.get("accessToken").asText();
        String refreshToken = tokens.get("refreshToken").asText();

        mockMvc.perform(post("/api/auth/logout")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", refreshToken))))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", refreshToken))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void adminCanGrantInstructorRoleAndStudentTokensAreRevoked() throws Exception {
        String email = uniqueEmail("future-instructor");
        String userId = register(email, "Password123!", "Future Instructor");
        String studentToken = login(email, "Password123!");
        JsonNode studentTokens = loginResponse(email, "Password123!");

        mockMvc.perform(patch("/api/auth/users/{userId}/role", userId)
                        .header("Authorization", "Bearer " + login(ADMIN_EMAIL, ADMIN_PASSWORD))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("role", "INSTRUCTOR"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("INSTRUCTOR"));

        // После смены роли старый refresh-токен отозван
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", studentTokens.get("refreshToken").asText()))))
                .andExpect(status().isUnauthorized());

        String instructorToken = login(email, "Password123!");
        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + instructorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("INSTRUCTOR"));

        // Старый access-токен ещё принимается до истечения TTL, но /me читает
        // актуальную роль из БД — поэтому ответ уже INSTRUCTOR.
        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + studentToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.role").value("INSTRUCTOR"));
    }

    @Test
    void studentCannotChangeRoles() throws Exception {
        String email = uniqueEmail("not-admin");
        String userId = register(email, "Password123!", "Not Admin");
        String token = login(email, "Password123!");

        mockMvc.perform(patch("/api/auth/users/{userId}/role", userId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("role", "ADMIN"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void registrationValidatesInput() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", "not-an-email", "password", "short", "fullName", ""))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Validation Failed"))
                .andExpect(jsonPath("$.errors.email").exists())
                .andExpect(jsonPath("$.errors.password").exists())
                .andExpect(jsonPath("$.errors.fullName").exists());
    }

    @Test
    void registrationWritesOutboxEventAndRelayPublishesIt() throws Exception {
        String email = uniqueEmail("outbox");
        String userId = register(email, "Password123!", "Outbox User");

        String eventId = awaitEventIdForUser(userId);
        awaitPublished(eventId);

        assertThat(awaitMessageInQueue(eventId))
                .as("событие user.registered должно оказаться в очереди notification")
                .isTrue();
    }

    private String awaitEventIdForUser(String userId) throws InterruptedException {
        for (int attempt = 0; attempt < 50; attempt++) {
            List<String> eventIds = jdbcTemplate.queryForList(
                    "select event_id::text from outbox where payload->>'userId' = ?", String.class, userId);
            if (!eventIds.isEmpty()) {
                return eventIds.getFirst();
            }
            Thread.sleep(100);
        }
        throw new AssertionError("outbox-запись для пользователя не появилась: " + userId);
    }

    private void awaitPublished(String eventId) throws InterruptedException {
        for (int attempt = 0; attempt < 50; attempt++) {
            Timestamp publishedAt = jdbcTemplate.query(
                    "select published_at from outbox where event_id = ?::uuid",
                    resultSet -> resultSet.next() ? resultSet.getTimestamp(1) : null,
                    eventId);
            if (publishedAt != null) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("событие не опубликовано: " + eventId);
    }

    private boolean awaitMessageInQueue(String eventId) {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            Message message = rabbitTemplate.receive(RabbitQueues.NOTIFICATION_USER_REGISTERED, 500);
            if (message == null) {
                continue;
            }
            String body = new String(message.getBody(), StandardCharsets.UTF_8);
            if (body.contains(eventId)) {
                return true;
            }
        }
        return false;
    }

    private String register(String email, String password, String fullName) throws Exception {
        String response = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", password, "fullName", fullName))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(response).get("id").asText();
    }

    private JsonNode loginResponse(String email, String password) throws Exception {
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", password))))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(response);
    }

    private String login(String email, String password) throws Exception {
        return loginResponse(email, password).get("accessToken").asText();
    }

    private JsonNode refresh(String refreshToken) throws Exception {
        String response = mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", refreshToken))))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(response);
    }

    private String json(Object body) throws Exception {
        return objectMapper.writeValueAsString(body);
    }

    private static String uniqueEmail(String prefix) {
        return prefix + "-" + UUID.randomUUID() + "@lms.local";
    }
}
