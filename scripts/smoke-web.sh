#!/usr/bin/env bash
#
# Проверка web-интерфейса этапов 1–2 без браузера (аналог smoke-web.ps1):
#   1. nginx отдаёт статику SPA и не отдаёт служебные файлы;
#   2. /api проксируется на gateway (логин, /me, курсы, 401 без токена);
#   3. /healthz отвечает значением из actuator gateway;
#   4. refresh-ротация работает через тот же origin;
#   5. enrollment/notification отвечают через прокси, новые модули статики отдаются.
#
# Запуск (стек уже поднят: cd infra; docker compose up -d --build):
#   bash scripts/smoke-web.sh
#   WEB_BASE_URL=http://localhost:8088 bash scripts/smoke-web.sh
#
set -uo pipefail

BASE_URL="${WEB_BASE_URL:-http://localhost:8088}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@lms.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123!}"

checks=0
failures=0
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

step() { printf '\n== %s\n' "$1"; }

pass() { checks=$((checks + 1)); printf '  PASS  %s%s\n' "$1" "${2:+ — $2}"; }

fail() { checks=$((checks + 1)); failures=$((failures + 1)); printf '  FAIL  %s%s\n' "$1" "${2:+ — $2}"; }

# request METHOD PATH [TOKEN] [JSON_BODY]
# Печатает "STATUS" в stdout, тело складывает в $tmp_dir/body, тип — в $tmp_dir/type.
request() {
    local method="$1" path="$2" token="${3:-}" body="${4:-}"
    local -a args=(-sS -o "$tmp_dir/body" -w '%{http_code}' -D "$tmp_dir/headers" -X "$method" "$BASE_URL$path")
    if [[ -n "$token" ]]; then
        args+=(-H "Authorization: Bearer $token")
    fi
    if [[ -n "$body" ]]; then
        args+=(-H 'Content-Type: application/json' --data "$body")
    fi
    curl "${args[@]}" 2>/dev/null || echo '000'
    grep -i '^content-type:' "$tmp_dir/headers" 2>/dev/null | tail -1 | tr -d '\r' | cut -d' ' -f2- >"$tmp_dir/type" || true
}

body() { cat "$tmp_dir/body" 2>/dev/null; }
content_type() { cat "$tmp_dir/type" 2>/dev/null; }

# Достаёт поле из JSON: jq, если он есть, иначе python3/python.
# Тот же фолбэк, что в demo-stage-1.sh (§5.3 TROUBLESHOOTING).
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
try:
    value = json.load(sys.stdin)
except Exception:
    print("")
    sys.exit(0)
for part in path.split("."):
    if not part:
        continue
    name, _, index = part.partition("[")
    try:
        if name:
            value = value[name]
        if index:
            value = value[int(index.rstrip("]"))]
    except Exception:
        print("")
        sys.exit(0)
print(value if isinstance(value, str) else json.dumps(value))
' "$path"
}

printf 'LMS web smoke → %s\n' "$BASE_URL"

# ---------- 1. Статика ----------
step 'Статика SPA'
status="$(request GET '/')"
index_body="$(body)"
[[ "$status" == '200' ]] && pass 'GET / → 200' "$status" || fail 'GET / → 200' "$status"
grep -q 'id="view"' <<<"$index_body" && pass 'index.html содержит контейнер представлений' || fail 'index.html содержит контейнер представлений'
grep -q 'js/main\.js' <<<"$index_body" && pass 'index.html подключает js/main.js' || fail 'index.html подключает js/main.js'

status="$(request GET '/js/main.js')"
[[ "$status" == '200' ]] && pass 'GET /js/main.js → 200' || fail 'GET /js/main.js → 200' "$status"
[[ "$(content_type)" == *javascript* ]] && pass 'js/main.js отдаётся как JavaScript' "$(content_type)" || fail 'js/main.js отдаётся как JavaScript' "$(content_type)"
grep -q 'bootstrap' "$tmp_dir/body" && pass 'main.js содержит точку входа' || fail 'main.js содержит точку входа'

status="$(request GET '/css/app.css')"
[[ "$status" == '200' ]] && pass 'GET /css/app.css → 200' || fail 'GET /css/app.css → 200' "$status"

step 'Служебные файлы не публикуются'
for path in '/package.json' '/test/browser-smoke.html' '/nginx.conf'; do
    request GET "$path" >/dev/null
    # SPA-фолбэк отдаёт index.html, поэтому смотрим не только на код.
    if grep -Eq 'browser-smoke|"type": "module"|resolver 127|proxy_pass' "$tmp_dir/body"; then
        fail "GET $path не отдаёт служебный файл" 'содержимое файла попало в ответ'
    else
        pass "GET $path не отдаёт служебный файл"
    fi
done

# ---------- 2. Health через прокси ----------
step 'Health gateway через nginx'
status="$(request GET '/healthz')"
[[ "$status" == '200' ]] && pass 'GET /healthz → 200' || fail 'GET /healthz → 200' "$status"
grep -q '"status":"UP"' "$tmp_dir/body" && pass 'gateway сообщает UP' || fail 'gateway сообщает UP'

# ---------- 3. API через прокси ----------
step 'API через /api (same-origin)'
login_body="$(printf '{"email":"%s","password":"%s"}' "$ADMIN_EMAIL" "$ADMIN_PASSWORD")"
status="$(request POST '/api/auth/login' '' "$login_body")"
[[ "$status" == '200' ]] && pass 'POST /api/auth/login → 200' || fail 'POST /api/auth/login → 200' "$status"

access_token="$(body | json_get '.accessToken')"
refresh_token="$(body | json_get '.refreshToken')"
[[ -n "$access_token" ]] && pass 'получен access-токен' || fail 'получен access-токен'
[[ -n "$refresh_token" ]] && pass 'получен refresh-токен' || fail 'получен refresh-токен'

status="$(request GET '/api/auth/me' "$access_token")"
[[ "$status" == '200' ]] && pass 'GET /api/auth/me → 200' || fail 'GET /api/auth/me → 200' "$status"
grep -q "$ADMIN_EMAIL" "$tmp_dir/body" && pass 'профиль соответствует демо-админу' || fail 'профиль соответствует демо-админу'

status="$(request GET '/api/courses' "$access_token")"
[[ "$status" == '200' ]] && pass 'GET /api/courses → 200' || fail 'GET /api/courses → 200' "$status"
[[ "$(body | tr -d '[:space:]' | cut -c1)" == '[' ]] && pass 'список курсов — JSON-массив' || fail 'список курсов — JSON-массив'

status="$(request GET '/api/courses')"
[[ "$status" == '401' ]] && pass 'GET /api/courses без токена → 401' || fail 'GET /api/courses без токена → 401' "$status"

status="$(request POST '/api/auth/login' '' '{"email":"admin@lms.local","password":"wrong"}')"
[[ "$status" == '401' ]] && pass 'неверный пароль → 401' || fail 'неверный пароль → 401' "$status"

# ---------- 4. Enrollment и notifications через прокси ----------
step 'Enrollment и notifications через прокси (этап 2)'
status="$(request GET '/api/enrollments' "$access_token")"
[[ "$status" == '200' ]] && pass 'GET /api/enrollments → 200' || fail 'GET /api/enrollments → 200' "$status"
[[ "$(body | tr -d '[:space:]' | cut -c1)" == '[' ]] && pass 'мои записи — JSON-массив' || fail 'мои записи — JSON-массив'

status="$(request GET '/api/enrollments')"
[[ "$status" == '401' ]] && pass 'GET /api/enrollments без токена → 401' || fail 'GET /api/enrollments без токена → 401' "$status"

status="$(request GET '/api/notifications' "$access_token")"
[[ "$status" == '200' ]] && pass 'GET /api/notifications → 200' || fail 'GET /api/notifications → 200' "$status"
[[ "$(body | tr -d '[:space:]' | cut -c1)" == '[' ]] && pass 'мои уведомления — JSON-массив' || fail 'мои уведомления — JSON-массив'

status="$(request GET '/api/notifications')"
[[ "$status" == '401' ]] && pass 'GET /api/notifications без токена → 401' || fail 'GET /api/notifications без токена → 401' "$status"

step 'Статика новых модулей UI (этап 2)'
for path in '/js/api/enrollments.js' '/js/api/notifications.js' '/js/views/my-courses.js' '/js/views/notifications.js'; do
    status="$(request GET "$path")"
    if [[ "$status" == '200' ]] && grep -q 'export' "$tmp_dir/body"; then
        pass "GET $path → 200, ES-модуль"
    else
        fail "GET $path → 200, ES-модуль" "$status"
    fi
done

# ---------- 5. Ротация refresh через прокси ----------
step 'Refresh-ротация'
status="$(request POST '/api/auth/refresh' '' "$(printf '{"refreshToken":"%s"}' "$refresh_token")")"
[[ "$status" == '200' ]] && pass 'POST /api/auth/refresh → 200' || fail 'POST /api/auth/refresh → 200' "$status"

new_access="$(body | json_get '.accessToken')"
new_refresh="$(body | json_get '.refreshToken')"
# Access-токен может совпасть байт-в-байт при refresh в ту же секунду:
# claims одинаковы, подпись RS256 детерминирована. Ротируется refresh-токен.
[[ -n "$new_access" ]] && pass 'получен новый access-токен' || fail 'получен новый access-токен'
[[ -n "$new_refresh" && "$new_refresh" != "$refresh_token" ]] && pass 'refresh-токен ротирован' || fail 'refresh-токен ротирован'

status="$(request GET '/api/auth/me' "$new_access")"
[[ "$status" == '200' ]] && pass 'новый access-токен работает' || fail 'новый access-токен работает' "$status"

status="$(request POST '/api/auth/logout' "$new_access" "$(printf '{"refreshToken":"%s"}' "$new_refresh")")"
[[ "$status" == '204' ]] && pass 'POST /api/auth/logout → 204' || fail 'POST /api/auth/logout → 204' "$status"

# ---------- Итог ----------
echo
if [[ "$failures" -eq 0 ]]; then
    printf 'OK: %d проверок пройдено. UI доступен: %s\n' "$checks" "$BASE_URL"
    exit 0
fi
printf 'ПРОВАЛ: %d из %d проверок не прошли.\n' "$failures" "$checks"
printf 'Подсказки: docker compose ps; docker compose logs --tail 50 web; docs/UI.md\n'
exit 1
