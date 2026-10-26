package com.lms.course.messaging;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Идемпотентность консьюмера: вставка в {@code processed_events} выполняется
 * в одной транзакции с бизнес-изменением. Повторная доставка события
 * (at-least-once) не приводит к повторной обработке.
 */
@Component
public class ProcessedEventGuard {

    private final JdbcTemplate jdbcTemplate;

    public ProcessedEventGuard(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * @return {@code true}, если событие обрабатывается впервые
     */
    public boolean firstProcessing(UUID eventId, String handler) {
        int inserted = jdbcTemplate.update("""
                insert into processed_events (event_id, handler, processed_at)
                values (?, ?, now())
                on conflict do nothing
                """, eventId, handler);
        return inserted > 0;
    }
}
