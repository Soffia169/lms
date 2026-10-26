package com.lms.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;

import reactor.core.publisher.Mono;

/**
 * Дымовой тест контекста gateway: проверяет, что реактивная конфигурация
 * безопасности и маршруты поднимаются без реального auth-service.
 */
@SpringBootTest(classes = GatewayServiceApplication.class)
@Import(GatewaySmokeTest.StubDecoderConfiguration.class)
class GatewaySmokeTest {

    @Test
    void contextLoads() {
        assertThat(StubDecoderConfiguration.STUBBED).isTrue();
    }

    @TestConfiguration
    static class StubDecoderConfiguration {

        static final boolean STUBBED = true;

        @Bean
        ReactiveJwtDecoder reactiveJwtDecoder() {
            return token -> Mono.just(Jwt.withTokenValue(token)
                    .header("alg", "none")
                    .subject(UUID.randomUUID().toString())
                    .claim("roles", List.of("STUDENT"))
                    .build());
        }
    }
}
