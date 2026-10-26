package com.lms.common.security;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Автоконфигурация по умолчанию для сервлетных сервисов LMS: stateless OAuth2
 * Resource Server, JWT обязателен для всего, кроме служебных endpoint-ов.
 *
 * <p>Второй эшелон защиты (defense in depth): gateway валидирует JWT, но каждый
 * сервис валидирует его повторно и самостоятельно решает, что разрешено.
 * Конфигурация включается автоматически; сервис может переопределить
 * {@link SecurityFilterChain} своим бином.</p>
 */
// Порядок критичен: цепочку нужно объявить раньше Boot-овских
// (OAuth2ResourceServerJwtConfiguration.jwtSecurityFilterChain и
// SpringBootWebSecurityConfiguration.defaultSecurityFilterChain), иначе они
// объявят свою цепочку с CSRF/сессиями, а наша отключится по @ConditionalOnMissingBean.
// beforeName, а не before: обе Boot-овские конфигурации package-private.
@AutoConfiguration(beforeName = {
        "org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerJwtConfiguration",
        "org.springframework.boot.autoconfigure.security.servlet.SpringBootWebSecurityConfiguration"
})
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnClass({SecurityFilterChain.class, Jwt.class, HttpSecurity.class})
@EnableConfigurationProperties(LmsSecurityProperties.class)
@EnableMethodSecurity
public class CommonSecurityAutoConfiguration {

    /** Пути, доступные без аутентификации: health-check и OpenAPI. */
    static final String[] PUBLIC_PATHS = {
            "/actuator/health",
            "/actuator/health/**",
            "/actuator/info",
            "/v3/api-docs",
            "/v3/api-docs/**",
            "/swagger-ui.html",
            "/swagger-ui/**"
    };

    @Bean
    @ConditionalOnMissingBean(JwtAuthenticationConverter.class)
    public JwtAuthenticationConverter lmsJwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(new RolesClaimJwtGrantedAuthoritiesConverter());
        return converter;
    }

    @Bean
    @ConditionalOnMissingBean(SecurityFilterChain.class)
    public SecurityFilterChain lmsSecurityFilterChain(
            HttpSecurity http,
            JwtAuthenticationConverter jwtAuthenticationConverter,
            LmsSecurityProperties securityProperties) throws Exception {

        String[] publicPaths = merge(PUBLIC_PATHS, securityProperties.getAdditionalPublicPaths());

        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(publicPaths).permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter)));

        return http.build();
    }

    private static String[] merge(String[] defaults, List<String> additional) {
        List<String> merged = new ArrayList<>(additional.size() + defaults.length);
        merged.addAll(additional);
        merged.addAll(List.of(defaults));
        return merged.toArray(String[]::new);
    }
}
