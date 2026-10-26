package com.lms.common.events;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.lms.common.events.EventPayloads.UserRegisteredEvent;

import org.junit.jupiter.api.Test;

class EventEnvelopeJsonTest {

    private final ObjectMapper mapper = JsonMapper.builder().addModule(new JavaTimeModule()).build();

    @Test
    void serializesAndDeserializesEnvelopeWithPayload() throws Exception {
        UUID eventId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Instant occurredAt = Instant.parse("2026-01-01T10:15:30Z");
        UserRegisteredEvent payload = new UserRegisteredEvent(
                userId, "student@lms.local", "Ivan", "STUDENT", occurredAt);

        EventEnvelope envelope = new EventEnvelope(
                eventId, EventTopics.USER_REGISTERED, EventEnvelope.CURRENT_VERSION,
                occurredAt, mapper.valueToTree(payload));

        String json = mapper.writeValueAsString(envelope);
        EventEnvelope parsed = mapper.readValue(json, EventEnvelope.class);

        assertThat(parsed.eventId()).isEqualTo(eventId);
        assertThat(parsed.type()).isEqualTo(EventTopics.USER_REGISTERED);
        assertThat(parsed.version()).isEqualTo(EventEnvelope.CURRENT_VERSION);
        assertThat(parsed.occurredAt()).isEqualTo(occurredAt);
        assertThat(parsed.payload().get("userId").asText()).isEqualTo(userId.toString());
        assertThat(parsed.payload().get("role").asText()).isEqualTo("STUDENT");
    }

    @Test
    void payloadCanBeConvertedBackToDto() throws Exception {
        UserRegisteredEvent payload = new UserRegisteredEvent(
                UUID.randomUUID(), "a@b.c", "Ivan", "STUDENT", Instant.now());
        EventEnvelope envelope = new EventEnvelope(
                UUID.randomUUID(), EventTopics.USER_REGISTERED, 1, Instant.now(), mapper.valueToTree(payload));

        UserRegisteredEvent restored = mapper.treeToValue(envelope.payload(), UserRegisteredEvent.class);

        assertThat(restored).isEqualTo(payload);
    }
}
