#!/usr/bin/env bash
#
# Сквозной сценарий этапа 2:
#   публикация курса → снапшот в enrollment → запись студента → счётчик курса →
#   отметка урока → уведомления → остановка RabbitMQ → событие не теряется.
#
# Требования: bash, curl, jq или python, docker compose.
# Запуск: bash scripts/demo-stage-2.sh [BASE_URL]
#
set -euo pipefail

BASE_URL="${BASE_URL:-${1:-http://localhost:8080}}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@lms.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123!}"
USER_PASSWORD="${USER_PASSWORD:-Password123!}"
RUN_ID="$(date +%s)"
STUDENT_A="student-a-${RUN_ID}@lms.local"
STUDENT_B="student-b-${RUN_ID}@lms.local"
INSTRUCTOR_EMAIL="instructor-${RUN_ID}@lms.local"
COMPOSE_DIR="${COMPOSE_DIR:-infra}"

BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

green() { printf '\033[32m%s\033[0m\n' "$*" >&2; }
red()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }
step()  { printf '\n\033[1m== %s\033[0m\n' "$*" >&2; }
fail()  { red "FAIL: $*"; printf '%s\n' "$(cat "$BODY_FILE")" >&2; exit 1; }

json_get() {
    local path="$1" input py
    input="$(cat)"
    if command -v jq >/dev/null 2>&1; then
        printf '%s' "$input" | jq -r "$path"
        return
    fi
    if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys' >/dev/null 2>&1; then
        py=python3
    else
        py=python
    fi
    printf '%s' "$input" | "$py" -c '
import json
import sys

path = sys.argv[1].lstrip(".")
value = json.load(sys.stdin)
for part in path.split("."):
    if not part:
        continue
    name, _, index = part.partition("[")
    if name:
        value = value[name]
    if index:
        value = value[int(index.rstrip("]"))]
print(value if isinstance(value, str) else json.dumps(value))
' "$path"
}

api() {
    local method="$1" path="$2" token="${3:-}" body="${4:-}"
    local args=(-sS -o "$BODY_FILE" -w '%{http_code}' -X "$method" "$BASE_URL$path")
    [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
    [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' -d "$body")
    curl "${args[@]}"
}

expect() {
    if [[ "$1" != "$2" ]]; then
        fail "$3: ожидался HTTP $2, получен $1"
    fi
    green "$3 (HTTP $1)"
}

register() { # register <email> <fullName>
    local code
    code=$(api POST /api/auth/register "" "{\"email\":\"$1\",\"password\":\"$USER_PASSWORD\",\"fullName\":\"$2\"}")
    expect "$code" "201" "регистрация $1"
    json_get '.id' < "$BODY_FILE"
}

login() { # login <email> [password] -> accessToken
    local email="$1" password="${2:-$USER_PASSWORD}" code
    code=$(api POST /api/auth/login "" "{\"email\":\"$email\",\"password\":\"$password\"}")
    expect "$code" "200" "логин $email"
    json_get '.accessToken' < "$BODY_FILE"
}

await_counter() { # await_counter <token> <courseId> <expected>
    local i actual
    for i in $(seq 1 100); do
        api GET "/api/courses/$2" "$1" >/dev/null
        actual=$(json_get '.enrolledCount' < "$BODY_FILE")
        [[ "$actual" == "$3" ]] && return 0
        sleep 0.2
    done
    fail "enrolledCount=$actual, ожидалось $3"
}

await_enrollable() { # await_enrollable <token> <courseId> -> enrollmentId
    local i code
    for i in $(seq 1 100); do
        code=$(api POST /api/enrollments "$1" "{\"courseId\":\"$2\"}")
        if [[ "$code" == "201" ]]; then
            json_get '.id' < "$BODY_FILE"
            return 0
        fi
        [[ "$code" == "409" ]] && fail "студент уже записан"
        sleep 0.2
    done
    fail "курс так и не стал доступен для записи"
}

await_notification_type() { # await_notification_type <token> <type>
    local i
    for i in $(seq 1 100); do
        api GET /api/notifications "$1" >/dev/null
        if grep -q "\"type\":\"$2\"" "$BODY_FILE"; then
            return 0
        fi
        sleep 0.2
    done
    fail "уведомление $2 не появилось"
}

step "Ожидание gateway на $BASE_URL"
for _ in $(seq 1 60); do
    curl -fsS -o /dev/null "$BASE_URL/actuator/health" 2>/dev/null && break
    sleep 2
done
green "gateway доступен"

step "1. Пользователи"
STUDENT_A_ID=$(register "$STUDENT_A" "Student A")
STUDENT_B_ID=$(register "$STUDENT_B" "Student B")
INSTRUCTOR_ID=$(register "$INSTRUCTOR_EMAIL" "Demo Instructor")

ADMIN_TOKEN=$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")
code=$(api PATCH "/api/auth/users/$INSTRUCTOR_ID/role" "$ADMIN_TOKEN" '{"role":"INSTRUCTOR"}')
expect "$code" "200" "выдача роли INSTRUCTOR"

STUDENT_A_TOKEN=$(login "$STUDENT_A")
STUDENT_B_TOKEN=$(login "$STUDENT_B")
INSTRUCTOR_TOKEN=$(login "$INSTRUCTOR_EMAIL")

step "2. Курс, модуль, урок, публикация"
code=$(api POST /api/courses "$INSTRUCTOR_TOKEN" '{"title":"Stage 2 course","description":"Events demo"}')
expect "$code" "201" "создание курса"
COURSE_ID=$(json_get '.id' < "$BODY_FILE")

code=$(api POST "/api/courses/$COURSE_ID/modules" "$INSTRUCTOR_TOKEN" '{"title":"Module 1"}')
expect "$code" "201" "создание модуля"
MODULE_ID=$(json_get '.id' < "$BODY_FILE")

code=$(api POST "/api/modules/$MODULE_ID/lessons" "$INSTRUCTOR_TOKEN" '{"title":"Lesson 1","content":"Content"}')
expect "$code" "201" "создание урока"
LESSON_ID=$(json_get '.id' < "$BODY_FILE")

code=$(api POST "/api/courses/$COURSE_ID/publish" "$INSTRUCTOR_TOKEN")
expect "$code" "200" "публикация курса"

step "3. Запись студента A (ждём снапшот из course.published)"
ENROLLMENT_A=$(await_enrollable "$STUDENT_A_TOKEN" "$COURSE_ID")
green "запись создана: $ENROLLMENT_A"

await_counter "$INSTRUCTOR_TOKEN" "$COURSE_ID" 1
green "счётчик курса: 1"

step "4. Отметка урока и уведомления"
code=$(api POST "/api/enrollments/$ENROLLMENT_A/lessons/$LESSON_ID/complete" "$STUDENT_A_TOKEN")
expect "$code" "200" "урок завершён"

await_notification_type "$STUDENT_A_TOKEN" "ENROLLMENT_CREATED"
await_notification_type "$STUDENT_A_TOKEN" "LESSON_COMPLETED"
green "уведомления созданы"

step "5. Остановка RabbitMQ: событие не теряется"
( cd "$COMPOSE_DIR" && docker compose stop rabbitmq >/dev/null )
green "rabbitmq остановлен"

ENROLLMENT_B=$(await_enrollable "$STUDENT_B_TOKEN" "$COURSE_ID")
green "запись B создана при остановленном брокере: $ENROLLMENT_B"

pending=$(cd "$COMPOSE_DIR" && docker compose exec -T postgres psql -U lms -d enrollment_db -Atc \
    "select count(*) from outbox where published_at is null" | tr -d '[:space:]')
[[ "$pending" -ge 1 ]] || fail "в outbox нет неопубликованных событий"
green "в outbox ожидает событий: $pending"

( cd "$COMPOSE_DIR" && docker compose start rabbitmq >/dev/null )
green "rabbitmq запущен"

await_counter "$INSTRUCTOR_TOKEN" "$COURSE_ID" 2
green "счётчик курса после восстановления: 2"

for i in $(seq 1 100); do
    pending=$(cd "$COMPOSE_DIR" && docker compose exec -T postgres psql -U lms -d enrollment_db -Atc \
        "select count(*) from outbox where published_at is null" | tr -d '[:space:]')
    [[ "$pending" == "0" ]] && break
    sleep 0.5
done
[[ "$pending" == "0" ]] || fail "outbox не опустел после восстановления"
green "outbox пуст — все события опубликованы"

step "Итог"
cat <<EOF
Курс:         $COURSE_ID
Урок:         $LESSON_ID
Запись A:     $ENROLLMENT_A
Запись B:     $ENROLLMENT_B
Студент A:    $STUDENT_A_ID
Студент B:    $STUDENT_B_ID
EOF
green "Сценарий этапа 2 пройден"
