package com.lms.common.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

class EventTopicsTest {

    @Test
    void exchangesUseEventsSuffixAndAreUnique() {
        List<String> exchanges = List.of(
                EventTopics.USER_EVENTS,
                EventTopics.COURSE_EVENTS,
                EventTopics.ENROLLMENT_EVENTS,
                EventTopics.ASSESSMENT_EVENTS);

        assertThat(exchanges)
                .doesNotHaveDuplicates()
                .allSatisfy(exchange -> assertThat(exchange).endsWith(".events"));
    }

    @Test
    void routingKeysMatchEventCatalog() {
        List<String> routingKeys = List.of(
                EventTopics.USER_REGISTERED,
                EventTopics.COURSE_PUBLISHED,
                EventTopics.COURSE_UPDATED,
                EventTopics.ENROLLMENT_CREATED,
                EventTopics.ENROLLMENT_CANCELLED,
                EventTopics.LESSON_COMPLETED,
                EventTopics.ASSESSMENT_SUBMITTED,
                EventTopics.ASSESSMENT_GRADED);

        assertThat(routingKeys)
                .doesNotHaveDuplicates()
                .allSatisfy(key -> assertThat(key).matches("[a-z]+(\\.[a-z]+)+"));
    }

    @Test
    void domainEventExposesIdempotencyKeyAndTimestamp() {
        UUID eventId = UUID.randomUUID();
        Instant occurredAt = Instant.parse("2026-01-01T10:00:00Z");
        DomainEvent event = new TestEvent(eventId, occurredAt);

        assertThat(event.eventId()).isEqualTo(eventId);
        assertThat(event.occurredAt()).isEqualTo(occurredAt);
    }

    @Test
    void resolvesExchangeByTypePrefix() {
        assertThat(EventTopics.exchangeFor(EventTopics.USER_REGISTERED)).isEqualTo(EventTopics.USER_EVENTS);
        assertThat(EventTopics.exchangeFor(EventTopics.COURSE_PUBLISHED)).isEqualTo(EventTopics.COURSE_EVENTS);
        assertThat(EventTopics.exchangeFor(EventTopics.COURSE_UPDATED)).isEqualTo(EventTopics.COURSE_EVENTS);
        assertThat(EventTopics.exchangeFor(EventTopics.ENROLLMENT_CREATED)).isEqualTo(EventTopics.ENROLLMENT_EVENTS);
        assertThat(EventTopics.exchangeFor(EventTopics.ENROLLMENT_CANCELLED)).isEqualTo(EventTopics.ENROLLMENT_EVENTS);
        assertThat(EventTopics.exchangeFor(EventTopics.LESSON_COMPLETED)).isEqualTo(EventTopics.ENROLLMENT_EVENTS);
        assertThat(EventTopics.exchangeFor(EventTopics.ASSESSMENT_GRADED)).isEqualTo(EventTopics.ASSESSMENT_EVENTS);
    }

    @Test
    void rejectsUnknownType() {
        assertThatThrownBy(() -> EventTopics.exchangeFor("unknown.event"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("unknown.event");
    }

    private record TestEvent(UUID eventId, Instant occurredAt) implements DomainEvent {
    }
}
