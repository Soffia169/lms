package com.lms.enrollment.messaging;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Идемпотентность консьюмера: {@code processed_events} в той же транзакции. */
@Component
public class ProcessedEventGuard {

    private final JdbcTemplate jdbcTemplate;

    public ProcessedEventGuard(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public boolean firstProcessing(UUID eventId, String handler) {
        int inserted = jdbcTemplate.update("""
                insert into processed_events (event_id, handler, processed_at)
                values (?, ?, now())
                on conflict do nothing
                """, eventId, handler);
        return inserted > 0;
    }
}
