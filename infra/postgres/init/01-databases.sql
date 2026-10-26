-- Локальная PostgreSQL: одна база на сервис (database per service).
-- Скрипт выполняется один раз, при инициализации пустого тома postgres-data.
-- Пересоздать базы: docker compose down -v && docker compose up -d
--
-- Владелец всех баз — POSTGRES_USER (по умолчанию lms, суперпользователь контейнера).
-- Межбазовых FK и общих таблиц быть не должно: связи только через события и снапшоты.

CREATE DATABASE auth_db;
CREATE DATABASE course_db;
CREATE DATABASE enrollment_db;
CREATE DATABASE assessment_db;
CREATE DATABASE media_db;
CREATE DATABASE notification_db;
