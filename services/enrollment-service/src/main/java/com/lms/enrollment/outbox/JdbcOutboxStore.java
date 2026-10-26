package com.lms.enrollment.outbox;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.lms.common.events.outbox.OutboxMessage;
import com.lms.common.events.outbox.OutboxStore;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class JdbcOutboxStore implements OutboxStore {

    private static final String SELECT_PENDING = """
            select event_id, type, payload::text, occurred_at
            from outbox
            where published_at is null
            order by occurred_at
            limit ?
            for update skip locked
            """;

    private final JdbcTemplate jdbcTemplate;

    public JdbcOutboxStore(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public List<OutboxMessage> lockPending(int limit) {
        return jdbcTemplate.query(SELECT_PENDING,
                (resultSet, rowNum) -> new OutboxMessage(
                        UUID.fromString(resultSet.getString(1)),
                        resultSet.getString(2),
                        resultSet.getString(3),
                        resultSet.getTimestamp(4).toInstant()),
                limit);
    }

    @Override
    public void markPublished(UUID eventId, Instant publishedAt) {
        jdbcTemplate.update("update outbox set published_at = ?, attempts = attempts + 1 where event_id = ?",
                Timestamp.from(publishedAt), eventId);
    }

    @Override
    public void markFailed(UUID eventId, String error) {
        jdbcTemplate.update("update outbox set attempts = attempts + 1, last_error = ? where event_id = ?",
                error, eventId);
    }
}
