package com.lms.common.events.outbox;

import java.util.Date;

import com.lms.common.events.EventEnvelope;
import com.lms.common.events.EventTopics;

import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

/**
 * Публикует конверт в topic-exchange, соответствующий типу события.
 *
 * <p>Сообщение помечается {@code messageId = eventId} и {@code type}: это удобно
 * для трассировки и ручного разбора DLQ.</p>
 */
public class RabbitEventSender implements EventSender {

    private final RabbitTemplate rabbitTemplate;

    public RabbitEventSender(RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    @Override
    public void send(EventEnvelope envelope) {
        String exchange = EventTopics.exchangeFor(envelope.type());
        rabbitTemplate.convertAndSend(exchange, envelope.type(), envelope, message -> {
            MessageProperties properties = message.getMessageProperties();
            properties.setMessageId(envelope.eventId().toString());
            properties.setType(envelope.type());
            properties.setTimestamp(Date.from(envelope.occurredAt()));
            properties.setContentType(MessageProperties.CONTENT_TYPE_JSON);
            return message;
        });
    }
}
