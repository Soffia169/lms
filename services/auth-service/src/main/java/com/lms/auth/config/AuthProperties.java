package com.lms.auth.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Настройки выпуска токенов.
 */
@ConfigurationProperties(prefix = "lms.auth.jwt")
public class AuthProperties {

    /** Каталог с PEM-ключами RS256; создаётся при первом старте. */
    private String keyDir = "keys";

    /** Значение claim {@code iss} (логическое имя, не зависит от host/port). */
    private String issuer = "lms-auth";

    /** TTL access-токена. */
    private Duration accessTokenTtl = Duration.ofMinutes(15);

    /** TTL refresh-токена. */
    private Duration refreshTokenTtl = Duration.ofDays(7);

    public String getKeyDir() {
        return keyDir;
    }

    public void setKeyDir(String keyDir) {
        this.keyDir = keyDir;
    }

    public String getIssuer() {
        return issuer;
    }

    public void setIssuer(String issuer) {
        this.issuer = issuer;
    }

    public Duration getAccessTokenTtl() {
        return accessTokenTtl;
    }

    public void setAccessTokenTtl(Duration accessTokenTtl) {
        this.accessTokenTtl = accessTokenTtl;
    }

    public Duration getRefreshTokenTtl() {
        return refreshTokenTtl;
    }

    public void setRefreshTokenTtl(Duration refreshTokenTtl) {
        this.refreshTokenTtl = refreshTokenTtl;
    }
}
