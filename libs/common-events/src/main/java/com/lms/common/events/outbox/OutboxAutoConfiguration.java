package com.lms.common.events.outbox;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

/**
 * Общая инфраструктура outbox. Активируется только там, где сервис объявил
 * собственный {@link OutboxStore} (producer'ы: auth, course, enrollment).
 */
@AutoConfiguration
@ConditionalOnClass(RabbitTemplate.class)
@EnableConfigurationProperties(OutboxProperties.class)
@ConditionalOnProperty(prefix = "lms.events.outbox", name = "enabled", havingValue = "true",
        matchIfMissing = true)
public class OutboxAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(EventSender.class)
    public EventSender lmsEventSender(RabbitTemplate rabbitTemplate) {
        return new RabbitEventSender(rabbitTemplate);
    }

    @Bean
    @ConditionalOnMissingBean(OutboxRelay.class)
    @ConditionalOnBean(OutboxStore.class)
    public OutboxRelay lmsOutboxRelay(OutboxStore store, EventSender sender, ObjectMapper objectMapper) {
        return new OutboxRelay(store, sender, objectMapper);
    }
}
