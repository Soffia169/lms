# LMS — Architecture Vision

> **Версия:** 1.1
> **Стек:** Java 21 · Spring Boot 3.4 · Maven (multi-module) · PostgreSQL 17 · RabbitMQ 4 · Docker
> **Паттерн внутри сервиса:** MVC с трёхслойной архитектурой (Controller · Service · Repository · Model)
> **Стиль:** Микросервисы с прагматичными упрощениями для pet-проекта

---

## 1. Контекст и цели

### 1.1. Что строим
Learning Management System — платформа, где инструкторы публикуют курсы, студенты записываются, проходят уроки и сдают оценивания, а система отслеживает прогресс и уведомляет участников.

### 1.2. Цели
- **Учебная цель:** отработать микросервисную архитектуру в реальных условиях — изоляция данных, sync/async коммуникация, отказоустойчивость, наблюдаемость.
- **Техническая цель:** получить систему, которую можно расширять без переписывания ядра и без превращения в распределённый монолит.
- **Прагматичная цель:** стартовать с 4–5 сервисов, а не с 15. Добавлять сервисы только при реальной потребности.

### 1.3. Не-цели (на старте)
- Мультитенантность.
- Реалтайм-коммуникации (WebSocket, чаты).
- Продвинутая аналитика / BI.
- Мобильные клиенты.

---

## 2. Архитектурные принципы

| # | Принцип | Как соблюдаем |
| :-- | :--- | :--- |
| 1 | **Database per service** | У каждого сервиса своя БД, никаких JOIN между БД, никаких общих таблиц |
| 2 | **Bounded context** | Границы сервисов = бизнес-возможности (auth, course, enrollment, assessment, media, notification) |
| 3 | **Независимый деплой** | Каждый сервис — свой JAR, свой Docker-образ, свой пайплайн |
| 4 | **Async by default для side-effects** | Всё, что не требует немедленного ответа пользователю — через события |
| 5 | **Sync только где необходимо** | Максимум 1–2 хопа между сервисами, никаких длинных цепочек |
| 6 | **Outbox для надёжности событий** | Каждый producer пишет событие в свою outbox-таблицу в одной транзакции с бизнес-изменением |
| 7 | **Идемпотентный consumer** | Дедупликация по `eventId` в каждой таблице-получателе |
| 8 | **Defense in depth** | JWT валидируется и на gateway, и в каждом сервисе |
| 9 | **Тонкие общие библиотеки** | `common-*` содержат только контракты и инфраструктурные стартеры, без бизнес-логики |
| 10 | **MVC / Трёхслойная архитектура** | Чёткое разделение Controller / Service / Repository / Model в каждом модуле |

---

## 3. Системный контекст

```
┌──────────────┐
│   Клиент     │  (SPA / мобильный / curl)
│  (браузер)   │
└──────┬───────┘
       │ HTTPS + JWT
       ▼
┌────────────────────────────────────────────────────────┐
│                   gateway-service                      │
│  маршрутизация · валидация JWT · rate limit · CORS     │
└──────┬─────────────────────────────────────────────────┘
       │
       ├────────────► auth-service        ──► auth_db
       ├────────────► course-service      ──► course_db
       ├────────────► enrollment-service  ──► enrollment_db
       ├────────────► assessment-service  ──► assessment_db
       └────────────► media-service       ──► media_db + MinIO

       ▲ события (RabbitMQ)
       │
       ├── auth, course, enrollment, assessment  (producers)
       └── notification, enrollment, analytics   (consumers)
```

---

## 4. Каталог сервисов

| Сервис | Ответственность | БД | Появляется на этапе |
| :--- | :--- | :--- | :--- |
| `gateway-service` | Единая точка входа, маршрутизация, JWT-валидация, rate limiting | — (Redis) | 1 |
| `auth-service` | Регистрация, логин, выдача JWT (RS256), роли | `auth_db` | 1 |
| `course-service` | Курсы, модули, уроки, публикация | `course_db` | 1 |
| `enrollment-service` | Запись на курс, прогресс, завершение | `enrollment_db` | 2 |
| `notification-service` | Email / in-app уведомления по событиям | `notification_db` | 2 |
| `assessment-service` | Тесты, задания, ответы, оценки | `assessment_db` | 3 |
| `media-service` | Загрузка файлов и видео, presigned URL | `media_db` + MinIO | 4 |
| `analytics-service` *(опционально)* | Read-модели, отчёты (CQRS) | `analytics_db` | 7+ |

---

## 5. Внутренняя архитектура сервиса: MVC и трёхслойная архитектура

Классический MVC — это паттерн уровня представления (UI). В REST-сервисе «View» — это HTTP-ответ в формате JSON, который формируется контроллером. Поэтому MVC для Spring Boot REST-сервиса разворачивается в **трёхслойную архитектуру**.

| Слой MVC | Реализация в сервисе | Ответственность |
| :--- | :--- | :--- |
| **Controller** (View) | `@RestController` | Принимает HTTP-запрос, валидирует вход (`@Valid`), делегирует в Service, формирует HTTP-ответ и статус-код. **Без бизнес-логики.** |
| **Service** | `@Service` | Бизнес-логика, сценарии использования, транзакционные границы, оркестрация репозиториев и публикации событий через Outbox. |
| **Repository** | Spring Data `JpaRepository` | Доступ к данным, запросы к БД. Не содержит бизнес-правил. |
| **Model** | `@Entity`, value objects, enum | Доменные сущности и их инварианты. Изолированы от HTTP, RabbitMQ и прочих адаптеров. |

Дополнительно, помимо HTTP-входа, у сервиса есть **входящие адаптеры событий** — слушатели RabbitMQ. Они не относятся к «View» в строгом смысле MVC, но играют ту же роль: принимают внешний вход и делегируют в Service. Поэтому выделяются в отдельный пакет `messaging/` (или `listener/`).

### 5.1. Структура пакетов сервиса

```
<service>/
└── src/main/java/com/lms/<service>/
    ├── <Service>Application.java
    │
    ├── controller/                       # VIEW: HTTP-адаптеры
    │   └── <X>Controller.java            # @RestController, тонкий слой
    │
    ├── dto/                              # Контракты HTTP-уровня
    │   ├── <X>Request.java               # с @Valid-аннотациями
    │   └── <X>Response.java
    │
    ├── service/                          # SERVICE: бизнес-логика
    │   └── <X>Service.java               # use cases
    │
    ├── repository/                       # REPOSITORY: доступ к данным
    │   └── <X>Repository.java            # extends JpaRepository
    │
    ├── model/                            # MODEL: домен и персистентность
    │   ├── <Entity>.java                 # JPA-сущности
    │   └── <Enum>.java
    │
    ├── outbox/                           # Инфраструктура транзакционных событий
    │   ├── OutboxWriter.java             # запись события в outbox (JDBC)
    │   ├── JdbcOutboxStore.java          # логика работы с таблицей outbox
    │   └── OutboxRelayScheduler.java     # планировщик публикации в RabbitMQ
    │
    └── messaging/                        # Входящие адаптеры событий
        └── <X>Listener.java              # @RabbitListener
```

**Правила слоёв:**
- **Контроллер (`controller/`)** не содержит бизнес-логики: принимает `@RequestBody`, валидирует, извлекает identity из `Jwt`, делегирует в Service. Не знает про репозитории и RabbitMQ.
- **Сервис (`service/`)** — единственное место, где живёт бизнес-логика и транзакционные границы (`@Transactional`). Оркестрирует вызовы репозиториев и запись в `outbox`.
- **Репозиторий (`repository/`)** — только Spring Data-интерфейсы. Не вызывается напрямую из контроллера.
- **Модель (`model/`)** — JPA-сущности с инвариантами. Не знает про HTTP и RabbitMQ.
- **Слушатели (`messaging/`)** — десериализуют payload, вызывают Service, обеспечивают идемпотентность (дедупликация по `eventId`).

---

## 6. Модель взаимодействия

### 6.1. Синхронно (REST через gateway)
- Клиент → gateway → target-service (один хоп).
- Межсервисные вызовы — только при явной необходимости немедленного ответа (например, enrollment сверяется со снапшотом курса; при отсутствии снапшота — fallback-запрос в course-service с Circuit Breaker).

### 6.2. Асинхронно (RabbitMQ, topic exchanges)

**Каталог событий:**

| Exchange | Routing key | Producer | Consumers |
| :--- | :--- | :--- | :--- |
| `user.events` | `user.registered` | auth | notification |
| `course.events` | `course.published`, `course.updated` | course | enrollment (snapshot), notification |
| `enrollment.events` | `enrollment.created`, `enrollment.cancelled` | enrollment | course (счётчики), notification, assessment |
| `enrollment.events` | `lesson.completed` | enrollment | notification, analytics |
| `assessment.events` | `assessment.submitted`, `assessment.graded` | assessment | enrollment (прогресс), notification |

### 6.3. Надёжность событий
- **Transactional Outbox** в каждом producer: таблица `outbox` в его БД, запись в одной транзакции с бизнес-изменением.
- **Outbox Relay** (планировщик в том же сервисе) публикует неопубликованные записи в RabbitMQ с `fixedDelay`.
- **Идемпотентный consumer**: таблица `processed_events` (или unique-constraint по `eventId`) в каждом получателе.
- **DLQ** для «ядовитых» сообщений.
- **Сага (хореография)** для многошаговых сценариев (например, отмена записи при снятии курса с публикации).

### 6.4. Пример потока: запись на курс

```
1. Client → gateway → enrollment-service: POST /api/enrollments
2. enrollment-service проверяет снапшот курса в своей БД
3. Создаёт enrollment + пишет EnrollmentCreatedEvent в outbox (одна транзакция)
4. Outbox Relay публикует event в enrollment.events
5. course-service   ← инкрементит счётчик записавшихся
   notification     ← письмо студенту
   assessment       ← инициализация пустого прогресса
```

---

## 7. Данные

### 7.1. Схема владения
- **auth_db**: `users`, `refresh_tokens`, `outbox`
- **course_db**: `courses`, `modules`, `lessons`, `outbox`
- **enrollment_db**: `enrollments`, `lesson_progress`, `course_snapshot`, `processed_events`, `outbox`
- **assessment_db**: `assessments`, `questions`, `submissions`, `processed_events`, `outbox`
- **media_db**: `media_files`
- **notification_db**: `notifications`, `processed_events`, `templates`

### 7.2. Правила
- Миграции — только через **Flyway** внутри каждого сервиса.
- Никаких FK-связей между БД разных сервисов. Ссылочная целостность — через события и снапшоты.
- Локально — одна PostgreSQL с 6 БД (через `init/01-databases.sql`), в проде — отдельный инстанс на сервис.

---

## 8. Безопасность

- **auth-service** выпускает access-JWT (RS256, TTL 15 мин) + refresh token (TTL 7 дней).
- **gateway-service** валидирует подпись по JWK-endpoint auth-service, пробрасывает `X-User-Id`, `X-User-Roles`.
- **Каждый сервис** — OAuth2 Resource Server: повторно валидирует JWT (defense in depth).
- **Роли:** `STUDENT`, `INSTRUCTOR`, `ADMIN`. Авторизация — `@PreAuthorize` на методах + проверка владения ресурсом (инструктор редактирует только свои курсы).
- **Секреты:** в локалке — `.env` / docker secrets; в проде — Vault / managed secret manager.
- **Rate limiting** на gateway (Redis sliding window).

---

## 9. Наблюдаемость

| Сигнал | Инструмент |
| :--- | :--- |
| Метрики | Micrometer → Prometheus → Grafana |
| Трейсинг | Micrometer Tracing (Brave) → Tempo / Zipkin, `traceId` пробрасывается через gateway |
| Логи | Structured JSON → Loki (или ELK) |
| Health | Spring Actuator: `/health`, `/prometheus` |
| Алерты | Alertmanager: error rate, p99 latency, DLQ depth |

---

## 10. Структура репозитория

```
lms/
├── pom.xml                              # parent POM (dependencyManagement)
├── libs/
│   ├── common-events/                   # DTO событий, EventTopics, RabbitTopologyConfig
│   ├── common-security/                 # ResourceServer autoconfiguration
│   └── common-web/                      # GlobalExceptionHandler, ProblemDetail
├── services/
│   ├── gateway-service/
│   ├── auth-service/
│   ├── course-service/
│   ├── enrollment-service/
│   ├── assessment-service/
│   ├── media-service/
│   └── notification-service/
├── web/                                 # SPA этапа 1 (ES-модули, без сборки)
│   ├── index.html, css/, js/            # js/core, js/api, js/ui, js/views
│   ├── nginx.conf                       # статика + прокси /api на gateway
│   └── test/                            # unit + browser-smoke + ui-e2e
└── infra/
    ├── Dockerfile                       # multi-stage, параметризован SERVICE
    ├── Dockerfile.web                   # nginx + статика SPA
    ├── docker-compose.yml
    ├── postgres/init/01-databases.sql
    └── observability/                   # prometheus.yml, grafana/, tempo.yml
```

**Правила:**
- `libs/common-*` — только контракты и авто-конфигурация, без бизнес-логики.
- Сервисы не зависят друг от друга напрямую; только `common-events` (контракты) и `common-*` (инфра).
- Внутри каждого сервиса используется классическая MVC / трёхслойная структура: `controller/`, `dto/`, `service/`, `repository/`, `model/`, а также `messaging/` и `outbox/`.
- Сборка конкретного сервиса: `mvn -pl services/X -am package`.

---

## 11. Инфраструктура

- **Локально:** `docker compose up` → postgres, rabbitmq, redis, minio, gateway, auth, course, enrollment, notification + observability-стек.
- **CI:** GitHub Actions, matrix по сервисам, `mvn verify` + Testcontainers.
- **Прод:** Kubernetes (Helm-чарты), отдельные managed PostgreSQL, external RabbitMQ, S3-совместимое хранилище.

---

## 12. Дорожная карта по этапам

### 🔹 Этап 0 — Фундамент
**Цель:** создать скелет монорепо, чтобы последующие этапы вставали на готовую инфраструктуру.

**Scope:**
- Parent `pom.xml` (Spring Boot 3.4 BOM, Spring Cloud 2024).
- `libs/common-events`, `libs/common-security`, `libs/common-web`.
- `infra/Dockerfile` (multi-stage, параметризован `SERVICE`).
- `infra/docker-compose.yml` с postgres + rabbitmq (без сервисов приложения).
- `infra/postgres/init/01-databases.sql`.
- CI: `.github/workflows/build.yml` — `mvn -B verify` на push.

**Deliverables:** `mvn verify` зелёный; `docker compose up` поднимает инфраструктуру.

**Критерии приёмки:**
- `mvn -T1C package` собирает все модули.
- В CI проходит сборка.
- В `postgres` созданы 6 БД.
- `rabbitmq` доступен на 5672, management — на 15672.

**Не входит:** ни одного запущенного сервиса приложения.

---

### 🔹 Этап 1 — Ядро (MVP)
**Цель:** дать работающий сквозной поток «регистрация → логин → создание курса».

**Сервисы:** `gateway-service`, `auth-service`, `course-service`.

**Scope:**
- `auth-service` (MVC): регистрация, логин, JWT RS256, refresh token, BCrypt.
- `course-service` (MVC): CRUD курсов, модулей, уроков; публикация (без событий на этом этапе — только `is_published`).
- `gateway-service`: маршруты `/api/auth/**` (permitAll), `/api/courses/**` (authenticated).
- Flyway-миграции для auth_db и course_db.
- OpenAPI (`springdoc`) в каждом сервисе.

**Deliverables:**
- `curl /api/auth/register` → userId.
- `curl /api/auth/login` → accessToken.
- `curl -H "Authorization: Bearer ..." POST /api/courses` → courseId.
- `docker compose up` поднимает всё, сквозной сценарий работает.

**Критерии приёмки:**
- JWT валидируется и на gateway, и в course-service.
- Роль `INSTRUCTOR` может создавать курс, `STUDENT` — нет.
- Все миграции применяются автоматически при старте.

---

### 🔹 Этап 2 — Обучение и события
**Цель:** ввести асинхронную шину и запустить запись на курсы с уведомлениями.

**Сервисы:** + `enrollment-service`, `notification-service`.

**Scope:**
- `enrollment-service` (MVC): enroll / cancel, `lesson_progress`, `course_snapshot` (обновляется из `course.published`).
- Outbox + OutboxRelay (паттерн в enrollment).
- `notification-service`: слушатели `user.registered`, `enrollment.created`, `lesson.completed`; идемпотентность через `processed_events`.
- RabbitMQ-топология: exchanges + queues + bindings.
- Публикация `user.registered` из auth-service через собственный outbox.
- Публикация `course.published` из course-service.

**Deliverables:**
- Запись на курс → событие → письмо (заглушка `log.info`) + инкремент счётчика в course_db.
- Повторная доставка события не создаёт дубликат (проверяется вручную/тестом).

**Критерии приёмки:**
- Outbox-таблица заполняется в той же транзакции, что и enrollment.
- При остановке RabbitMQ события не теряются (публикуются после подъёма).
- `processed_events` не даёт повторной обработки.

---

### 🔹 Этап 3 — Оценивание
**Цель:** добавить тесты и задания, замкнуть цикл «учился → проверился → прогресс».

**Сервисы:** + `assessment-service`.

**Scope:**
- `assessment-service` (MVC): `Assessment`, `Question`, `Submission`.
- Автопроверка MCQ / TRUE_FALSE; ручная проверка Assignment.
- Слушатель `enrollment.created` → инициализация пустого прогресса.
- Публикация `assessment.submitted`, `assessment.graded`.
- `enrollment-service` слушает `assessment.graded` → обновляет `lesson_progress.score`.

**Deliverables:**
- Студент сдаёт тест → оценка рассчитывается → прогресс обновляется → письмо о результате.
- Инструктор видит список submissions по assessment.

**Критерии приёмки:**
- Автопроверка детерминирована и покрыта unit-тестами.
- Ручная проверка не блокирует остальные операции.
- `assessment.graded` корректно обновляет прогресс (идемпотентно).

---

### 🔹 Этап 4 — Медиа
**Цель:** дать возможность загружать файлы и видео без протаскивания тяжёлого трафика через сервисы.

**Сервисы:** + `media-service` + MinIO.

**Scope:**
- `media-service` (MVC): upload (multipart), presigned URL для download, метаданные в `media_db`, файлы — в MinIO/S3.
- Интеграция с `course-service`: `lesson.content` может ссылаться на `mediaId`.
- Presigned URL генерируется под запрос аутентифицированного пользователя.

**Deliverables:**
- Загрузка видео → возвращается `mediaId`.
- Прикрепление `mediaId` к уроку.
- Студент получает presigned URL, видео проигрывается напрямую из MinIO.

**Критерии приёмки:**
- Файлы не проходят через gateway и не занимают heap сервисов.
- Presigned URL истекает через заданный TTL.
- Ограничение размера и MIME-типа на уровне контроллера.

---

### 🔹 Этап 5 — Наблюдаемость
**Цель:** увидеть, что происходит в распределённой системе.

**Scope:**
- Micrometer + Prometheus + Grafana во всех сервисах.
- Micrometer Tracing (Brave) + Tempo/Zipkin; `traceId` пробрасывается через gateway.
- Structured JSON logging → Loki.
- Дашборды Grafana: latency p50/p99 по сервисам, error rate, DLQ depth, outbox lag.
- Алерты Alertmanager: 5xx rate > 1%, outbox lag > 60s, DLQ > 0.

**Deliverables:**
- По `traceId` из клиентского запроса виден полный путь: gateway → service → rabbit → consumer.
- Дашборд с ключевыми метриками.
- Алерт по DLQ уходит в тестовый канал.

**Критерии приёмки:**
- Все сервисы экспортируют `/actuator/prometheus`.
- Каждый HTTP-запрос и каждое событие имеют трейс.
- Outbox lag и DLQ видны на дашборде.

---

### 🔹 Этап 6 — Устойчивость и качество
**Цель:** система не разваливается при частичных отказах, тесты защищают от регрессий.

**Scope:**
- Resilience4j: timeout + circuit breaker на межсервисных вызовах (`enrollment → course`, `gateway → *`).
- Fallback-логика (например, enrollment использует снапшот при недоступности course-service).
- Testcontainers для интеграционных тестов (postgres, rabbitmq).
- Contract-тесты (Pact) между producer и consumer событий.
- E2E-тест: «регистрация → создание курса → запись → сдача теста → прогресс».
- Rate limit на gateway (Redis).

**Deliverables:**
- Отключение course-service не роняет enrollment (fallback + CB).
- `mvn verify` покрывает unit + integration + contract.
- Пайплайн падает при breaking change в контракте события.

**Критерии приёмки:**
- CB переходит в OPEN при N ошибках подряд и восстанавливается после cooldown.
- Тест «RabbitMQ упал → события в outbox → после подъёма доставляются» зелёный.
- Pact-тест ловит несовместимость DTO события.

---

### 🔹 Этап 7 — Production Readiness
**Цель:** подготовить систему к реальной эксплуатации.

**Scope:**
- Независимые CI/CD-пайплайны на каждый сервис (build → test → image → deploy).
- Kubernetes (Helm-чарты): Deployment, Service, HPA, Ingress, ConfigMap/Secret.
- Отдельные PostgreSQL-инстансы на сервис (managed).
- Secrets management (Vault / managed).
- Backup & restore для БД, retention policy.
- Load testing (k6 / Gatling) с baseline SLO.
- Runbooks: что делать при падении RabbitMQ / БД / DLQ.
- Security hardening: HTTPS-only, CORS whitelist, аудит зависимостей (OWASP dependency-check), SAST.

**Deliverables:**
- `helm install` поднимает весь стек в dev-кластере.
- Нагрузочный тест подтверждает baseline (например, 100 RPS, p99 < 300ms).
- Runbook-и покрывают топ-5 инцидентов.
- OWASP DC и SAST в CI без high/critical.

**Критерии приёмки:**
- Независимый релиз одного сервиса не затрагивает другие.
- Восстановление из backup протестировано.
- Все алерты из этапа 5 срабатывают в реальном инциденте (chaos-тест).

---

## 13. Риски и митигации

| Риск | Вероятность | Митигация |
| :--- | :--- | :--- |
| Распределённый монолит (shared БД, shared DTO) | Средняя | Database per service, тонкие `common-*`, Pact на события (этап 6) |
| Каскадные падения | Средняя | Resilience4j (этап 6), async где возможно, fallback |
| Потеря событий | Низкая | Outbox (этап 2), идемпотентность, DLQ, алерты (этап 5) |
| Overengineering для pet-проекта | Средняя | Фиксированный порядок этапов; не вводим сервис без реальной потребности |
| Сложность отладки | Высокая | Tracing с этапа 5 (до него — structured logging) |
| Дрейф контрактов событий | Средняя | `common-events` в Maven + Pact (этап 6) |
| Секреты в репозитории | Средняя | `.env` в `.gitignore` локально, Vault в проде (этап 7) |

---

## 14. Definition of Done для каждого этапа

Этап считается завершённым, когда выполнены **все** пункты:

1. **Сервисы собираются и запускаются** — `mvn verify` зелёный, `docker compose up` работает.
2. **Миграции применяются автоматически** при старте сервиса (Flyway).
3. **Health-check** (`/actuator/health`) зелёный для каждого сервиса.
4. **Ключевой сценарий этапа проверен вручную** через `curl` или UI.
5. **Интеграционный тест** на ключевой сценарий (Testcontainers) присутствует и зелёный.
6. **Документация обновлена:** README этапа + OpenAPI в сервисах, появившихся на этапе.
7. **CI зелёный** на `main`.
8. **Демо-скрипт** (`scripts/demo-stage-N.sh`) воспроизводит сценарий этапа с нуля.

---

## 15. Ссылки на артефакты

- **Шаблон проекта** — см. предыдущий ответ (parent POM, `libs/*`, `services/auth-service`, `services/enrollment-service`, `infra/*`).
- **Каталог событий** — раздел 6.2.
- **Схема БД** — раздел 7.1.
- **Roadmap** — раздел 12 (этапы 0–7).
- **Web-клиент** — раздел 16 и [docs/UI.md](docs/UI.md).

---

## 16. Web-клиент (этапы 1–2)

### 16.1. Решение

Интерфейс сделан **SPA на нативных ES-модулях**: без сборки, без npm-зависимостей и без
CDN. Для pet-проекта это даёт воспроизводимость (открывается из nginx, статического
сервера и даже `file://`), нулевое время на toolchain и независимый от Java деплой.
Плата — нет JSX/типизации и экосистемы компонентов; при росте UI (этап 3+) выбор
пересматривается, но контракты `core/` от фреймворка не зависят.

### 16.2. Границы и слои

Клиент — отдельный деплой-юнит (`web/`, образ `lms-web`), а не часть gateway. Это
сохраняет принцип независимого деплоя: статика и сервисы обновляются раздельно.

```
web/js/
├── core/    # инфраструктура: сессия, refresh, HTTP, ошибки, роутер, конфиг, прогресс записей
├── api/     # методы auth / course / enrollment / notification (повторяют README)
├── ui/      # переиспользуемые компоненты: каркас, формы, модальные окна, состояния
└── views/   # экраны: login, register, catalog, course, my-courses, notifications, profile, 404
```

Правила те же, что и в MVC внутри сервиса: **View** (экраны) не содержит бизнес-логики,
**api/** — только контракты, **core/** не знает про DOM (и поэтому тестируется в Node).

### 16.3. Взаимодействие с системой

```
браузер → nginx :8088
            ├── /         → index.html, css/, js/
            ├── /api/...  → gateway :8080 → auth / course (JWT)
            └── /healthz  → gateway /actuator/health
```

Основной путь — один origin, поэтому CORS не участвует. Политика CORS на gateway
(точный список origin, не `*`) нужна для разработки UI отдельным сервером и для
развёртывания SPA на собственном домене (раздел 8).

Синхронных межсервисных вызовов клиент не делает: только gateway. Со этапа 2
UI вызывает enrollment-service и notification-service по тем же правилам
(панель записи на курсе, экраны «Мои курсы» и «Уведомления», опрос уведомлений).

### 16.4. Сессия

Access-токен (15 мин) и refresh-токен (7 дней) хранятся на клиенте; claims читаются
только для UX. Критичное требование бэкенда — **не предъявлять отозванный refresh
повторно** (иначе гасятся все сессии пользователя), поэтому клиент:

- обновляет пару заранее, до истечения access-токена;
- делает refresh **single-flight** (одно сетевое обращение на все параллельные запросы);
- согласует refresh между вкладками через Web Locks и `storage`-событие;
- на 401 повторяет запрос один раз, при неудаче — разлогинивает и предлагает вход.

### 16.5. Проверка

Три уровня, без внешних зависимостей:

| Уровень | Инструмент | Что покрывает |
| :--- | :--- | :--- |
| unit (78) | `node web/test/run.js` | JWT, сессия и refresh single-flight, problem+json, роутер, формат, прогресс записей, счётчик уведомлений, контракты api/ |
| API из браузера | `web/test/browser-smoke.html` | same-origin прокси, логин, CRUD, ротация, logout |
| UI сквозной (62) | `web/test/ui-e2e.mjs` (CDP) | клики, формы, публикация, запись студента, отметка урока, «Мои курсы», уведомления, роли, тема |

Плюс `scripts/smoke-web.*` — проверка nginx и прокси без браузера (36 проверок,
включая enrollment/notifications через gateway), входит в чек-лист этапа
(раздел 14, пункт 8).

### 16.6. Развитие по этапам

| Этап | Статус | Что добавляется в UI |
| :--- | :--- | :--- |
| 2 | ✅ готово | запись на курс, отметки уроков, «Мои курсы», колокольчик и экран уведомлений |
| 3 | план | прохождение теста, результаты, оценки в прогрессе |
| 4 | план | вложение медиа к уроку, presigned-плеер |
| 5–7 | план | метрики/трейсы не влияют на UI; CSP и httpOnly-cookie для refresh |

---

*Документ — живой. После каждого этапа обновляется: добавляются новые сервисы, контракты событий, разделы observability и риски.*
