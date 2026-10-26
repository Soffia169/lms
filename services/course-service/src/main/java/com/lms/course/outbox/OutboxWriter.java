package com.lms.course.outbox;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Запись события в outbox в текущей бизнес-транзакции. */
@Component
public class OutboxWriter {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public OutboxWriter(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public void append(UUID eventId, String type, Object payload, Instant occurredAt) {
        String json;
        try {
            json = objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Не удалось сериализовать событие " + type, exception);
        }

        jdbcTemplate.update("""
                insert into outbox (event_id, type, payload, occurred_at)
                values (?, ?, ?::jsonb, ?)
                """, eventId, type, json, Timestamp.from(occurredAt));
    }
}
