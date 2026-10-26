package com.lms.gateway.config;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsConfigurationSource;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

/**
 * CORS для браузерного клиента.
 *
 * <p>Основной способ доставки web-интерфейса — nginx, который проксирует
 * {@code /api} на gateway, поэтому браузер работает с одним origin и CORS
 * не участвует. Политика нужна для разработки: когда {@code web/} открыт
 * отдельным статическим сервером (см. {@code docs/UI.md}), либо когда SPA
 * развёрнута на собственном домене.</p>
 *
 * <p>Список разрешённых origin задаётся явно (не {@code *}): токены хранятся
 * на клиенте, и доверять произвольному origin нельзя. Переопределяется
 * переменной окружения {@code LMS_CORS_ALLOWED_ORIGINS}.</p>
 *
 * <p>Важно: используется реактивный {@code UrlBasedCorsConfigurationSource}
 * (WebFlux). Servlet-вариант с тем же именем требует {@code jakarta.servlet}
 * и падает при старте контекста.</p>
 */
@Configuration
public class CorsConfig {

    @Bean
    public CorsConfigurationSource corsConfigurationSource(
            @Value("${lms.cors.allowed-origins}") List<String> allowedOrigins) {

        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins.stream()
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of(
                "Authorization", "Content-Type", "Accept", "Accept-Language", "X-Requested-With"));
        configuration.setExposedHeaders(List.of("Content-Type"));
        configuration.setMaxAge(3600L);
        // Токены передаются в заголовке Authorization, cookie-сессии не используются.
        configuration.setAllowCredentials(false);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }
}
