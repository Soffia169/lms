# LMS — Learning Management System

Учебный pet-проект: микросервисная платформа обучения, где инструкторы публикуют курсы,
студенты записываются, проходят уроки и сдают оценивания, а система отслеживает прогресс
и уведомляет участников.

Архитектурный документ — [Architecture_Vision.md](Architecture_Vision.md).
Документация web-интерфейса — [docs/UI.md](docs/UI.md).
Текущее состояние: **этап 2 — обучение и события** (auth, course, enrollment,
notification, gateway): запись на курс, прогресс уроков, счётчик записавшихся,
транзакционный outbox и RabbitMQ-шина. Web-интерфейс покрывает этапы 1–2:
кнопка «Записаться», «Мои курсы» и колокольчик уведомлений уже в UI.

## Стек

| Компонент | Версия |
| :--- | :--- |
| Java | 21 |
| Spring Boot | 3.4.4 (BOM) |
| Spring Cloud | 2024.0.0 (BOM), Spring Cloud Gateway |
| Сборка | Maven (multi-module), JDK 21 |
| Web UI | нативные ES-модули (без сборки и npm-зависимостей) + nginx |
| PostgreSQL | 17 |
| RabbitMQ | 4 (+ management) |
| Контейнеры | Docker, Docker Compose v2 |
| Тесты | JUnit 5, Testcontainers, MockMvc, WebTestClient |

## Требования

- **JDK 21**; `JAVA_HOME` должен указывать на него (сборка проверяет версию через enforcer).
- **Maven 3.9+**.
- **Docker Desktop / Docker Engine + Compose v2** — инфраструктура и интеграционные тесты.

> ⚠️ Если `java -version` не выводит версию 21 (например, сломан Oracle-javapath),
> задайте `JAVA_HOME` на JDK 21 перед сборкой. Без рабочего `JAVA_HOME` Maven может
> завершиться без вывода и с кодом 0, ничего не собрав:
>
> ```powershell
> $env:JAVA_HOME = "$env:USERPROFILE\.jdks\jdk-21"   # Windows
> export JAVA_HOME=~/.jdks/jdk-21                    # bash
> ```
>
> ⚠️ На Windows Testcontainers 1.20.x не читает docker-контекст («desktop-linux»),
> поэтому `mvn verify` может не найти Docker. Укажите endpoint явно:
>
> ```powershell
> $env:DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine'
> ```
>
> Версия Docker API для тестов задана в parent POM (`docker.api.version=1.44`):
> Testcontainers 1.20.x иначе откатывается на 1.32, которую Docker Engine 29 отклоняет.

## Быстрый старт

```bash
# 1. Сборка всех модулей, unit- и интеграционные тесты (нужен запущенный Docker)
mvn -T1C clean verify

# 2. Инфраструктура + сервисы + web-интерфейс
cd infra
cp .env.example .env      # опционально: без .env используются значения по умолчанию
docker compose up -d --build
docker compose ps

# 3. Сквозной сценарий этапа 1
cd ..
bash scripts/demo-stage-1.sh                              # Git Bash / WSL / Linux
powershell -File scripts/demo-stage-1.ps1                 # Windows PowerShell 5.1+ / pwsh

# 4. Сквозной сценарий этапа 2 (запись, события, падение RabbitMQ)
bash scripts/demo-stage-2.sh
powershell -File scripts/demo-stage-2.ps1

# 5. Web-интерфейс
#    http://localhost:8088  (вход: admin@lms.local / Admin123!)
bash scripts/smoke-web.sh                                 # проверка UI без браузера
powershell -File scripts/smoke-web.ps1
```

Скрипты `demo-stage-1.*` проверяют: регистрацию, логин, `403` у студента, выдачу роли
`INSTRUCTOR` админом, создание курса/модуля/урока, публикацию, refresh-ротацию и logout.
`demo-stage-2.*` — публикацию курса и снапшот, запись, счётчик `enrolledCount`, отметку
урока, in-app уведомления и восстановление после остановки RabbitMQ.
`smoke-web.*` дополнительно проверяют, что nginx отдаёт статику, проксирует `/api`
на gateway, не публикует служебные файлы и что ротация токенов работает через UI-origin.

Проверить состояние: `docker compose exec postgres psql -U lms -l`,
RabbitMQ management UI — <http://localhost:15672> (`lms` / `lms_password`),
health сервисов — `/actuator/health` на портах 8080–8084.
Swagger UI — <http://localhost:8081/swagger-ui.html> (auth),
<http://localhost:8082/swagger-ui.html> (course),
<http://localhost:8083/swagger-ui.html> (enrollment),
<http://localhost:8084/swagger-ui.html> (notification): gateway пока не проксирует документацию.
Web-интерфейс — <http://localhost:8088>, его health — <http://localhost:8088/healthz>.

Остановка и полный сброс данных:

```bash
cd infra
docker compose down       # остановить
docker compose down -v    # удалить тома (базы и ключи JWT пересоздадутся)
```

## Структура репозитория

```
lms/
├── pom.xml                              # parent POM: версии, BOM-ы, плагины
├── libs/
│   ├── common-events/                   # контракты событий: EventTopics, DomainEvent
│   ├── common-security/                 # Resource Server autoconfiguration, роли из JWT
│   └── common-web/                      # GlobalExceptionHandler → ProblemDetail
├── services/
│   ├── auth-service/                    # регистрация, логин, JWT RS256, refresh, роли
│   ├── course-service/                  # курсы, модули, уроки, публикация, счётчик
│   ├── enrollment-service/              # запись, прогресс уроков, снапшот курса
│   ├── notification-service/            # in-app уведомления по событиям
│   └── gateway-service/                 # единая точка входа, маршрутизация, проверка JWT, CORS
├── web/                                 # SPA: ES-модули, без сборки и зависимостей
│   ├── index.html
│   ├── css/app.css
│   ├── js/                              # core/ (сессия, роутер), api/, ui/, views/
│   ├── nginx.conf                       # статика + прокси /api на gateway
│   ├── scripts/dev-server.js            # локальная разработка без Docker
│   └── test/                            # unit-тесты, browser-smoke, ui-e2e (CDP)
├── scripts/
│   ├── demo-stage-1.sh                  # сквозной сценарий этапа 1 (bash)
│   ├── demo-stage-1.ps1                 # то же для Windows (PowerShell)
│   ├── demo-stage-2.sh                  # запись, события, падение RabbitMQ (bash)
│   ├── demo-stage-2.ps1                 # то же для Windows (PowerShell)
│   ├── smoke-web.sh                     # проверка UI и прокси (bash)
│   └── smoke-web.ps1                    # то же для Windows (PowerShell)
├── docs/
│   ├── UI.md                            # архитектура и ограничения web-интерфейса
│   ├── STAGE-2-PLAN.md                  # план этапа 2 (живой чек-лист)
│   └── TROUBLESHOOTING.md               # ошибки, решения и грабли прошлых итераций
├── infra/
│   ├── Dockerfile                       # multi-stage, параметризован --build-arg SERVICE
│   ├── Dockerfile.web                   # nginx + статика SPA
│   ├── docker-compose.yml               # postgres, rabbitmq, auth, course, enrollment, notification, gateway, web
│   ├── .env.example                     # шаблон локальных секретов
│   └── postgres/init/01-databases.sql   # 6 баз
└── .github/workflows/build.yml          # CI: mvn -B verify + проверки web
```

Внутри каждого сервиса используется классический **MVC с трёхслойной архитектурой**:
`controller/` (HTTP-адаптеры), `service/` (бизнес-логика и транзакции),
`repository/` (доступ к данным), `model/` (JPA-сущности и доменные объекты),
`dto/` (контракты API). Инфраструктурный модуль `outbox/` для транзакционных
событий выделен в отдельный пакет. Подробные правила —
[Architecture_Vision.md](Architecture_Vision.md) §5, §10.

Внутри `web/` — та же идея разделения: `core/` (инфраструктура), `api/` (сервисы),
`ui/` (компоненты), `views/` (экраны); подробности — [docs/UI.md](docs/UI.md).

## Этап 0 — фундамент (готово)

Parent POM (Boot 3.4.4 / Cloud 2024.0.0 BOM, Java 21, enforcer), общие библиотеки
`common-events` / `common-security` / `common-web`, multi-stage Dockerfile, compose
с PostgreSQL и RabbitMQ, 6 баз в `01-databases.sql`, CI `mvn -B verify`.

## Этап 1 — ядро MVP (готово)

### Сервисы

| Сервис | Порт (host → контейнер) | Ответственность | БД |
| :--- | :--- | :--- | :--- |
| `gateway-service` | 8080 → 8080 | маршруты `/api/auth/**`, `/api/courses/**`, `/api/modules/**`, `/api/lessons/**`; валидация JWT; `X-User-Id` / `X-User-Roles` | — |
| `auth-service` | 8081 → 8080 | регистрация, логин, JWT RS256, refresh-ротация, logout, роли, JWK | `auth_db` |
| `course-service` | 8082 → 8080 | CRUD курсов, модулей, уроков; publish/unpublish | `course_db` |

> Порты 8081 и 8082 опубликованы **временно**, для отладки и проверки health напрямую.
> После доработок наружу останется только `gateway:8080` (схема из §3 документа):
> сервисы будут доступны только внутри сети `lms-net`.

### API

**auth-service**

| Метод | Путь | Доступ | Назначение |
| :--- | :--- | :--- | :--- |
| POST | `/api/auth/register` | публичный | регистрация; роль всегда `STUDENT` |
| POST | `/api/auth/login` | публичный | access + refresh токены |
| POST | `/api/auth/refresh` | публичный (по refresh-токену) | ротация пары токенов |
| POST | `/api/auth/logout` | JWT | отзыв refresh-токена |
| GET | `/api/auth/me` | JWT | профиль текущего пользователя |
| PATCH | `/api/auth/users/{userId}/role` | `ADMIN` | выдача `STUDENT`/`INSTRUCTOR`/`ADMIN` |
| GET | `/api/auth/.well-known/jwks.json` | публичный | публичные ключи для проверки JWT |

**course-service**

| Метод | Путь | Доступ | Назначение |
| :--- | :--- | :--- | :--- |
| GET | `/api/courses?published=` | JWT | список курсов |
| GET | `/api/courses/{id}` | JWT | курс с модулями и уроками |
| POST | `/api/courses` | `INSTRUCTOR`/`ADMIN` | создание курса |
| PUT / DELETE | `/api/courses/{id}` | владелец или `ADMIN` | изменение/удаление (каскадом) |
| POST | `/api/courses/{id}/publish`, `/unpublish` | владелец или `ADMIN` | публикация |
| POST | `/api/courses/{id}/modules` | владелец или `ADMIN` | добавление модуля |
| PUT / DELETE | `/api/modules/{id}` | владелец или `ADMIN` | изменение/удаление модуля |
| POST | `/api/modules/{id}/lessons` | владелец или `ADMIN` | добавление урока |
| PUT / DELETE | `/api/lessons/{id}` | владелец или `ADMIN` | изменение/удаление урока |

Ошибки — RFC 9457 `application/problem+json` (`title`, `status`, `detail`, при валидации —
`errors`): 400, 401, 403, 404, 409.

### Аутентификация

- Access-токен — JWT **RS256**, TTL **15 минут**, claims: `sub` (userId), `roles`, `email`,
  `iss=lms-auth`. Документация — Swagger UI (`/swagger-ui.html`) и `/v3/api-docs` у auth и course.
- Refresh-токен — непрозрачная строка, TTL **7 дней**; в `refresh_tokens` хранится только
  SHA-256. При `/refresh` — ротация: старый отзывается, выдаётся новый. Повторное
  предъявление отозванного токена гасит все активные сессии пользователя.
- **Defense in depth:** JWT проверяют и gateway, и каждый сервис (через JWK-endpoint
  auth-service). `X-User-*` от клиента вырезаются на gateway; сервисы авторизуют по JWT.
- Ключи RS256 генерируются auth-service при первом старте в `keys/` (в compose — том
  `lms-auth-keys`, монтируется в `/app/keys`), приватный ключ в репозиторий не попадает.

### Демо-учётки

| Роль | Email | Пароль |
| :--- | :--- | :--- |
| ADMIN | `admin@lms.local` | `Admin123!` |

Создаётся Flyway-миграцией `V2__seed_admin.sql` — **только для локальной среды**.
Остальные пользователи регистрируются со ролью `STUDENT`; инструктор получается через
`PATCH /api/auth/users/{id}/role` под админом (после смены роли нужно перелогиниться).

### Миграции

Flyway применяется автоматически при старте: `auth_db` — `users`, `refresh_tokens`;
`course_db` — `courses`, `modules`, `lessons` (каскадное удаление). JPA работает
в режиме `ddl-auto=validate`: схему описывает только Flyway.

### Тесты

- unit: каталог событий и конверт, `OutboxRelay`, конвертер ролей, обработчик ошибок,
  RSA-ключи, фильтр заголовков, CORS-политика gateway;
- интеграционные (Testcontainers, PostgreSQL 17 + RabbitMQ 4):
  `AuthIT` — регистрация/логин/refresh, роли, JWK, outbox и публикация `user.registered`;
  `CourseIT` — владение курсом, CRUD, публикация, счётчик `enrolledCount`, идемпотентность;
  `EnrollmentIT` — снапшот из `course.published`, запись/отмена/прогресс, outbox;
  `NotificationIT` — три типа событий, дедупликация;
  `GatewayIT` — правила доступа, проброс `X-User-*`, CORS, новые маршруты;
- web (Node 20+, без зависимостей): 78 unit-тестов (`web/test/run.js`).

Интеграционные тесты входят в `mvn verify` и требуют запущенного Docker. Они выполняются
тем же Surefire (классы `*IT.java` в фазе `test`): Failsafe 3.5.2 на этой связке ломает
обработку мета-аннотаций `@SpringBootTest`, поэтому от него отказались осознанно.

## Web-интерфейс (готово, этапы 1–2)

SPA на нативных ES-модулях: без сборки, без npm-зависимостей и без CDN. Отдельный образ
`lms-web` (nginx) отдаёт статику и проксирует `/api` на gateway, поэтому браузер работает
с одним origin — основной сценарий не зависит от CORS. Открыть: <http://localhost:8088>.

| Экран | Маршрут | Что делает |
| :--- | :--- | :--- |
| Вход / Регистрация | `#/login`, `#/register` | логин, регистрация с автоматическим входом |
| Каталог | `#/catalog` | список курсов, поиск, фильтр по публикации, создание курса |
| Курс | `#/courses/:id` | модули и уроки; правка, публикация, удаление для владельца/ADMIN; кнопка «Записаться» и отметки уроков для студента |
| Мои курсы | `#/my-courses` | записи студента и прогресс по урокам, отмена записи |
| Уведомления | `#/notifications` | свои события (регистрация, запись, уроки); колокольчик в шапке считает «новые» |
| Профиль | `#/profile` | профиль, TTL access-токена, роли, админ-панель смены роли, настройки API |

Ключевые решения:

- **Сессия.** Access + refresh в `localStorage`, проактивное обновление до истечения,
  refresh **single-flight** (параллельные запросы не «гасят» сессию), синхронизация вкладок
  через Web Locks и событие `storage`. 401 → один refresh и повтор запроса; неудача → вход.
- **Ошибки.** `application/problem+json` раскладывается по полям формы и в человеческие
  сообщения; 403/404/409/5xx и сетевые сбои объясняются отдельно.
- **Права.** UI скрывает недоступные действия по ролям и владению курсом, но полагается на
  бэкенд: скрытая кнопка — удобство, а не защита.
- **Безопасность.** Нет `innerHTML` (пользовательский текст — только `textContent`),
  подпись JWT на клиенте не проверяется, CORS на gateway — по списку origin.
- **Совместимость.** Хеш-роутинг: статике не нужен rewrite, UI открывается и из nginx,
  и из простого статического сервера.

Разработка без Docker: `node web/scripts/dev-server.js` → <http://localhost:5500>
(статика + прокси `/api`). Проверки: `node web/test/run.js` (unit),
`node web/test/ui-e2e.mjs` (62 проверки в headless Chrome по CDP — логин, курс, модуль,
урок, публикация, затем запись студента, отметка урока, «Мои курсы», уведомления
и удаление курса администратором).

Полное описание структуры, контрактов и ограничений — [docs/UI.md](docs/UI.md).

## Этап 2 — обучение и события (готово)

### Сервисы

| Сервис | Порт (host) | Ответственность | БД |
| :--- | :--- | :--- | :--- |
| `enrollment-service` | 8083 | запись на курс, отмена, прогресс уроков, снапшот курса | `enrollment_db` |
| `notification-service` | 8084 | in-app уведомления по событиям + `log.info` | `notification_db` |
| `course-service` | 8082 | + `enrolledCount`, публикация `course.published/updated` | `course_db` |
| `auth-service` | 8081 | + публикация `user.registered` через outbox | `auth_db` |

### API

| Метод | Путь | Доступ | Назначение |
| :--- | :--- | :--- | :--- |
| POST | `/api/enrollments` | `STUDENT` | запись на опубликованный курс |
| GET | `/api/enrollments` | JWT | мои записи с прогрессом |
| GET | `/api/enrollments/{id}` | владелец | запись + прогресс |
| POST | `/api/enrollments/{id}/cancel` | владелец | отмена (событие `enrollment.cancelled`) |
| POST | `/api/enrollments/{id}/lessons/{lessonId}/complete` | владелец | отметка урока (событие `lesson.completed`) |
| GET | `/api/notifications` | JWT | мои уведомления (до 100, свежие первыми) |

`CourseSummaryResponse`/`CourseDetailResponse` теперь содержат `enrolledCount`;
`GET /api/courses?published=true` работает как раньше.

### События и надёжность

Формат сообщения — конверт `{eventId, type, version, occurredAt, payload}`; `type`
совпадает с routing key. Топология объявляется библиотекой `common-events`:

| Exchange / routing key | Очереди | Consumer |
| :--- | :--- | :--- |
| `user.events` / `user.registered` | `q.notification.user-registered` | notification |
| `course.events` / `course.published` | `q.enrollment.course-published` | enrollment |
| `course.events` / `course.updated` | `q.enrollment.course-updated` | enrollment |
| `enrollment.events` / `enrollment.created` | `q.course.enrollment-created`, `q.notification.enrollment-created` | course, notification |
| `enrollment.events` / `enrollment.cancelled` | `q.course.enrollment-cancelled` | course |
| `enrollment.events` / `lesson.completed` | `q.notification.lesson-completed` | notification |

- **Transactional outbox** у auth, course и enrollment: событие пишется в той же транзакции,
  что и бизнес-изменение; `OutboxRelay` публикует по `@Scheduled` c `FOR UPDATE SKIP LOCKED`.
- **Идемпотентность** консьюмеров: `processed_events(event_id)` в одной транзакции
  с изменением; повторная доставка не создаёт дубль.
- **Ретраи и DLQ:** 3 попытки с backoff, затем `<queue>.dlq` через `lms.dlx`.
- Гарантия — at-least-once; консьюмеры обязаны дедуплицировать (и делают это).

### Демо

`scripts/demo-stage-2.*` поднимают пользователей, публикуют курс, записывают студента,
проверяют `enrolledCount` и уведомления, затем **останавливают RabbitMQ**, создают новую
запись (событие остаётся в outbox), поднимают брокер и проверяют, что счётчик догнал
значение, а outbox опустел.

## Проблемы и решения

Ошибки, с которыми уже столкнулись (окружение, Spring Security, тесты, Docker,
скрипты, nginx и браузер), и способы их предотвращения собраны в
[`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md). Перед началом следующего этапа
полезно просмотреть раздел 0 «Чек-лист» и раздел 8 «Правила проекта».

## Инфраструктура

| Сервис | Порт(ы) | Учётные данные по умолчанию |
| :--- | :--- | :--- |
| PostgreSQL 17 | 5432 | `lms` / `lms_password` |
| RabbitMQ 4 | 5672 (AMQP), 15672 (management UI) | `lms` / `lms_password` |
| Web UI (nginx) | 8088 → 80 | — |

Базы: `auth_db`, `course_db`, `enrollment_db`, `assessment_db`, `media_db`, `notification_db`.
Локально — один инстанс PostgreSQL на все базы; в проде — отдельный инстанс на сервис.

Секреты в репозиторий не попадают: `infra/.env` и `keys/` в `.gitignore`,
шаблон — `infra/.env.example`.

## Дальше по roadmap

Этап 3 — оценивание: `assessment-service` (тесты и задания), автопроверка, ручная
проверка заданий, `assessment.submitted/graded`, обновление прогресса в enrollment.
План и статусы — [docs/STAGE-2-PLAN.md](docs/STAGE-2-PLAN.md) (этап 2) и
[Architecture_Vision.md](Architecture_Vision.md) §12 (этап 3).
В UI этап 3 ляжет поверх уже готового каркаса записей: прогресс
курса и отметки уроков уже есть, останется добавить результаты оценивания.
