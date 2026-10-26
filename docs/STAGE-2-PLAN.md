# План реализации этапа 2 — Обучение и события

> **Живой документ.** Составлен после этапа 1 (включая web-интерфейс).
> Отметки: `[x]` — готово, `[ ]` — не начато, `[~]` — в работе (пишется текстом
> рядом), `[!]` — блокер.
> Обновлять после каждого закрытого пункта: ставить `[x]`, дату и короткий
> комментарий в «Журнал выполнения» (раздел 12).

## 1. Статус

| Компонент | Статус |
| :--- | :--- |
| Этап 0 — фундамент | ✅ готово |
| Этап 1 — auth / course / gateway | ✅ готово |
| Web-интерфейс этапа 1 | ✅ готово (nginx + `web/`, smoke/e2e-тесты) |
| **Этап 2 — enrollment / notification / события** | ✅ **готово (бэкенд, инфраструктура, демо, web-UI)** |

Итого по этапу 2: **95 из 96 пунктов** закрыто; остаётся проверка CI после первого push.

## 2. Предусловия (что уже есть и переиспользуется)

- [x] Parent POM: Boot 3.4.4 / Cloud 2024.0.0, Java 21, enforcer, Surefire с `*IT`.
- [x] `libs/common-events`: модуль, `EventTopics` (все exchanges и routing keys,
      включая `enrollment.*`, `lesson.completed`), `DomainEvent`.
- [x] `libs/common-security`: stateless JWT-resource-server, роли из claim `roles`,
      дополнительные публичные пути.
- [x] `libs/common-web`: RFC 9457 ProblemDetail (400/401/403/404/409).
- [x] `auth-service`: регистрация/логин/refresh/logout, JWK, Flyway, сид админа.
- [x] `course-service`: курсы/модули/уроки, publish/unpublish, владение.
- [x] `gateway-service`: маршруты, JWT, `X-User-Id` / `X-User-Roles`.
- [x] `infra/docker-compose.yml`: postgres 17, rabbitmq 4 + management,
      auth/course/gateway, web; `.env.example`; healthcheck-паттерн.
- [x] CI `.github/workflows/build.yml` (настроен; в удалённом репозитории ещё
      не проверялся — git-репозитория локально нет).
- [x] Testcontainers (PostgreSQL) в auth/course, `DOCKER_HOST` и `api.version`
      задокументированы в [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
- [x] `scripts/demo-stage-1.*`, `scripts/smoke-web.*`, README, docs/UI.md.

## 3. Цель и scope этапа

**Цель:** ввести асинхронную шину, запустить запись на курсы и уведомления;
события не теряются и не обрабатываются дважды.

**Новые сервисы:** `enrollment-service` (8083), `notification-service` (8084).

### Работы, требуемые документом (§12)

- [x] RabbitMQ-топология: exchanges + queues + bindings + DLQ.
- [x] Transactional outbox + relay в enrollment (и в auth/course как producers).
- [x] `enrollment-service` (MVS): enroll/cancel, `lesson_progress`,
      `course_snapshot` (обновляется из `course.published`).
- [x] `notification-service`: слушатели `user.registered`, `enrollment.created`,
      `lesson.completed`; идемпотентность через `processed_events`.
- [x] Публикация `user.registered` из auth-service через свой outbox.
- [x] Публикация `course.published` из course-service.
- [x] Счётчик записавшихся в course_db (из `enrollment.created`).

### Критерии приёмки (§12)

- [x] Outbox-таблица заполняется в той же транзакции, что и бизнес-изменение.
- [x] При остановке RabbitMQ события не теряются и публикуются после подъёма.
- [x] `processed_events` не даёт повторной обработки (проверяется тестом).
- [x] Запись на курс → событие → log.info-уведомление + инкремент счётчика.
- [x] Повторная доставка события не создаёт дубликат.

## 4. Зафиксированные решения (согласованы до кода)

| # | Решение | Выбор |
| :- | :--- | :--- |
| 1 | Формат сообщения | Конверт `{eventId, type, version, occurredAt, payload}`; payload — типизированный DTO |
| 2 | course-service | Публикует `course.published` **и** `course.updated`; слушает `enrollment.created/cancelled` → `enrolled_count +1/−1`; поле `enrolledCount` в API |
| 3 | Модель enrollment | Только `STUDENT`; курс должен быть опубликован в снапшоте; одна **активная** запись на (student, course) — partial unique index; отмена → статус `CANCELLED`, прогресс сохраняется; повторная запись после отмены — новая строка |
| 4 | Прогресс | `POST /api/enrollments/{id}/lessons/{lessonId}/complete`; требует активную запись и урок из этого курса; повтор идемпотентен; пишет `lesson_progress` + событие `lesson.completed` |
| 5 | notification-service | Запись в `notifications` + `log.info` + `GET /api/notifications` (свои) |
| 6 | Надёжность | Spring AMQP retry (3 попытки, exponential backoff) + DLX/DLQ на каждую очередь |
| 7 | Проверка падения брокера | Детерминированный IT (падающий publisher → запись осталась → успешная публикация) + демо-шаг с реальным `docker compose stop/start rabbitmq` |
| 8 | Общая инфраструктура | В `common-events`: конверт, DTO, топология, утилита relay; JPA outbox/processed_events — в каждом сервисе |

## 5. Работы по модулям

### 5.1. `libs/common-events` — контракты и шина

- [x] Зависимости: `spring-boot-starter-amqp`, `spring-boot-autoconfigure`, Jackson.
- [x] `EventEnvelope` (`eventId`, `type`, `version`, `occurredAt`, `JsonNode payload`).
- [x] `EventTypes` (или константы в `EventTopics`) — тип события = routing key.
- [x] Payload DTO (records): `UserRegisteredEvent`, `CoursePublishedEvent`,
      `CourseUpdatedEvent`, `EnrollmentCreatedEvent`, `EnrollmentCancelledEvent`,
      `LessonCompletedEvent`.
- [x] `RabbitTopologyConfiguration` (`@AutoConfiguration`, `Declarables`):
      exchanges + очереди + bindings + DLX/DLQ; property
      `lms.events.topology-enabled` (default `true`).
- [x] `OutboxStore` (интерфейс: `fetchPending(limit)`, `markPublished`, `markFailed`),
      `OutboxMessage` (eventId, type, payloadJson, occurredAt, attempts),
      `OutboxRelay` (публикация конверта через `RabbitTemplate`, логи, метрики позже).
- [x] Unit-тесты: сериализация/десериализация конверта, состав declared-топологии,
      ошибка публикации не помечает запись опубликованной.

### 5.2. `auth-service` — producer `user.registered`

- [x] Flyway `V3__outbox.sql`: `outbox(id, event_id unique, type, payload jsonb,
      occurred_at, published_at, attempts, last_error)` + индекс по `published_at`.
- [x] Outbox-store на JdbcTemplate (`JdbcOutboxStore`), без JPA-сущности
      (`@Query(nativeQuery) ... FOR UPDATE SKIP LOCKED`).
- [x] `service/OutboxWriter` — запись события в текущей транзакции.
- [x] `service/OutboxRelayScheduler` — `@Scheduled(fixedDelayString = ...)`, батч,
      вызов общего `OutboxRelay`.
- [x] `AuthService.register` пишет `UserRegisteredEvent` в outbox в той же транзакции.
- [x] Настройки: `spring.rabbitmq.*`, `lms.events.outbox.*` (batch, delay, enabled).
- [x] IT (Testcontainers: Postgres + RabbitMQ): регистрация → строка в outbox →
      relay публикует в `user.events`; затем consumer тестовый получает.

### 5.3. `course-service` — producer + счётчик

- [x] Flyway `V2__outbox_counter.sql`: `outbox`, `processed_events`,
      `courses.enrolled_count INTEGER NOT NULL DEFAULT 0`.
- [x] Outbox-инфраструктура (как в auth).
- [x] `publish()` → `CoursePublishedEvent`; `update()` → `CourseUpdatedEvent`
      (в той же транзакции).
- [x] Слушатель `enrollment.created/cancelled`:
      `processed_events` (insert … on conflict do nothing) → `enrolled_count ±1`.
- [x] `CourseSummaryResponse`/`CourseDetailResponse`: поле `enrolledCount`.
- [x] `@RabbitListener` + retry/DLQ; конфигурация очередей из `common-events`.
- [x] IT: публикация курса → outbox; повторная доставка `enrollment.created`
      не инкрементит счётчик дважды; отмена → −1.

### 5.4. `enrollment-service` — новый сервис (основной объём)

- [x] Модуль `services/enrollment-service` в parent POM; порт 8080 (host 8083).
- [x] POM: web, data-jpa, validation, actuator, amqp, flyway, postgres,
      `common-web`, `common-security`, `common-events`, springdoc,
      Testcontainers (postgres + rabbitmq).
- [x] `EnrollmentServiceApplication`, конфигурация (datasource `enrollment_db`,
      JWK URI, Rabbit, scheduling, outbox).
- [x] Flyway `V1__init_enrollment.sql`:
      - `enrollments(id, student_id, course_id, status CHECK IN ('ACTIVE','CANCELLED','COMPLETED'), enrolled_at, cancelled_at, updated_at)`;
      - `UNIQUE (student_id, course_id) WHERE status = 'ACTIVE'` (partial index);
      - `lesson_progress(id, enrollment_id FK CASCADE, lesson_id, completed_at, score NUMERIC(5,2), UNIQUE(enrollment_id, lesson_id))`;
      - `course_snapshot(course_id PK, instructor_id, title, description, published, published_at, updated_at)`;
      - `processed_events(event_id PK, handler, processed_at)`;
      - `outbox` (как в auth/course).
- [x] MVS-слои:
      - `model`: `Enrollment`, `EnrollmentStatus`, `LessonProgress`, `CourseSnapshot` + repositories;
      - `service`: `EnrollmentService` (enroll/cancel/completeLesson/listMy),
        `CourseSnapshotService` (upsert из `course.published/updated`),
        `OutboxWriter`, `OutboxRelayScheduler`, `ProcessedEventGuard`;
      - `view`: `EnrollmentController`, DTO, валидация;
      - `view/messaging`: `CourseEventsListener`.
- [x] Правила: enroll только `STUDENT`; курс есть в снапшоте и опубликован;
      дубль активной записи → 409; отмена только своей; завершение урока —
      только своя активная запись и урок из курса.
- [x] События через outbox: `enrollment.created`, `enrollment.cancelled`,
      `lesson.completed`.
- [x] Слушатель `course.published` и `course.updated` → upsert снапшота
      (идемпотентно, `processed_events`).
- [x] `GET /api/enrollments` (мои), `GET /api/enrollments/{id}` (своя),
      `GET /api/enrollments/{id}/progress`.
- [x] OpenAPI-аннотации, health.
- [x] IT (Postgres + RabbitMQ): публикация курса → снапшот; enroll → outbox;
      cancel; complete lesson; повторная доставка `course.published` не ломает снапшот.

### 5.5. `notification-service` — новый сервис

- [x] Модуль в parent POM; порт 8084.
- [x] POM: web, data-jpa, validation, actuator, amqp, flyway, postgres,
      `common-web`, `common-security`, `common-events`, springdoc, Testcontainers.
- [x] Flyway `V1__init_notification.sql`:
      `notifications(id, recipient_id, type, subject, body, created_at, read_at)`,
      `processed_events`; индекс по `recipient_id, created_at`.
- [x] Слушатели: `user.registered`, `enrollment.created`, `lesson.completed`
      (`@RabbitListener`, очередь на каждый). В одной транзакции: проверка
      `processed_events` → insert уведомления → `log.info` → отметка processed.
- [x] `GET /api/notifications` (свои, свежие первыми); PATCH `/read` — не реализован
      (решение: на этапе 2 достаточно чтения).
- [x] Retry/DLQ, health, OpenAPI.
- [x] IT: три типа событий создают уведомления; повторная доставка не создаёт дубль.

### 5.6. `gateway-service`

- [x] Маршруты `/api/enrollments/**` → enrollment, `/api/notifications/**` → notification.
- [x] Env-переменные `ENROLLMENT_SERVICE_URL`, `NOTIFICATION_SERVICE_URL`.
- [x] IT: 401 без токена, 200 с токеном, заголовки `X-User-*` пробрасываются.

### 5.7. Инфраструктура

- [x] `docker-compose.yml`: `enrollment-service` (8083), `notification-service` (8084),
      build-args, healthcheck `bash /dev/tcp`, `depends_on` postgres/rabbitmq/auth.
- [x] Env для всех producers/consumers: `SPRING_RABBITMQ_HOST=rabbitmq`,
      порт/логин/пароль, datasource-URL на свою БД.
- [x] `auth-service`/`course-service`: переменные RabbitMQ + `AUTH_JWKS_URI` уже есть.
- [x] Проверить лимиты ресурсов: 9 контейнеров (postgres, rabbitmq, auth, course,
      gateway, web, enrollment, notification + volumes).
- [x] `.env.example`: без изменений (секреты Rabbit уже есть).

### 5.8. Web-интерфейс (сделано 2026-10-20, расширение этапа 2)

- [x] `web/js/api/enrollments.js`, `web/js/api/notifications.js`.
- [x] Кнопка «Записаться»/«Отменить» на странице курса.
- [x] Экран «Мои курсы» (`#/my-courses`), прогресс по урокам.
- [x] Колокольчик уведомлений в шапке + список `#/notifications`.
- [x] Обновить `web/test/*` и `web/test/ui-e2e.mjs`.
- [x] `scripts/smoke-web.*` — добавить проверки новых экранов.

### 5.9. Скрипты, документация, CI

- [x] `scripts/demo-stage-2.sh` и `.ps1`:
      регистрация → роль → публикация курса → ожидание снапшота → enroll →
      счётчик +1 → complete lesson → уведомление → дубль события → stop/start RabbitMQ.
- [x] README: раздел «Этап 2» (API, события, счётчик, демо), обновить структуру.
- [x] `docs/TROUBLESHOOTING.md`: новые грабли (Rabbit/retry/DLQ, Testcontainers
      RabbitMQ, `SKIP LOCKED`, at-least-once).
- [x] CI: `mvn -B verify` локально зелёный с RabbitMQ-контейнерами; проверить после push.
- [x] Обновить `docs/UI.md` §7–8 (что появилось на этапе 2).

## 6. Топология RabbitMQ (план)

Exchanges (topic): `user.events`, `course.events`, `enrollment.events`
(+ `assessment.events` заведён на этапе 3). DLX: `lms.dlx` (direct).

| Очередь | Exchange / routing key | Consumer |
| :--- | :--- | :--- |
| `q.notification.user-registered` | `user.events` / `user.registered` | notification |
| `q.notification.enrollment-created` | `enrollment.events` / `enrollment.created` | notification |
| `q.notification.lesson-completed` | `enrollment.events` / `lesson.completed` | notification |
| `q.course.enrollment-created` | `enrollment.events` / `enrollment.created` | course |
| `q.course.enrollment-cancelled` | `enrollment.events` / `enrollment.cancelled` | course |
| `q.enrollment.course-published` | `course.events` / `course.published` | enrollment |
| `q.enrollment.course-updated` | `course.events` / `course.updated` | enrollment |
| `<queue>.dlq` | `lms.dlx` / `<queue>` | DLQ (ручной разбор) |

Каждая рабочая очередь: `x-dead-letter-exchange=lms.dlx`,
`x-dead-letter-routing-key=<queue>.dlq`; слушатели с retry 3 / backoff.

## 7. API этапа 2 (план)

| Метод | Путь | Доступ | Назначение |
| :--- | :--- | :--- | :--- |
| POST | `/api/enrollments` | `STUDENT` | запись на опубликованный курс |
| GET | `/api/enrollments` | JWT | мои записи |
| GET | `/api/enrollments/{id}` | владелец | запись + прогресс |
| POST | `/api/enrollments/{id}/cancel` | владелец | отмена (событие `enrollment.cancelled`) |
| POST | `/api/enrollments/{id}/lessons/{lessonId}/complete` | владелец | отметка урока (событие `lesson.completed`) |
| GET | `/api/notifications` | JWT | мои уведомления |
| PATCH | `/api/notifications/{id}/read` | владелец | отметить прочитанным (опционально) |

Изменения существующих: `CourseSummaryResponse.enrolledCount` (и detail).

## 8. Тесты

- [x] Unit: конверт (JSON), `EventTypes`, `OutboxRelay` (успех/ошибка), правила enrollment.
- [x] Счётчик и идемпотентность: покрыто `CourseIT` (дубль `eventId` не меняет счётчик).
- [x] IT auth: outbox в транзакции + публикация.
- [x] IT course: `course.published` → outbox; счётчик ±1; дубль события.
- [x] IT enrollment: снапшот из событий; enroll/cancel/complete; outbox; дубли.
- [x] IT notification: 3 типа событий; дубль не создаёт второе уведомление.
- [x] IT gateway: маршруты и доступ.
- [x] Детерминированный тест relay: `OutboxRelayTest` — падающий publisher оставляет запись неопубликованной.

- [x] Идемпотентность сквозная: одно событие доставлено дважды →
      счётчик и уведомления не дублируются (проверено в CourseIT/EnrollmentIT/NotificationIT).
- [x] Демо-скрипт: полный сценарий + реальный `stop/start rabbitmq`.
- [x] Web: unit-тесты новых `api/*` и `core/*` (78 тестов в `web/test/run.js`),
      smoke (36 проверок), ui-e2e (61 проверка).

## 9. Definition of Done этапа 2

- [x] `mvn -T1C clean verify` зелёный (все модули, Testcontainers Postgres + RabbitMQ).
- [x] `docker compose up -d --build` поднимает 9 контейнеров; все healthy.
- [x] Flyway применяется автоматически в `auth_db`, `course_db`,
      `enrollment_db`, `notification_db`.
- [x] `/actuator/health` зелёный у каждого сервиса.
- [x] Ключевой сценарий проверен через gateway (демо-скрипт / curl).
- [x] Интеграционный тест на ключевой сценарий присутствует и зелёный.
- [x] README этапа 2 + OpenAPI в новых сервисах.
- [ ] CI зелёный на `main` — проверяется после первого push (git-репозитория пока нет).
- [x] `scripts/demo-stage-2.*` воспроизводит сценарий с нуля.
- [x] `docs/TROUBLESHOOTING.md` дополнен новыми граблями.

## 10. Порядок выполнения

1. `common-events`: конверт, DTO, топология, relay + unit-тесты.
2. `auth-service`: миграция outbox, writer/relay, `user.registered`, IT.
3. `course-service`: миграция outbox/counter, публикация, слушатель, IT.
4. `enrollment-service`: скелет, миграции, MVS, API, outbox, снапшот, IT.
5. `notification-service`: скелет, миграции, слушатели, API, IT.
6. `gateway-service`: маршруты + IT.
7. Compose + env + healthcheck; прогнать стек.
8. Демо-скрипты, README, TROUBLESHOOTING, docs/UI.
9. UI-расширение (если в объёме) + smoke/e2e.
10. Финальный прогон: `mvn verify` → `compose up --build` → демо → health.

## 11. Риски и открытые вопросы

| Риск / вопрос | План |
| :--- | :--- |
| Согласованность счётчика и снапшота (eventual consistency) | демо и тесты ждут сходимости (polling с таймаутом) |
| Ат-least-once и дубли | `processed_events` + тест на повторную доставку |
| «Ядовитые» сообщения | retry 3 → DLQ; разбор вручную, алерты на этапе 5 |
| Testcontainers RabbitMQ в CI | проверить образ/timing, увеличить таймауты при необходимости |
| Пустой снапшот при enroll до `course.published` | 409 + понятная ошибка; демо ждёт публикацию |
| Объём UI | согласовать отдельно; бэкенд-часть не блокирует |
| Очереди для assessment (этап 3) | не создаём сейчас; добавим в этапе 3 |
| Retention outbox | на этапе 2 не чистим; добавить cleanup позже |

**Открытые вопросы (нужно подтвердить до кода):**

- [x] Текст уведомлений: фиксированные строки в коде или таблица `templates`?
      — решено: строки в коде + `log.info`, шаблоны позже.
- [x] Видит ли инструктор список записавшихся на свой курс
      — решено: не входит, только `enrolledCount`.
- [x] Ограничение попыток/дедлайнов — решено: вне этапа 2.
- [x] `PATCH /api/notifications/{id}/read` — решено: не делать на этапе 2, достаточно `GET`.
- [x] UI-часть этапа 2 (запись/мои курсы/уведомления) — в этом же этапе или отдельно?
      — решено: сделана в этом же этапе (2026-10-20), раздел 5.8.

## 12. Журнал выполнения

| Дата | Пункт | Статус | Комментарий |
| :--- | :--- | :--- | :--- |
| 2026-10-19 | 5.1 common-events: конверт, DTO, топология, relay | ✅ | 9 unit-тестов, `mvn test` зелёный |
| 2026-10-19 | 5.2 auth-service: outbox + user.registered | ✅ | AuthIT 11 тестов; публикация в очередь проверена |
| 2026-10-19 | 5.3 course-service: outbox + счётчик enrolled | ✅ | CourseIT 12 тестов; дубль события не инкрементит |
| 2026-10-19 | 5.4 enrollment-service: запись, прогресс, снапшот | ✅ | EnrollmentIT 5 тестов; отмена и повторная запись работают |
| 2026-10-19 | 5.5 notification-service: 3 слушателя + GET API | ✅ | NotificationIT 3 теста; дубль не создаёт уведомление |
| 2026-10-19 | 5.6 gateway: маршруты enrollment/notifications | ✅ | GatewayIT 14 тестов, 401/200 проверены |
| 2026-10-19 | 5.7 compose: enrollment/notification + RabbitMQ env | ✅ | 9 контейнеров healthy, compose config валиден |
| 2026-10-19 | 5.9 demo/README/TROUBLESHOOTING/UI docs | ✅ | demo-stage-2 bash и ps1 проходят; docs обновлены |
| 2026-10-19 | DoD: mvn clean verify | ✅ | 75 тестов, все модули SUCCESS |
| 2026-10-19 | DoD: падение RabbitMQ не теряет события | ✅ | демо: stop → outbox=1 → start → счётчик догнал |
| 2026-10-20 | 5.8 web: api/enrollments + api/notifications, панель записи на странице курса | ✅ | ретрай-подсказка про снапшот курса, отметки уроков, `enrolledCount` в метаданных |
| 2026-10-20 | 5.8 web: экраны «Мои курсы» (#/my-courses) и «Уведомления» (#/notifications) | ✅ | колокольчик с клиентским счётчиком «новых» (localStorage), опрос 60 с |
| 2026-10-20 | 5.8 web: тесты обновлены | ✅ | unit 78 (было 63), ui-e2e 62 проверки (было 40), smoke 36 проверок (было 26) |

---

### Правила отметок

1. Перед началом работы над пунктом — поставить `[~]` текстом рядом
   (например, `- [ ] **(в работе с 2026-…)** …`).
2. После зелёных тестов/проверки — `[x]` и строка в «Журнале выполнения».
3. Если пункт оказался не нужен — не удалять, а помечать `[x]` с комментарием
   «не требуется, причина …» (история решений важна).
4. Обновлять таблицу статуса в разделе 1 (счётчик выполненных пунктов).
5. После этапа — добавить выявленные грабли в
   [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
