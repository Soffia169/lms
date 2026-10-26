package com.lms.notification.messaging;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Идемпотентность: вставка в {@code processed_events} в одной транзакции с уведомлением. */
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
