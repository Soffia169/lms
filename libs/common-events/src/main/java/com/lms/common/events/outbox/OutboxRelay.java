package com.lms.common.events.outbox;

import java.time.Instant;
import java.util.List;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lms.common.events.EventEnvelope;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Публикует неопубликованные записи outbox.
 *
 * <p>Работает в транзакции вызывающего кода: при ошибке публикации транзакция
 * откатывается, и записи остаются в outbox до следующего запуска. Батч
 * останавливается на первом сбое, чтобы не публиковать события вне порядка.</p>
 *
 * <p>Гарантия — at-least-once: успешная публикация и последующий откат транзакции
 * приведут к повторной публикации. Консьюмеры обязаны дедуплицировать по
 * {@code eventId}.</p>
 */
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);

    private final OutboxStore store;
    private final EventSender sender;
    private final ObjectMapper objectMapper;

    public OutboxRelay(OutboxStore store, EventSender sender, ObjectMapper objectMapper) {
        this.store = store;
        this.sender = sender;
        this.objectMapper = objectMapper;
    }

    /**
     * @return количество опубликованных событий
     */
    public int publishPending(int batchSize) {
        List<OutboxMessage> messages = store.lockPending(batchSize);
        int published = 0;

        for (OutboxMessage message : messages) {
            try {
                EventEnvelope envelope = new EventEnvelope(
                        message.eventId(),
                        message.type(),
                        EventEnvelope.CURRENT_VERSION,
                        message.occurredAt(),
                        objectMapper.readTree(message.payload()));
                sender.send(envelope);
                store.markPublished(message.eventId(), Instant.now());
                published++;
            } catch (Exception exception) {
                log.warn("Не удалось опубликовать outbox-событие {} ({}), повтор при следующем запуске: {}",
                        message.eventId(), message.type(), exception.toString());
                break;
            }
        }

        if (!messages.isEmpty()) {
            log.debug("Outbox relay: опубликовано {} из {}", published, messages.size());
        }
        return published;
    }
}
