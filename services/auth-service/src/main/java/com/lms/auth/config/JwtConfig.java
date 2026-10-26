package com.lms.auth.config;

import java.time.Clock;

import com.nimbusds.jose.jwk.JWKSet;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import com.nimbusds.jose.jwk.source.ImmutableJWKSet;

/**
 * Криптография и выпуск/проверка токенов внутри auth-service.
 *
 * <p>Сервис проверяет свои же токены по публичному ключу из памяти — без
 * сетевого запроса к самому себе.</p>
 */
@Configuration
@EnableConfigurationProperties(AuthProperties.class)
public class JwtConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public JwtEncoder jwtEncoder(RsaKeyProvider keyProvider) {
        return new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(keyProvider.rsaKey())));
    }

    @Bean
    public JwtDecoder jwtDecoder(RsaKeyProvider keyProvider) {
        return NimbusJwtDecoder.withPublicKey(keyProvider.publicKey()).build();
    }

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
