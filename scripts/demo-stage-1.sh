#!/usr/bin/env bash
#
# Сквозной сценарий этапа 1:
#   регистрация → логин → 403 у студента → выдача роли INSTRUCTOR админом →
#   создание курса/модуля/урока → публикация → refresh-ротация → logout.
#
# Требования: bash, curl, jq или python3.
# Запуск:  bash scripts/demo-stage-1.sh [BASE_URL]
#          BASE_URL=http://localhost:8080 bash scripts/demo-stage-1.sh
#
set -euo pipefail

BASE_URL="${BASE_URL:-${1:-http://localhost:8080}}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@lms.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123!}"
USER_PASSWORD="${USER_PASSWORD:-Password123!}"
RUN_ID="$(date +%s)"
STUDENT_EMAIL="student-${RUN_ID}@lms.local"

BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }
step()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fail()  { red "FAIL: $*"; printf '%s\n' "$(cat "$BODY_FILE")" >&2; exit 1; }

json_get() { # json_get <path> — JSON на stdin
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

api() { # api <METHOD> <PATH> [TOKEN] [JSON_BODY] → печатает HTTP-код, тело в $BODY_FILE
    local method="$1" path="$2" token="${3:-}" body="${4:-}"
    local args=(-sS -o "$BODY_FILE" -w '%{http_code}' -X "$method" "$BASE_URL$path")
    [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
    [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' -d "$body")
    curl "${args[@]}"
}

expect() { # expect <actual> <expected> <description>
    if [[ "$1" != "$2" ]]; then
        fail "$3: ожидался HTTP $2, получен $1"
    fi
    green "$3 (HTTP $1)"
}

step "Ожидание gateway на $BASE_URL"
ready=0
for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null "$BASE_URL/actuator/health" 2>/dev/null; then
        ready=1
        break
    fi
    sleep 2
done
[[ "$ready" == "1" ]] || { echo "gateway недоступен: $BASE_URL" >&2; exit 1; }
green "gateway доступен"

step "1. Регистрация студента ($STUDENT_EMAIL)"
code=$(api POST /api/auth/register "" "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$USER_PASSWORD\",\"fullName\":\"Demo Student\"}")
expect "$code" "201" "регистрация студента"
STUDENT_ID="$(json_get '.id' < "$BODY_FILE")"

step "2. Логин студента"
code=$(api POST /api/auth/login "" "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$USER_PASSWORD\"}")
expect "$code" "200" "логин студента"
STUDENT_TOKEN="$(json_get '.accessToken' < "$BODY_FILE")"

step "3. Студент пытается создать курс — ожидаем 403"
code=$(api POST /api/courses "$STUDENT_TOKEN" '{"title":"Forbidden course"}')
expect "$code" "403" "студент не может создавать курсы"

step "4. Админ выдаёт студенту роль INSTRUCTOR"
code=$(api POST /api/auth/login "" "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
expect "$code" "200" "логин админа"
ADMIN_TOKEN="$(json_get '.accessToken' < "$BODY_FILE")"

code=$(api PATCH "/api/auth/users/$STUDENT_ID/role" "$ADMIN_TOKEN" '{"role":"INSTRUCTOR"}')
expect "$code" "200" "смена роли на INSTRUCTOR"

step "5. Повторный логин — в токене уже INSTRUCTOR"
code=$(api POST /api/auth/login "" "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$USER_PASSWORD\"}")
expect "$code" "200" "логин инструктора"
INSTRUCTOR_TOKEN="$(json_get '.accessToken' < "$BODY_FILE")"
REFRESH_TOKEN="$(json_get '.refreshToken' < "$BODY_FILE")"

code=$(api GET /api/auth/me "$INSTRUCTOR_TOKEN")
expect "$code" "200" "профиль инструктора"
if [[ "$(json_get '.role' < "$BODY_FILE")" != "INSTRUCTOR" ]]; then
    fail "роль в профиле не INSTRUCTOR"
fi

step "6. Создание курса, модуля и урока"
code=$(api POST /api/courses "$INSTRUCTOR_TOKEN" '{"title":"Java Basics","description":"Demo course"}')
expect "$code" "201" "создание курса"
COURSE_ID="$(json_get '.id' < "$BODY_FILE")"

code=$(api POST "/api/courses/$COURSE_ID/modules" "$INSTRUCTOR_TOKEN" '{"title":"Introduction"}')
expect "$code" "201" "создание модуля"
MODULE_ID="$(json_get '.id' < "$BODY_FILE")"

code=$(api POST "/api/modules/$MODULE_ID/lessons" "$INSTRUCTOR_TOKEN" '{"title":"What is JVM?","content":"JVM runs bytecode"}')
expect "$code" "201" "создание урока"
LESSON_ID="$(json_get '.id' < "$BODY_FILE")"

step "7. Публикация курса"
code=$(api POST "/api/courses/$COURSE_ID/publish" "$INSTRUCTOR_TOKEN")
expect "$code" "200" "публикация курса"
if [[ "$(json_get '.published' < "$BODY_FILE")" != "true" ]]; then
    fail "курс не опубликован"
fi

code=$(api GET "/api/courses/$COURSE_ID" "$INSTRUCTOR_TOKEN")
expect "$code" "200" "чтение курса"
if [[ "$(json_get '.modules[0].lessons[0].id' < "$BODY_FILE")" != "$LESSON_ID" ]]; then
    fail "урок не найден в структуре курса"
fi

step "8. Refresh-ротация"
code=$(api POST /api/auth/refresh "" "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
expect "$code" "200" "обновление токенов"
NEW_REFRESH_TOKEN="$(json_get '.refreshToken' < "$BODY_FILE")"
NEW_ACCESS_TOKEN="$(json_get '.accessToken' < "$BODY_FILE")"

code=$(api GET /api/auth/me "$NEW_ACCESS_TOKEN")
expect "$code" "200" "новый access-токен работает"

code=$(api POST /api/auth/refresh "" "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
expect "$code" "401" "старый refresh-токен отклонён"

step "9. Logout отзывает refresh-токен"
code=$(api POST /api/auth/logout "$NEW_ACCESS_TOKEN" "{\"refreshToken\":\"$NEW_REFRESH_TOKEN\"}")
expect "$code" "204" "logout"

code=$(api POST /api/auth/refresh "" "{\"refreshToken\":\"$NEW_REFRESH_TOKEN\"}")
expect "$code" "401" "refresh после logout отклонён"

step "Итог"
cat <<EOF
Курс:        $COURSE_ID
Модуль:      $MODULE_ID
Урок:        $LESSON_ID
Студент:     $STUDENT_ID
Swagger UI:  http://localhost:8081/swagger-ui.html (auth), http://localhost:8082/swagger-ui.html (course)
EOF
green "Сценарий этапа 1 пройден"
