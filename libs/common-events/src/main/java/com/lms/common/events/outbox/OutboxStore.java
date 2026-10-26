package com.lms.common.events.outbox;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Хранилище outbox конкретного сервиса.
 *
 * <p>Реализация должна возвращать записи, заблокированные на время транзакции
 * ({@code SELECT ... FOR UPDATE SKIP LOCKED}) — так несколько инстансов сервиса
 * не публикуют одно и то же событие дважды.</p>
 */
public interface OutboxStore {

    List<OutboxMessage> lockPending(int limit);

    void markPublished(UUID eventId, Instant publishedAt);

    void markFailed(UUID eventId, String error);
}
