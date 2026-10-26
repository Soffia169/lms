-- enrollment_db: снапшот курса, записи, прогресс, идемпотентность, outbox.

CREATE TABLE course_snapshot (
    course_id     UUID         NOT NULL PRIMARY KEY,
    instructor_id UUID         NOT NULL,
    title         VARCHAR(200) NOT NULL,
    description   VARCHAR(5000),
    published     BOOLEAN      NOT NULL,
    published_at  TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ  NOT NULL
);

CREATE TABLE course_snapshot_lesson (
    course_id UUID NOT NULL REFERENCES course_snapshot (course_id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL,
    PRIMARY KEY (course_id, lesson_id)
);

CREATE TABLE enrollments (
    id           UUID        NOT NULL PRIMARY KEY,
    student_id   UUID        NOT NULL,
    course_id    UUID        NOT NULL,
    status       VARCHAR(20) NOT NULL,
    enrolled_at  TIMESTAMPTZ NOT NULL,
    cancelled_at TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ NOT NULL,
    CONSTRAINT enrollments_status_check CHECK (status IN ('ACTIVE', 'CANCELLED', 'COMPLETED'))
);

-- Одна активная запись на пару (студент, курс); после отмены можно записаться снова.
CREATE UNIQUE INDEX ux_enrollments_active ON enrollments (student_id, course_id)
    WHERE status = 'ACTIVE';

CREATE INDEX ix_enrollments_student ON enrollments (student_id, enrolled_at DESC);

CREATE TABLE lesson_progress (
    id            UUID        NOT NULL PRIMARY KEY,
    enrollment_id UUID        NOT NULL REFERENCES enrollments (id) ON DELETE CASCADE,
    lesson_id     UUID        NOT NULL,
    completed_at  TIMESTAMPTZ NOT NULL,
    score         NUMERIC(5, 2)
);

CREATE UNIQUE INDEX ux_lesson_progress ON lesson_progress (enrollment_id, lesson_id);

CREATE TABLE processed_events (
    event_id     UUID         PRIMARY KEY,
    handler      VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ  NOT NULL
);

CREATE TABLE outbox (
    id           BIGSERIAL    PRIMARY KEY,
    event_id     UUID         NOT NULL,
    type         VARCHAR(100) NOT NULL,
    payload      JSONB        NOT NULL,
    occurred_at  TIMESTAMPTZ  NOT NULL,
    published_at TIMESTAMPTZ,
    attempts     INTEGER      NOT NULL DEFAULT 0,
    last_error   TEXT,
    CONSTRAINT ux_enrollment_outbox_event UNIQUE (event_id)
);

CREATE INDEX ix_enrollment_outbox_pending ON outbox (occurred_at) WHERE published_at IS NULL;
