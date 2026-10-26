package com.lms.common.events;

import java.time.Instant;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Конверт события: стабильные метаданные + полезная нагрузка.
 *
 * <p>Конверт позволяет relay публиковать любые события единообразно, а
 * консьюмерам — сначала проверить идемпотентность по {@code eventId}, затем
 * разобрать {@code payload} в конкретный DTO. {@code type} совпадает с
 * routing key (см. {@link EventTopics}).</p>
 */
public record EventEnvelope(UUID eventId, String type, int version, Instant occurredAt, JsonNode payload) {

    /** Текущая версия контракта событий. */
    public static final int CURRENT_VERSION = 1;

    public EventEnvelope {
        if (eventId == null) {
            throw new IllegalArgumentException("eventId must not be null");
        }
        if (type == null || type.isBlank()) {
            throw new IllegalArgumentException("type must not be blank");
        }
        if (occurredAt == null) {
            throw new IllegalArgumentException("occurredAt must not be null");
        }
    }
}
