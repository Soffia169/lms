package com.lms.enrollment.outbox;

import com.lms.common.events.outbox.OutboxProperties;
import com.lms.common.events.outbox.OutboxRelay;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

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
