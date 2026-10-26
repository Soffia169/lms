package com.lms.auth.outbox;

import com.lms.common.events.outbox.OutboxProperties;
import com.lms.common.events.outbox.OutboxRelay;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Периодически публикует неопубликованные события.
 *
 * <p>Транзакция охватывает выборку с блокировкой и отметку о публикации; при
 * ошибке публикации изменения откатываются и запись остаётся в outbox.</p>
 */
@Component
public class OutboxRelayScheduler {

    private final OutboxRelay outboxRelay;
    private final OutboxProperties properties;

    public OutboxRelayScheduler(OutboxRelay outboxRelay, OutboxProperties properties) {
        this.outboxRelay = outboxRelay;
        this.properties = properties;
    }

    @Scheduled(fixedDelayString = "${lms.events.outbox.delay-ms:1000}")
    @Transactional
    public void publishPending() {
        outboxRelay.publishPending(properties.getBatchSize());
    }
}
