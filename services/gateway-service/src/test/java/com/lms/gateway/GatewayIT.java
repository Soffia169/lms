package com.lms.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

import reactor.core.publisher.Mono;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;

/**
 * Проверяет правила доступа gateway и проброс заголовков на заглушку апстрима.
 */
@SpringBootTest(
        classes = GatewayServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(GatewayIT.TestSecurityConfiguration.class)
class GatewayIT {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    /** Origin, разрешённый политикой из application.yml по умолчанию (SPA в compose). */
    private static final String UI_ORIGIN = "http://localhost:8088";

    private static final DisposableServer UPSTREAM = HttpServer.create()
            .host("127.0.0.1")
            .port(0)
            .handle((request, response) -> {
                String userId = header(request, "X-User-Id");
                String roles = header(request, "X-User-Roles");
                return response.status(200)
                        .header("Content-Type", "text/plain")
                        .sendString(Mono.just("userId=" + userId + ";roles=" + roles))
                        .then();
            })
            .bindNow();

    private static final int UPSTREAM_PORT = UPSTREAM.port();

    @LocalServerPort
    private int gatewayPort;

    @DynamicPropertySource
    static void upstreamRoutes(DynamicPropertyRegistry registry) {
        String baseUrl = "http://127.0.0.1:" + UPSTREAM_PORT;
        registry.add("AUTH_SERVICE_URL", () -> baseUrl);
        registry.add("COURSE_SERVICE_URL", () -> baseUrl);
        registry.add("ENROLLMENT_SERVICE_URL", () -> baseUrl);
        registry.add("NOTIFICATION_SERVICE_URL", () -> baseUrl);
    }

    @AfterAll
    static void stopUpstream() {
        UPSTREAM.disposeNow();
    }

    @Test
    void authEndpointsArePublic() {
        client().get().uri("/api/auth/login")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void profileEndpointRequiresTokenEvenOnGateway() {
        client().get().uri("/api/auth/me")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    void protectedEndpointsRequireToken() {
        client().get().uri("/api/courses/1")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    void enrollmentAndNotificationRoutesRequireToken() {
        client().get().uri("/api/enrollments")
                .exchange()
                .expectStatus().isUnauthorized();

        client().get().uri("/api/notifications")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    void enrollmentAndNotificationRoutesForwardWithToken() {
        client().get().uri("/api/enrollments")
                .header("Authorization", "Bearer valid-token")
                .exchange()
                .expectStatus().isOk();

        client().get().uri("/api/notifications")
                .header("Authorization", "Bearer valid-token")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void invalidTokenIsRejected() {
        client().get().uri("/api/courses/1")
                .header("Authorization", "Bearer invalid-token")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    void userHeadersAreForwardedFromToken() {
        client().get().uri("/api/courses/1")
                .header("Authorization", "Bearer valid-token")
                .exchange()
                .expectStatus().isOk()
                .expectBody(String.class)
                .value(body -> assertThat(body)
                        .contains("userId=" + USER_ID)
                        .contains("roles=INSTRUCTOR"));
    }

    @Test
    void spoofedUserHeadersAreIgnored() {
        client().get().uri("/api/courses/1")
                .header("Authorization", "Bearer valid-token")
                .header("X-User-Id", "hacker")
                .header("X-User-Roles", "ADMIN")
                .exchange()
                .expectStatus().isOk()
                .expectBody(String.class)
                .value(body -> assertThat(body)
                        .doesNotContain("hacker")
                        .contains("userId=" + USER_ID)
                        .doesNotContain("roles=ADMIN"));
    }

    @Test
    void corsPreflightFromConfiguredOriginIsAllowedWithoutToken() {
        client().options().uri("/api/courses")
                .header(HttpHeaders.ORIGIN, UI_ORIGIN)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization,content-type")
                .exchange()
                .expectStatus().isOk()
                .expectHeader().valueEquals(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, UI_ORIGIN)
                .expectHeader().value(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS,
                        methods -> assertThat(methods).contains("POST"));
    }

    @Test
    void corsPreflightFromUnknownOriginIsRejected() {
        client().options().uri("/api/courses")
                .header(HttpHeaders.ORIGIN, "http://evil.example")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                .exchange()
                .expectStatus().isForbidden()
                .expectHeader().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN);
    }

    @Test
    void corsActualRequestFromConfiguredOriginGetsAllowOriginHeader() {
        client().get().uri("/api/auth/login")
                .header(HttpHeaders.ORIGIN, UI_ORIGIN)
                .exchange()
                .expectStatus().isOk()
                .expectHeader().valueEquals(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, UI_ORIGIN);
    }

    private WebTestClient client() {
        return WebTestClient.bindToServer()
                .baseUrl("http://localhost:" + gatewayPort)
                .build();
    }

    private static String header(reactor.netty.http.server.HttpServerRequest request, String name) {
        String value = request.requestHeaders().get(name);
        return value == null ? "" : value;
    }

    @TestConfiguration
    static class TestSecurityConfiguration {

        @Bean
        ReactiveJwtDecoder reactiveJwtDecoder() {
            return token -> {
                if (!"valid-token".equals(token)) {
                    return Mono.error(new InvalidBearerTokenException("invalid token"));
                }
                Jwt jwt = Jwt.withTokenValue(token)
                        .header("alg", "none")
                        .subject(USER_ID.toString())
                        .claim("roles", List.of("INSTRUCTOR"))
                        .build();
                return Mono.just(jwt);
            };
        }
    }
}
