package com.lms.common.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Базовый контракт события домена.
 *
 * <p>{@link #eventId()} — ключ идемпотентности консьюмера: по нему consumer
 * дедуплицирует повторные доставки (таблица {@code processed_events}). Поэтому
 * идентификатор обязан генерироваться один раз — в момент записи события в
 * outbox, а не при каждой публикации в брокер.</p>
 */
public interface DomainEvent {

    /** Уникальный идентификатор события; основа идемпотентности при доставке. */
    UUID eventId();

    /** Момент возникновения события (UTC). */
    Instant occurredAt();
}
