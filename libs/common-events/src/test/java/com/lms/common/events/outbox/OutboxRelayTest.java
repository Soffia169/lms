package com.lms.common.events.outbox;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.lms.common.events.EventEnvelope;

import org.junit.jupiter.api.Test;

class OutboxRelayTest {

    private final ObjectMapper mapper = JsonMapper.builder().addModule(new JavaTimeModule()).build();

    @Test
    void publishesPendingEventsAndMarksThemPublished() {
        OutboxMessage message = message("user.registered");
        FakeStore store = new FakeStore(List.of(message));
        List<EventEnvelope> sent = new ArrayList<>();
        OutboxRelay relay = new OutboxRelay(store, sent::add, mapper);

        int published = relay.publishPending(10);

        assertThat(published).isEqualTo(1);
        assertThat(sent).singleElement().satisfies(envelope -> {
            assertThat(envelope.eventId()).isEqualTo(message.eventId());
            assertThat(envelope.type()).isEqualTo("user.registered");
            assertThat(envelope.payload().get("userId").asText()).isNotBlank();
        });
        assertThat(store.markedPublished).containsExactly(message.eventId());
        assertThat(store.markedFailed).isEmpty();
    }

    @Test
    void stopsBatchOnPublishFailureAndKeepsEventsUnpublished() {
        OutboxMessage first = message("user.registered");
        OutboxMessage second = message("enrollment.created");
        FakeStore store = new FakeStore(List.of(first, second));
        OutboxRelay relay = new OutboxRelay(store, envelope -> {
            throw new IllegalStateException("broker is down");
        }, mapper);

        int published = relay.publishPending(10);

        assertThat(published).isZero();
        assertThat(store.markedPublished).isEmpty();
    }

    private OutboxMessage message(String type) {
        return new OutboxMessage(
                UUID.randomUUID(),
                type,
                "{\"userId\":\"" + UUID.randomUUID() + "\"}",
                Instant.parse("2026-01-01T10:00:00Z"));
    }

    private static final class FakeStore implements OutboxStore {

        private final List<OutboxMessage> pending;
        private final List<UUID> markedPublished = new ArrayList<>();
        private final List<UUID> markedFailed = new ArrayList<>();

        private FakeStore(List<OutboxMessage> pending) {
            this.pending = pending;
        }

        @Override
        public List<OutboxMessage> lockPending(int limit) {
            return pending.stream().limit(limit).toList();
        }

        @Override
        public void markPublished(UUID eventId, Instant publishedAt) {
            markedPublished.add(eventId);
        }

        @Override
        public void markFailed(UUID eventId, String error) {
            markedFailed.add(eventId);
        }
    }
}
