-- outbox для публикации user.registered в той же транзакции, что и регистрация.

CREATE TABLE outbox (
    id          BIGSERIAL   PRIMARY KEY,
    event_id    UUID        NOT NULL,
    type        VARCHAR(100) NOT NULL,
    payload     JSONB       NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ,
    attempts    INTEGER     NOT NULL DEFAULT 0,
    last_error  TEXT,
    CONSTRAINT ux_outbox_event UNIQUE (event_id)
);

-- Relay выбирает только неопубликованные записи в порядке возникновения.
CREATE INDEX ix_outbox_pending ON outbox (occurred_at) WHERE published_at IS NULL;
