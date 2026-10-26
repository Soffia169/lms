package com.lms.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class LmsSecurityPropertiesTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(PropertiesTestConfiguration.class);

    @Test
    void bindsAdditionalPublicPathsInOrder() {
        contextRunner
                .withPropertyValues(
                        "lms.security.additional-public-paths[0]=/api/auth/register",
                        "lms.security.additional-public-paths[1]=/api/auth/.well-known/**")
                .run(context -> assertThat(context.getBean(LmsSecurityProperties.class).getAdditionalPublicPaths())
                        .containsExactly("/api/auth/register", "/api/auth/.well-known/**"));
    }

    @Test
    void additionalPublicPathsAreEmptyByDefault() {
        contextRunner.run(context -> assertThat(context.getBean(LmsSecurityProperties.class)
                .getAdditionalPublicPaths()).isEmpty());
    }

    @EnableConfigurationProperties(LmsSecurityProperties.class)
    static class PropertiesTestConfiguration {
    }
}
