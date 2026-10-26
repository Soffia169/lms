# services — микросервисы приложения

Реализованы на этапах 1–2:

| Модуль | Ответственность | Порт (host) | БД | Этап |
| :--- | :--- | :-- | :--- | :-- |
| `gateway-service` | маршрутизация, проверка JWT, `X-User-*`, CORS | 8080 | — | 1 |
| `auth-service` | регистрация, логин, JWT RS256, refresh, роли, outbox `user.registered` | 8081 | `auth_db` | 1–2 |
| `course-service` | курсы, модули, уроки, публикация, счётчик `enrolledCount`, outbox `course.*` | 8082 | `course_db` | 1–2 |
| `enrollment-service` | запись на курс, отмена, прогресс уроков, снапшот курса | 8083 | `enrollment_db` | 2 |
| `notification-service` | in-app уведомления по событиям (+ `log.info`) | 8084 | `notification_db` | 2 |
| `assessment-service` | тесты, задания, ответы, оценки | — | `assessment_db` | 3 |
| `media-service` | файлы и видео, presigned URL | — | `media_db` + MinIO | 4 |

Внутри каждого модуля — MVS: `model/` · `service/` · `view/`
(см. [Architecture_Vision.md](../Architecture_Vision.md) §5).

Общая событийная инфраструктура (конверт, DTO, топология, relay) — `libs/common-events`;
outbox-таблицы и `processed_events` живут в БД каждого сервиса
(см. [STAGE-2-PLAN.md](../docs/STAGE-2-PLAN.md)).

Сборка одного сервиса: `mvn -pl services/<service> -am package`.
Образ: `docker build -f infra/Dockerfile --build-arg SERVICE=<service> .`.
