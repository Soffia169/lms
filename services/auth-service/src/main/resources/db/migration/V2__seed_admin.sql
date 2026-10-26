-- Демо-администратор для локальной среды и тестов.
-- Пароль: Admin123! (bcrypt, strength 10). В проде так делать нельзя:
-- админ должен создаваться через секреты/админский пайплайн.
-- Повышение ролей остальных пользователей — PATCH /api/auth/users/{id}/role (ADMIN).

INSERT INTO users (id, email, password_hash, full_name, role, enabled, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@lms.local',
    '$2a$10$CQG0UPDpXphEApmYsGJ7rO1pc.zDzb5Vg4lg9FBs9njX9ouvGLDFK',
    'LMS Administrator',
    'ADMIN',
    TRUE,
    now(),
    now()
)
ON CONFLICT DO NOTHING;
