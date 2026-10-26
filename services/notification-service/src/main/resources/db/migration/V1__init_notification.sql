-- notification_db: in-app уведомления и идемпотентность консьюмеров.

CREATE TABLE notifications (
    id           UUID          NOT NULL PRIMARY KEY,
    recipient_id UUID          NOT NULL,
    type         VARCHAR(100)  NOT NULL,
    subject      VARCHAR(200)  NOT NULL,
    body         VARCHAR(2000),
    event_id     UUID          NOT NULL,
    created_at   TIMESTAMPTZ   NOT NULL,
    read_at      TIMESTAMPTZ
);

CREATE INDEX ix_notifications_recipient ON notifications (recipient_id, created_at DESC);

CREATE TABLE processed_events (
    event_id     UUID         PRIMARY KEY,
    handler      VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ  NOT NULL
);
