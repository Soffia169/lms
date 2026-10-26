package com.lms.common.security;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Настройки общей безопасности сервиса.
 */
@ConfigurationProperties(prefix = "lms.security")
public class LmsSecurityProperties {

    /**
     * Дополнительные публичные пути (ant-паттерны) помимо {@code /actuator/health}
     * и OpenAPI. Например, auth-service открывает {@code /api/auth/register}.
     */
    private List<String> additionalPublicPaths = new ArrayList<>();

    public List<String> getAdditionalPublicPaths() {
        return additionalPublicPaths;
    }

    public void setAdditionalPublicPaths(List<String> additionalPublicPaths) {
        this.additionalPublicPaths = additionalPublicPaths;
    }
}
