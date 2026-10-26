-- Outbox (course.published/course.updated), идемпотентность консьюмера
-- и счётчик записавшихся (инкремент/декремент из enrollment.events).

CREATE TABLE outbox (
    id           BIGSERIAL    PRIMARY KEY,
    event_id     UUID         NOT NULL,
    type         VARCHAR(100) NOT NULL,
    payload      JSONB        NOT NULL,
    occurred_at  TIMESTAMPTZ  NOT NULL,
    published_at TIMESTAMPTZ,
    attempts     INTEGER      NOT NULL DEFAULT 0,
    last_error   TEXT,
    CONSTRAINT ux_course_outbox_event UNIQUE (event_id)
);

CREATE INDEX ix_course_outbox_pending ON outbox (occurred_at) WHERE published_at IS NULL;

CREATE TABLE processed_events (
    event_id     UUID        PRIMARY KEY,
    handler      VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE courses
    ADD COLUMN enrolled_count INTEGER NOT NULL DEFAULT 0;
