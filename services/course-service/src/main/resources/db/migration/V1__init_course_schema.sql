-- course_db: курсы, модули, уроки.
-- instructor_id ссылается на пользователя из auth_db — межбазовых FK нет,
-- целостность обеспечивается на уровне приложения.

CREATE TABLE courses (
    id           UUID         NOT NULL PRIMARY KEY,
    title        VARCHAR(200) NOT NULL,
    description  VARCHAR(5000),
    instructor_id UUID        NOT NULL,
    is_published BOOLEAN      NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL,
    updated_at   TIMESTAMPTZ  NOT NULL
);

CREATE INDEX ix_courses_instructor ON courses (instructor_id);

CREATE TABLE modules (
    id         UUID         NOT NULL PRIMARY KEY,
    course_id  UUID         NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    title      VARCHAR(200) NOT NULL,
    position   INTEGER      NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL
);

CREATE INDEX ix_modules_course ON modules (course_id);

CREATE TABLE lessons (
    id         UUID          NOT NULL PRIMARY KEY,
    module_id  UUID          NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
    title      VARCHAR(200)  NOT NULL,
    content    VARCHAR(20000),
    position   INTEGER       NOT NULL,
    created_at TIMESTAMPTZ   NOT NULL,
    updated_at TIMESTAMPTZ   NOT NULL
);

CREATE INDEX ix_lessons_module ON lessons (module_id);
