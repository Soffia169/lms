package com.lms.common.web;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Регистрирует общий обработчик ошибок в сервлетном приложении.
 *
 * <p>Автоконфигурация, а не component-scan: сервисы живут в пакетах
 * {@code com.lms.<service>} и не видят {@code com.lms.common.web}.</p>
 */
@AutoConfiguration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnClass({RestControllerAdvice.class, ProblemDetail.class})
public class CommonWebAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public GlobalExceptionHandler lmsGlobalExceptionHandler() {
        return new GlobalExceptionHandler();
    }
}
