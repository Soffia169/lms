# Ошибки, решения и грабли

> Актуально после **этапа 1**. Документ живой: после каждого этапа дополняется.
> Формат записи: **симптом → причина → решение → как не допустить**.
> Окружение, в котором всё это встретилось: Windows 11, JDK 21.0.9,
> Maven 3.9.16, Spring Boot 3.4.4, Spring Security 6.4.4,
> Testcontainers 1.20.6, Docker Desktop 4.95 (Engine 29.8.2).

Разделы помечены:
- **[проект]** — актуально везде, соблюдать всегда;
- **[окружение]** — специфика Windows / Docker Desktop / песочницы агента,
  на чистой машине может не воспроизводиться.

---

## 0. Чек-лист перед первой сборкой

```powershell
# 1. JDK 21 виден Maven (иначе Maven может молча ничего не сделать)
java -version
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\jdk-21"

# 2. Docker Desktop запущен
docker info

# 3. Testcontainers на Windows не читает docker context — задаём endpoint
$env:DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine'

# 4. Только после этого
mvn -T1C clean verify

# 5. Web-интерфейс (без Docker и без зависимостей, нужен Node 20+)
node web/test/run.js
node web/test/ui-e2e.mjs --base-url http://localhost:8088   # нужен запущенный стек и Chrome
```

Ожидаемый результат этапа 1: `BUILD SUCCESS`, 55 тестов (52 + 3 теста CORS),
~40–60 секунд (первый запуск дольше — скачиваются зависимости и образы).
Для `web/`: 78 unit-тестов, 62 проверки `ui-e2e.mjs` и 36 проверок `smoke-web.*`
(после этапа 2; на эталоне этапа 1 было 63/40/26).

---

## 1. Окружение и сборка

### 1.1. Maven завершается с кодом 0 и вообще без вывода [окружение]

**Симптом**

```
> mvn -v
(пусто)
EXIT=0
```

То же поведение у `mvn validate`: ни `BUILD SUCCESS`, ни ошибки.

**Причина.** В Windows прописан сломанный Oracle-javapath: `java.exe`
падает с `0xC0000409` (в PowerShell видно `exit=-1073740791`). Maven
подхватывает этот `java` из PATH и не может стартовать, но код возврата
теряется.

**Решение**

```powershell
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\jdk-21"   # путь к рабочему JDK 21
mvn -v                                             # должно быть "Java version: 21.x"
```

**Как не допустить**

- В документе/README всегда первым шагом указывать `JAVA_HOME`.
- В POM стоит `maven-enforcer-plugin` с `requireJavaVersion [21,)` — он ловит
  неправильную версию, но **не** спасает от полностью нерабочего `java`.
- Признак проблемы в агенте: фоновая сборка «завершилась успешно» за 0 секунд
  и без единой строки лога — это не успех, а отсутствие запуска.

---

### 1.2. Maven не может писать в `~/.m2` (песочница) [окружение]

**Симптом**

```
[ERROR] java.nio.file.AccessDeniedException:
  C:\Users\<user>\.m2\repository\org\apache\maven\plugins\resolver-status.properties
```

**Причина.** Агент работает в режиме `workspace-write`: файловая система вне
рабочего каталога доступна только на чтение, а Maven пишет в `~/.m2`.

**Решение (для проверки в агенте)**

```powershell
# однократно копируем кэш в разрешённую область и указываем его Maven
robocopy "$env:USERPROFILE\.m2\repository" "$env:TEMP\lms-m2\repository" /E
mvn -T1C clean verify "-Dmaven.repo.local=$env:TEMP\lms-m2\repository"
```

Либо запускать сборку с расширенными правами (danger-full-access), тогда
используется обычный `~/.m2`.

**Как не допустить.** Не менять глобальный `settings.xml` и не пытаться
«починить» права на `~/.m2` под песочницей — это ожидаемое ограничение.
В обычном терминале разработчика проблема не возникает.

---

### 1.3. `curl`/`Invoke-WebRequest` не работают, а Maven качает зависимости [окружение]

**Симптом**

```
curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS
```
при этом `java`-клиент и Maven спокойно ходят в Maven Central.

**Причина.** TLS-стек Schannel (curl/Invoke-WebRequest) под песочницей не
получает клиентские учётные данные; Java использует собственный truststore.

**Решение.** Проверять сеть через Java/Maven, а не через `curl`:

```powershell
mvn -B dependency:get "-Dartifact=org.springframework.amqp:spring-rabbit:3.4.0"
```

**Как не допустить.** Не делать вывод «интернета нет» по ошибке `curl` —
сначала проверить `mvn`/`java`. Для локальных HTTP-проверок `curl.exe` к
`localhost` работает нормально.

---

### 1.4. `-pl services/<service>` без `-am` падает с DependencyResolutionException [проект]

**Симптом**

```
[ERROR] Failed to execute goal ... dependency:build-classpath ...:
        Could not resolve dependencies ... com.lms:common-web:0.1.0-SNAPSHOT
```

**Причина.** Модули `libs/common-*` собраны, но не установлены в локальный
репозиторий (`mvn verify` не делает `install`), а `-pl` без `-am` их не собирает.

**Решение**

```powershell
mvn -pl services/auth-service -am verify   # -am собирает и зависимости reactor'а
# либо один раз: mvn install
```

**Как не допустить.** Всегда `-pl ... -am` для точечной сборки сервиса.

---

### 1.5. `-Dtest=...` роняет сборку в вышестоящих модулях [проект]

**Симптом**

```
[ERROR] Failed to execute goal ... surefire ... on project common-security:
        No tests matching pattern "AuthIT" were executed!
```

**Причина.** Фильтр `-Dtest` применяется ко всем модулям reactor'а, включая
`libs/*`, где таких тестов нет.

**Решение**

```powershell
mvn -pl services/auth-service -am test "-Dtest=AuthIT" "-Dsurefire.failIfNoSpecifiedTests=false"
```

**Как не допустить.** При точечном прогоне тестов всегда добавлять
`-Dsurefire.failIfNoSpecifiedTests=false`.

---

### 1.6. `ReplaceFileW EIO (Win32 1175)` при редактировании файла [окружение]

**Симптом.** Инструмент редактирования падает с
`Error: ReplaceFileW EIO (Win32 1175)`, файл остаётся в прежнем состоянии.

**Причина.** Проект лежит в OneDrive; синхронизация/антивирус кратковременно
держат файл.

**Решение.** Повторить ту же правку (она идемпотентна) и **проверить содержимое
файла после записи** — операция могла не примениться.

**Как не допустить.** Не считать команду успешной без проверки; после серии
правок читать ключевые файлы (`pom.xml`) и/или прогонять сборку.

---

## 2. Spring Security и автоконфигурация

### 2.1. `SpringBootWebSecurityConfiguration is not public` [проект]

**Симптом**

```
[ERROR] ...CommonSecurityAutoConfiguration.java:[8,63]
org.springframework.boot.autoconfigure.security.servlet.SpringBootWebSecurityConfiguration
is not public ... cannot be accessed from outside package
```

**Причина.** В Boot 3.4 этот класс package-private, его нельзя указать в
`@AutoConfiguration(before = ...)`.

**Решение.** Порядок задаётся по имени класса:

```java
@AutoConfiguration(beforeName =
        "org.springframework.boot.autoconfigure.security.servlet.SpringBootWebSecurityConfiguration")
```

**Как не допустить.** Для Boot-овских классов, которые могут быть
package-private, использовать `beforeName`/`afterName`, а не `before`/`after`.

---

### 2.2. Boot объявляет свою JWT-цепочку, и наша отключается → CSRF, сессии, 401/403 [проект]

**Симптом.** Публичные endpoint-ы (`POST /api/auth/register`,
`GET /api/auth/.well-known/jwks.json`) отвечают `403`/`401`.
В MockMvc видно `Session Attrs = CSRF_TOKEN`, `SPRING_SECURITY_SAVED_REQUEST`,
а в логах «чистой» цепочки нет.

Отчёт условий (`-Ddebug=true`) показывает:

```
OAuth2ResourceServerJwtConfiguration.OAuth2SecurityFilterChainConfiguration#jwtSecurityFilterChain matched
CommonSecurityAutoConfiguration#lmsSecurityFilterChain:
    @ConditionalOnMissingBean ... found beans of type 'SecurityFilterChain' jwtSecurityFilterChain
```

**Причина.** Если в контексте есть `JwtDecoder`, Boot сам создаёт
`jwtSecurityFilterChain` (обёртка `@ConditionalOnDefaultWebSecurity`). Наша
автоконфигурация объявлялась **после** неё, условие
`@ConditionalOnMissingBean(SecurityFilterChain.class)` не выполнялось, и
применялась Boot-овская цепочка с CSRF и сессиями.

**Решение.** Объявлять свою цепочку раньше Boot-овских:

```java
@AutoConfiguration(beforeName = {
        "org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerJwtConfiguration",
        "org.springframework.boot.autoconfigure.security.servlet.SpringBootWebSecurityConfiguration"
})
```

**Как не допустить.**
- После изменения security-автоконфигурации проверять отчёт условий
  (`-Ddebug=true`, искать `SecurityFilterChain`).
- Держать тест, который бьёт в публичный endpoint без токена
  (у нас — `AuthIT.jwksIsPublicAndContainsOnlyPublicKey`).

---

### 2.3. Валидация DTO возвращает локализованный текст [проект]

**Симптом**

```
expected: "must not be blank"
but was:  "не должно быть пустым"
```

**Причина.** Сообщения Hibernate Validator зависят от локали JVM (ru_RU), а тест
сравнивал точный текст.

**Решение.** Проверять статус/наличие ключа, а не текст:

```java
assertThat(problem.getStatus()).isEqualTo(400);
assertThat(errorsOf(problem)).containsKey("title");
```

**Как не допустить.** В тестах не фиксировать локализованные строки; для
сообщений об ошибках проверять структуру (`status`, `title`, ключи `errors`).

---

## 3. Тесты

### 3.1. Failsafe + `@SpringBootTest` = `Failed to find merged annotation` [проект/окружение]

**Симптом**

```
java.lang.IllegalStateException: Failed to find merged annotation for
@org.springframework.test.context.BootstrapWith(
    org.springframework.boot.test.context.SpringBootTestContextBootstrapper.class)
    at org.springframework.test.context.TestContextAnnotationUtils$AnnotationDescriptor
```

Причём **тот же класс** под Surefire проходит. Воспроизводится и при
`forkCount=0`, и на одном `failsafe:integration-test`.

**Причина.** Несовместимость `maven-failsafe-plugin:3.5.2` с обработкой
мета-аннотаций Spring Test на этой связке версий (Boot 3.4.4 / JDK 21).
Spring не может «слить» `@BootstrapWith` из `@SpringBootTest` до создания
контекста.

**Решение (принято в проекте).** Запускать `*IT` тем же Surefire:

```xml
<plugin>
    <artifactId>maven-surefire-plugin</artifactId>
    <configuration>
        <includes>
            <include>**/*Test.java</include>
            <include>**/*Tests.java</include>
            <include>**/*IT.java</include>
        </includes>
    </configuration>
</plugin>
```

**Как не допустить.** Не добавлять Failsafe обратно, пока версии не изменятся.
Проверка: `mvn verify` должен показывать `Tests run: N` для `*IT` классов.

---

### 3.2. Testcontainers не находит Docker на Windows [окружение]

**Симптом**

```
Could not find a valid Docker environment. Please check configuration.
    NpipeSocketClientProviderStrategy: failed with exception BadRequestException ...
ContainerFetchException: Can't get Docker image: ... postgres:17-alpine
```

**Причина.** Testcontainers 1.20.x не читает docker-context (`desktop-linux`)
и смотрит на pipe по умолчанию.

**Решение**

```powershell
$env:DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine'
```

В CI (Linux, unix-socket) ничего задавать не нужно.

**Как не допустить.** Добавить `DOCKER_HOST` в инструкцию по запуску тестов
(есть в [README](../README.md) и в разделе 0 этого файла).

---

### 3.3. Testcontainers 1.20.6 откатывается на Docker API 1.32 → `400 Bad Request` [проект]

**Симптом**

```
Connected to docker: Server Version 29.8.2, API Version 1.56   (после фикса)
...
BadRequestException (Status 400: {"ID":"","Containers":0,...,"ServerVersion":""})
NpipeSocketClientProviderStrategy: failed with exception BadRequestException (Status 400 ...)
```

**Причина.** Если версия API не задана явно, Testcontainers 1.20.x
принудительно выбирает `VERSION_1_32`. Docker Engine 29 принимает минимум 1.40
и отвечает `400` с пустым `info` (проверено вручную через pipe:
`GET /v1.32/info` → 400, `GET /v1.44/info` → 200).

**Решение.** Передать версию API в docker-java как system property:

```xml
<properties>
    <docker.api.version>1.44</docker.api.version>
</properties>
...
<plugin>
    <artifactId>maven-surefire-plugin</artifactId>
    <configuration>
        <systemPropertyVariables>
            <api.version>${docker.api.version}</api.version>
        </systemPropertyVariables>
    </configuration>
</plugin>
```

**Как не допустить.** При обновлении Docker Engine или Testcontainers —
перепроверить: при апгрейде Testcontainers до версии, умеющей согласовывать
API, костыль можно убрать.

---

### 3.4. Mockito не может self-attach (песочница) [окружение]

**Симптом**

```
MockitoInitializationException:
Could not initialize inline Byte Buddy mock maker.
Could not self-attach to current VM using external process
```

**Причина.** Инлайн-мокмейкер Mockito подключает java-agent отдельным процессом,
а песочница не даёт запускать процессы/писать вне workspace. Причём Boot's
`MockitoTestExecutionListener` инициализирует Mockito **для любого**
`@SpringBootTest`, даже если моки не используются.

**Решение.**
- В тестах **не использовать моки**: реальные объекты, реальный валидатор,
  тестовые конфигурации Spring (`@TestConfiguration`) вместо `@MockBean`.
- Для запуска тестов в агенте — полный доступ (danger-full-access), тогда
  Mockito attach работает.

**Как не допустить.** Правило проекта: **Mockito не используем**. Если нужен
стаб — `@TestConfiguration` + бин, как в
[TestJwtConfiguration](../services/course-service/src/test/java/com/lms/course/TestJwtConfiguration.java).

---

### 3.5. `MockMvc` + `@RequestBody String` не даёт ошибку парсинга [проект]

**Симптом.** Тест «нечитаемое тело → 400» получает `200`.

**Причина.** Для `String` Spring выбирает `StringHttpMessageConverter` и не
парсит JSON — исключения `HttpMessageNotReadableException` не возникает.

**Решение.** Принимать JSON-тип (`Map`/DTO):

```java
@PostMapping("/things")
void create(@RequestBody Map<String, Object> body) { }
```

**Как не допустить.** В тестах ошибок сериализации использовать реальный
DTO/`Map`, а не `String`.

---

### 3.6. Неоднозначный конструктор `HttpMessageNotReadableException` [проект]

**Симптом**

```
reference to HttpMessageNotReadableException is ambiguous
  both (String, Throwable) and (String, HttpInputMessage) match
```

**Причина.** При вызове `new HttpMessageNotReadableException("msg", null)`
компилятор не может выбрать перегрузку.

**Решение.** Передать явный второй аргумент:

```java
new HttpMessageNotReadableException("malformed", new MockHttpInputMessage(new byte[0]));
```

**Как не допустить.** Не передавать `null` в перегруженные конструкторы —
использовать конкретный тип.

---

### 3.7. `@SpringBootTest` не находит конфигурацию [проект]

**Симптом**

```
IllegalStateException: Unable to find a @SpringBootConfiguration by searching
packages upwards from the test.
```

**Причина.** Поиск класса приложения по пакетам ненадёжен (в связке с
Failsafe — часть проблемы из п. 3.1).

**Решение.** Указывать класс явно:

```java
@SpringBootTest(classes = AuthServiceApplication.class)
```

**Как не допустить.** Во всех IT явно задавать `classes = ...Application.class`
(по одному на сервис).

---

### 3.8. `HttpServer.bindNow()` возвращает `DisposableServer` [проект]

**Симптом**

```
incompatible types: reactor.netty.DisposableServer cannot be converted to
reactor.netty.http.server.HttpServer
symbol: method address()
```

**Причина.** `bindNow()` возвращает `DisposableServer`, а не билдер.

**Решение**

```java
private static final DisposableServer UPSTREAM = HttpServer.create()...bindNow();
private static final int PORT = UPSTREAM.port();   // не address().getPort()
```

**Как не допустить.** Для тестовых заглушек апстрима хранить `DisposableServer`
и брать `port()`.

---

### 3.9. Generic-ошибка при конвертации ролей [проект]

**Симптом**

```
incompatible types: java.util.List<SimpleGrantedAuthority> cannot be converted to
java.util.Collection<GrantedAuthority>
```

**Причина.** `Stream.map(...).toList()` выводит слишком узкий тип элемента.

**Решение.** Явный type witness у `map`:

```java
.<GrantedAuthority>map(SimpleGrantedAuthority::new).toList()
```

**Как не допустить.** При возврате `Collection<GrantedAuthority>` явно
приводить тип элемента, а не полагаться на inference.

### 3.10. `MessageConverter` не в `org.springframework.amqp.core` [проект]

**Симптом**

```
cannot find symbol: class MessageConverter
location: package org.springframework.amqp.core
```

**Причина.** Интерфейс лежит в другом пакете.

**Решение**

```java
import org.springframework.amqp.support.converter.MessageConverter;
```

**Как не допустить.** Для message-converter'ов смотреть `...amqp.support.converter`.

### 3.11. RabbitMQ в Testcontainers [проект]

**Симптом**

```
ClassNotFoundException: org.testcontainers.containers.RabbitMQContainer
```

**Причина.** Нет артефакта тестовой зависимости.

**Решение**

```xml
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>rabbitmq</artifactId>
    <scope>test</scope>
</dependency>
```

```java
@Container
@ServiceConnection
static RabbitMQContainer rabbitmq = new RabbitMQContainer("rabbitmq:4-management-alpine");
```

**Как не допустить.** `@ServiceConnection` для RabbitMQ сам задаёт
`spring.rabbitmq.*`; отдельные `@DynamicPropertySource` не нужны.

### 3.12. `ShutdownSignalException` в логах тестов — это шум [окружение]

**Симптом.** После завершения интеграционного теста в логах появляются
`ShutdownSignalException`, `EOFException`, `Failed to check/redeclare auto-delete
queue(s)`, ошибки Hikari о разорванном соединении.

**Причина.** Testcontainers останавливает RabbitMQ/PostgreSQL, пока слушатели
и планировщики ещё работают.

**Решение.** Ориентироваться на `Tests run: N, Failures: 0, Errors: 0` и итог
сборки; такие строки — шум завершения.

**Как не допустить.** Не считать их причиной падения и не «чинить» лишними
`await` в teardown.

---

## 4. Docker и compose

### 4.1. Сервис под non-root не может писать в named volume [проект]

**Симптом.** Контейнер `auth-service` стартует и падает:

```
Caused by: java.lang.IllegalStateException: Unable to initialize RSA key pair from /app/keys
Caused by: java.nio.file.AccessDeniedException: keys/jwt-rsa-private.pem
```
`docker compose up` завершается ошибкой `dependency failed to start:
container lms-auth-service-1 is unhealthy`.

**Причина.** Docker создаёт пустой named volume с правами `root:root`, а
приложение запущено пользователем `lms`.

**Решение.** Создать каталог в образе с нужным владельцем **до** монтирования:

```dockerfile
RUN groupadd --system lms \
    && useradd --system --gid lms --home-dir /app lms \
    && mkdir -p /app/keys \
    && chown -R lms:lms /app
```

После правки Dockerfile пересоздать том (иначе старый останется root-овым):

```bash
docker compose down
docker volume rm lms-auth-keys
docker compose up -d --build
```

**Как не допустить.** Для любого каталога, который монтируется томом и пишется
приложением, создавать его в образе и `chown` на non-root пользователя.

---

### 4.2. Healthcheck в JRE-образе: нет `curl`/`wget` [проект]

**Симптом.** Контейнер «unhealthy», хотя приложение живо; в логах healthcheck —
`exec: "curl": executable file not found`.

**Причина.** `eclipse-temurin:21-jre` (Ubuntu) не содержит `curl`/`wget`.

**Решение.** Проверять TCP-порт средствами bash:

```yaml
healthcheck:
  test: ["CMD-SHELL", "bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080'"]
  interval: 10s
  timeout: 3s
  retries: 12
  start_period: 40s
```

**Как не допустить.** Не добавлять в образ утилиты «ради healthcheck»;
использовать `/dev/tcp` (bash есть в Ubuntu-based образах).
`start_period` должен покрывать JVM-старт + Flyway (у нас 40 с).

---

### 4.3. Docker CLI не подключается к daemon под песочницей [окружение]

**Симптом**

```
permission denied while trying to connect to the docker API at
npipe:////./pipe/dockerDesktopLinuxEngine
```

**Причина.** Песочница блокирует именованные каналы Windows.

**Решение.** Запускать docker-команды с расширенными правами (в агенте —
`sandbox_permissions: danger-full-access`) или из обычного терминала.

**Как не допустить.** Не трактовать это как проблему проекта: `docker compose
config` (без daemon) и сборка в обычном терминале работают.

---

### 4.4. `docker compose exec` в скриптах/агенте [проект]

**Рекомендация.** Использовать `-T` (без TTY), иначе вывод psql может
перемешиваться с управляющими последовательностями:

```bash
docker compose exec -T postgres psql -U lms -l
```

---

## 5. Скрипты

### 5.1. Heredoc перекрывает stdin и ломает парсинг JSON [проект]

**Симптом**

```
json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)
```

**Причина.** В bash-функции `json_get` использовался `python - <<'PY' ... PY`:
heredoc подменял stdin, и JSON из `$BODY_FILE` до python не доходил.

**Решение.** Сначала прочитать stdin в переменную и передать её через pipe:

```bash
json_get() {
    local path="$1" input
    input="$(cat)"
    printf '%s' "$input" | python -c '...' "$path"
}
```

**Как не допустить.** В функциях, читающих stdin, не использовать heredoc
на том же stdin — читать `cat` в переменную.

---

### 5.2. Python печатает `True`/`False` вместо `true`/`false` [проект]

**Симптом.** Проверка `[[ "$(json_get '.published')" != "true" ]]` падает,
хотя в JSON `"published":true`.

**Причина.** `print(bool)` в Python даёт `True`, а не JSON-литерал.

**Решение**

```python
print(value if isinstance(value, str) else json.dumps(value))
```

**Как не допустить.** Фолбэк-парсер должен отдавать JSON-скаляры, а не
repr-строки Python.

---

### 5.3. Фолбэк-парсер не понимал индексы `[0]` [проект]

**Симптом.** `json_get '.modules[0].lessons[0].id'` → `KeyError: 'modules[0]'`
(при отсутствии `jq`).

**Решение.** Разбирать `name[0]` на имя и индекс:

```python
name, _, index = part.partition("[")
if name:
    value = value[name]
if index:
    value = value[int(index.rstrip("]"))]
```

**Как не допустить.** Если скрипт полагается на `jq`, поддерживать в фолбэке
те же конструкции путей (или требовать `jq` явно и падать с понятным сообщением).

---

### 5.4. PowerShell 5.1: нет `-SkipHttpErrorCheck` [окружение]

**Симптом.** `Invoke-WebRequest : A parameter cannot be found that matches
parameter name 'SkipHttpErrorCheck'.`

**Причина.** Параметр появился только в PowerShell 7; на машине стоит
Windows PowerShell 5.1.

**Решение.** Ловить HTTP-ошибки вручную:

```powershell
try {
    $r = Invoke-WebRequest @params
    return [pscustomobject]@{ StatusCode = [int]$r.StatusCode; Content = $r.Content }
} catch {
    $resp = $_.Exception.Response
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    return [pscustomobject]@{ StatusCode = [int]$resp.StatusCode; Content = $reader.ReadToEnd() }
}
```

**Как не допустить.** Скрипты в репозитории держать совместимыми с 5.1
(в CI обычно pwsh 7, у разработчика — 5.1).

---

### 5.5. Кириллица в `.ps1` ломает парсинг [окружение]

**Симптом**

```
Unexpected token 'СЂСѓРєС‚СѓСЂРµ РєСѓСЂСЃР°'' in expression or statement.
```

**Причина.** Файл в UTF-8 **без BOM**; Windows PowerShell 5.1 читает его как ANSI
и превращает кириллицу в мусор, ломая кавычки.

**Решение.** Сохранять `.ps1` в UTF-8 **с BOM**:

```powershell
$content = [System.IO.File]::ReadAllText($path)
[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($true)))
```

**Как не допустить.** Все `.ps1` с непро-ASCII текстом — UTF-8 + BOM.
`.sh` — UTF-8 без BOM и LF.

---

### 5.6. Git Bash под песочницей: `couldn't create signal pipe` [окружение]

**Симптом**

```
bash: *** fatal error - couldn't create signal pipe, Win32 error 5
```

**Причина.** Блокировка именованных каналов/процессов песочницей.

**Решение.** Запускать bash-скрипты с полным доступом (или из обычного
терминала). Проверено: сценарий проходит полностью.

---

### 5.7. `pwsh` может отсутствовать [окружение]

**Симптом.** `pwsh : Имя "pwsh" не распознано как имя командлета...`

**Решение.**

```powershell
powershell -File scripts/demo-stage-1.ps1      # Windows PowerShell 5.1
```

Скрипт специально написан совместимым с 5.1.

### 5.8. `Get-Content` показывает кириллицу «кракозябрами» [окружение]

**Симптом.** В консоли Windows PowerShell 5.1 markdown/README выглядит как
`РћС€РёР±РєРё...`, хотя в редакторе и на GitHub текст нормальный.

**Причина.** `Get-Content` в 5.1 читает UTF-8-файл без BOM как ANSI. Сам файл
корректен.

**Решение.**

```powershell
Get-Content README.md -Encoding UTF8
```

**Как не допустить.** Не «чинить» сами файлы и не добавлять BOM в `.md` —
достаточно указать кодировку при чтении.

### 5.9. Bash: прогресс-вывод попадает в `$(...)` и ломает данные [проект]

**Симптом.**

```
curl: (3) bad range in URL position 40
```

В URL оказывается строка вида `http://localhost:8080/api/auth/users/[32m...`

**Причина.** Функции `register`/`login` печатали цветной статус в stdout, а
`ID=$(register ...)` захватывал и его.

**Решение.** Служебный вывод — только в stderr:

```bash
green() { printf '\033[32m%s\033[0m\n' "$*" >&2; }
step()  { printf '\n\033[1m== %s\033[0m\n' "$*" >&2; }
```

stdout функции должен содержать только возвращаемые данные (id, токен).

**Как не допустить.** В скриптах, где значения забираются через `$(...)`,
всё информационное печатать в `>&2`.

### 5.10. PowerShell 5.1: docker пишет в stderr, а `$ErrorActionPreference='Stop'` [проект]

**Симптом.**

```
NativeCommandError ... Container lms-rabbitmq-1 Stopping
EXIT=1
```

Скрипт падает на `docker compose stop`, хотя команда успешна.

**Причина.** В Windows PowerShell 5.1 вывод нативных программ в stderr
превращается в ошибку, а `Stop` делает её завершающей.

**Решение.** Локально ослабить политику вокруг нативного вызова:

```powershell
$previous = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    & docker compose @Arguments 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker compose завершился с кодом $LASTEXITCODE" }
}
finally { $ErrorActionPreference = $previous }
```

**Как не допустить.** Проверять итог по `$LASTEXITCODE`, а не по наличию
stderr-вывода.

---

## 6. Web-интерфейс

### 6.1. `jakarta/servlet/ServletRequest` при создании `CorsConfigurationSource` [проект]

**Симптом.** Gateway не стартует:

```
Error creating bean with name 'corsConfigurationSource' ... : jakarta/servlet/ServletRequest
```

**Причина.** В WebFlux-модуле импортирован **servlet**-вариант
`org.springframework.web.cors.UrlBasedCorsConfigurationSource` (он живёт в spring-webmvc
и тянет `jakarta.servlet`). В gateway сервлет-API нет.

**Решение.** Взять реактивные классы и `.cors(...)` в security-цепочке:

```java
import org.springframework.web.cors.reactive.CorsConfigurationSource;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;
...
http.cors(Customizer.withDefaults())
```

**Как не допустить.** Тест `GatewayIT.corsPreflightFromConfiguredOriginIsAllowedWithoutToken`
поднимает контекст — такой импорт падает сразу, а не на живом стенде.

---

### 6.2. nginx: `host not found in upstream "gateway-service"` [проект]

**Симптом.** Контейнер `web` не стартует, в логах
`nginx: [emerg] host not found in upstream "gateway-service"`.

**Причина.** `proxy_pass http://gateway-service:8080` резолвится **при старте** nginx.
Если gateway ещё не поднялся (или контейнер пересоздали с новым IP), имени нет в DNS.

**Решение.** Резолвить на каждый запрос через Docker DNS:

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;
set $gateway gateway-service:8080;
location /api/ { proxy_pass http://$gateway; }
```

Плюс `depends_on: gateway-service: condition: service_healthy` в compose.

**Как не допустить.** Не задавать статический upstream-хост; healthcheck `web`
проверять через `/healthz` (он же проксируется на actuator gateway).

---

### 6.3. UI открывается, но API отвечает 404 или CORS-ошибкой [проект]

**Симптом.** В консоли браузера `blocked by CORS policy` или `404` на `/api/...`;
в подвале интерфейса «API недоступен».

**Причина.** Статика открыта не тем сервером: `file://`, статический сервер без
прокси, либо origin не разрешён на gateway.

**Решение.**

- Основной путь: открыть <http://localhost:8088> (nginx проксирует `/api`).
- Разработка: `node web/scripts/dev-server.js` → <http://localhost:5500>.
- Статический сервер без прокси: `?api=http://localhost:8080/api` в адресе
  (или «Настройки API») и origin в `LMS_CORS_ALLOWED_ORIGINS`.

**Как не допустить.** Индикатор в подвале и кнопка «Проверить» в настройках API
показывают, куда идёт запрос и отвечает ли адрес.

---

### 6.4. Preflight отвечает `403` для «правильного» origin [проект]

**Симптом.** `OPTIONS /api/courses` → `403`, браузер пишет про CORS. Через `curl`
без заголовка `Origin` тот же запрос работает.

**Причина.** Origin сравнивается полностью (схема + хост + порт). `*` в проекте
сознательно не используется: access-токен живёт на клиенте.

**Решение.** Добавить точный origin в `LMS_CORS_ALLOWED_ORIGINS` и перезапустить gateway:

```powershell
$env:LMS_CORS_ALLOWED_ORIGINS = 'http://localhost:8088,http://localhost:5500'
```

**Как не допустить.** Значение по умолчанию и шаблон — в `infra/.env.example`.

---

### 6.5. PowerShell 5.1: `.Content` — это `byte[]` для JSON actuator [окружение]

**Симптом.** `Cannot convert value "System.Object[]" to type "System.Boolean"`
из `-match`, а вывод выглядит как `123 34 115 116...`.

**Причина.** Для `application/vnd.spring-boot.actuator.v3+json`
`Invoke-WebRequest.Content` в 5.1 возвращает массив байтов, а не строку.

**Решение**

```powershell
$content = $response.Content
if ($content -is [byte[]]) { $content = [System.Text.Encoding]::UTF8.GetString($content) }
```

**Как не допустить.** В скриптах, читающих ответы с нестандартным Content-Type,
всегда нормализовать `Content` в строку (см. `Assert-True`/`Invoke-Http`
в `scripts/smoke-web.ps1`).

---

### 6.6. После правки `.ps1` парсер ругается на «вЂ”» [окружение]

**Симптом.**

```
Unexpected token 'СЂСѓРєС‚СѓСЂРµ' ...
```

**Причина.** Инструмент редактирования перезаписал файл в UTF-8 **без BOM**
(см. 5.5), и Windows PowerShell 5.1 читает кириллицу как ANSI.

**Решение.** Восстановить BOM после правки:

```powershell
$path = 'scripts/smoke-web.ps1'
$content = [System.IO.File]::ReadAllText($path).TrimStart([char]0xFEFF)
[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($true)))
```

**Как не допустить.** Правки `.ps1` заканчивать проверкой первых трёх байт
(`239,187,191`) и запуском скрипта из Windows PowerShell 5.1, а не только из pwsh 7.

---

### 6.7. `node --test` под песочницей: `spawn EPERM` [окружение]

**Симптом.** `Error: spawn EPERM at ChildProcess.spawn` и «0 тестов».

**Причина.** Node test runner запускает каждый файл отдельным процессом, а песочница
блокирует spawn/pipe (та же причина, что и `[exit code: 1]` у Docker).
`node --test test` в обычном терминале работает.

**Решение.** `node web/test/run.js` — раннер импортирует тест-файлы в текущем процессе.
Он же используется в CI, поэтому результат одинаковый везде.

**Как не допустить.** `npm test` в `web/` настроен на `run.js`; не переключать на
`node --test`, пока нужна работа под песочницей.

---

### 6.8. Headless Chrome не стартует под песочницей [окружение]

**Симптом.** Процесс завершается без вывода, в stderr:

```
FATAL:mojo/platform_channel.cc Check failed: ... Отказано в доступе. (0x5)
crashpad_client_win.cc OpenProcess: Отказано в доступе
```

**Причина.** Chromium общается между процессами через именованные каналы Windows,
которые песочница агента блокирует.

**Решение.** Запускать браузерные проверки из обычного терминала (или с полным доступом
в агенте):

```
docker compose up -d --build
node web/test/ui-e2e.mjs --base-url http://localhost:8088
```

**Как не допустить.** `ui-e2e.mjs` — отдельный скрипт, не часть `mvn verify`; при
недоступном Chrome он печатает понятную ошибку, а не «тихий» ноль тестов.

---

### 6.9. После refresh access-токен может быть идентичным [проект]

**Симптом.** Проверка «access-токен изменился после `/refresh`» иногда падает,
хотя refresh успешен и новый токен работает.

**Причина.** JWT RS256 собирается из `sub`, `roles`, `email`, `iat`, `exp` с точностью
до секунды. Если refresh случился в ту же секунду, payload и подпись совпадают
байт-в-байт. Ротируется **refresh-токен**, а не «время выпуска».

**Решение.** Проверять ротацию по `refreshToken` и работоспособность нового access-токена:

```powershell
Assert-True ($rotated.refreshToken -ne $tokens.refreshToken) 'refresh-токен ротирован'
$me = Invoke-Http -Method GET -Path '/api/auth/me' -Token $rotated.accessToken
```

**Как не допустить.** Не сравнивать access-токены на равенство в тестах и скриптах.

---

### 6.10. `document.title` не меняется на заголовок маршрута [проект]

**Симптом.** Вкладка называется «LMS», хотя у маршрута задан `title`.

**Причина.** У `HTMLElement` есть собственное свойство `title` (атрибут). Если
представление вернуло DOM-узел, `result?.title ?? route.title` возвращает пустую
строку, а не fallback: `??` срабатывает только на `null`/`undefined`.

**Решение.** Читать `title` только у объектного контракта `{ el, title }`
(в роутере — проверка `isDomNode`).

**Как не допустить.** Не использовать `??` как «fallback для пустой строки»;
для DOM-узлов `title` — это атрибут.

---

### 6.11. `<dialog>`: подтверждение иногда возвращает `false` [проект]

**Симптом.** `confirmDialog` после нажатия «Подтвердить» иногда резолвится в `false`.

**Причина.** `dialog.close()` вызывает событие `close`, обработчик резолвит промис,
а следом код резолвит его второй раз другим значением (гонка `queueMicrotask`).

**Решение.** Один resolve на диалог + флаг результата:

```js
let confirmed = false;
const { close } = openModal({ onClose: () => resolve(confirmed), ... });
confirmButton.addEventListener('click', () => { confirmed = true; close(); });
```

**Как не допустить.** Промис диалога резолвить в одном месте (в `onClose`),
а выбор пользователя хранить в флаге.

---

## 7. Полезные команды проверки

```powershell
# Сборка + все тесты (unit + Testcontainers)
mvn -T1C clean verify

# Только интеграционные тесты сервиса
mvn -pl services/auth-service -am test "-Dtest=AuthIT" `
    "-Dsurefire.failIfNoSpecifiedTests=false"

# Стек
cd infra
docker compose up -d --build
docker compose ps
docker compose logs --tail 80 auth-service
docker compose exec -T postgres psql -U lms -d auth_db -c "select email, role from users;"

# Сквозной сценарий
bash scripts/demo-stage-1.sh
powershell -File scripts/demo-stage-1.ps1
bash scripts/demo-stage-2.sh
powershell -File scripts/demo-stage-2.ps1

# События: outbox и очереди
docker compose exec -T postgres psql -U lms -d enrollment_db -c "select type, published_at is not null as published from outbox order by id desc limit 10;"
docker compose exec -T rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged

# Web-интерфейс (стек должен быть поднят)
cd web
node test/run.js
node test/ui-e2e.mjs --base-url http://localhost:8088
cd ..
bash scripts/smoke-web.sh
powershell -File scripts/smoke-web.ps1
docker compose -f infra/docker-compose.yml logs --tail 50 web
```

Диагностика Spring:
```powershell
mvn -pl services/auth-service -am test "-Dtest=AuthIT" `
    "-Dsurefire.failIfNoSpecifiedTests=false" '-DargLine=-Ddebug=true'
```
В отчёте условий ищите `SecurityFilterChain` — видно, какая цепочка победила.

---

## 8. Правила, которые уже действуют в проекте

1. **Не используем Mockito** — тестовые стабы через `@TestConfiguration`.
2. **`*IT` запускаются Surefire** (Failsafe не используем, см. 3.1).
3. **`@SpringBootTest(classes = <Service>Application.class)`** — всегда явно.
4. **Своя security-цепочка объявляется через `beforeName`**, а не `after`.
5. **Секреты и ключи — только в томах/окружении**, ни в git, ни в образе.
6. **Flyway — единственный источник схемы**, JPA в режиме `validate`.
7. **Демо-скрипты — bash + PowerShell**, оба должны проходить на поднятом стеке.
8. **После каждого этапа** проверять: `mvn verify` → `docker compose up` →
   демо-скрипт → health/OpenAPI → web-интерфейс (`smoke-web` + `ui-e2e`).
9. **В web-интерфейсе нет `innerHTML`** — только `el()`/`textContent`
   (пользовательский текст никогда не парсится как разметка).
10. **CORS на gateway — точный список origin**, не `*`; токен живёт на клиенте.
11. **nginx проксирует `/api` без переписывания пути** и резолвит gateway через
    Docker DNS (см. 6.2); в образ попадают только `index.html`, `css/`, `js/`.
12. **После правки `.ps1` восстанавливать UTF-8 BOM** (см. 5.5, 6.6).
13. **Тесты web — без зависимостей**: `node web/test/run.js` (in-process) и
    `ui-e2e.mjs` (CDP) вместо npm-пакетов вроде Playwright.
14. **Событие пишется в outbox в той же транзакции**, что и бизнес-изменение;
    outbox-store на `JdbcTemplate` участвует в JPA-транзакции (см. 3.12).
15. **Консьюмеры идемпотентны**: `processed_events(event_id)` в одной транзакции
    с изменением; доставка at-least-once, дубликаты обязательны к обработке.
16. **Событие — это конверт** `{eventId, type, version, occurredAt, payload}`;
    `type` = routing key, exchange выбирается `EventTopics.exchangeFor(type)`.
17. **Очереди не переименовывать без миграции**: имена в `RabbitQueues`,
    DLQ через `lms.dlx`, retry 3 с backoff (см. раздел 6 плана этапа 2).

