package com.lms.common.events;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;

/**
 * JSON-сериализация сообщений (общая для producer и consumer).
 *
 * <p>Используется Boot-овский {@code ObjectMapper}, поэтому {@link EventEnvelope}
 * с {@code Instant} и {@code JsonNode} сериализуется без дополнительных модулей.</p>
 */
@AutoConfiguration
@ConditionalOnClass({RabbitTemplate.class, Jackson2JsonMessageConverter.class})
public class RabbitMessagingConfiguration {

    @Bean
    @ConditionalOnMissingBean(MessageConverter.class)
    public MessageConverter lmsJsonMessageConverter(ObjectMapper objectMapper) {
        return new Jackson2JsonMessageConverter(objectMapper);
    }
}
