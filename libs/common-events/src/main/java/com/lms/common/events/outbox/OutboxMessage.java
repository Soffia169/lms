package com.lms.common.events.outbox;

import java.time.Instant;
import java.util.UUID;

/** Запись outbox, готовая к публикации. */
public record OutboxMessage(UUID eventId, String type, String payload, Instant occurredAt) {
}
