package com.lms.notification.model;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "notifications")
public class Notification {

    @Id
    private UUID id;

    @Column(name = "recipient_id", nullable = false)
    private UUID recipientId;

    @Column(nullable = false, length = 100)
    private String type;

    @Column(nullable = false, length = 200)
    private String subject;

    @Column(length = 2000)
    private String body;

    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "read_at")
    private Instant readAt;

    protected Notification() {
        // для JPA
    }

    public Notification(UUID id, UUID recipientId, String type, String subject, String body,
                        UUID eventId, Instant createdAt) {
        this.id = id;
        this.recipientId = recipientId;
        this.type = type;
        this.subject = subject;
        this.body = body;
        this.eventId = eventId;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getRecipientId() {
        return recipientId;
    }

    public String getType() {
        return type;
    }

    public String getSubject() {
        return subject;
    }

    public String getBody() {
        return body;
    }

    public UUID getEventId() {
        return eventId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getReadAt() {
        return readAt;
    }

    public void markRead(Instant now) {
        if (readAt == null) {
            readAt = now;
        }
    }
}
