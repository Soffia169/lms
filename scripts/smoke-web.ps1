#!/usr/bin/env pwsh
#
# Проверка web-интерфейса этапов 1–2 без браузера (аналог smoke-web.sh):
#   1. nginx отдаёт статику SPA и не отдаёт служебные файлы;
#   2. /api проксируется на gateway (логин, /me, курсы, 401 без токена);
#   3. /healthz отвечает значением из actuator gateway;
#   4. refresh-ротация работает через тот же origin;
#   5. enrollment/notification отвечают через прокси, новые модули статики отдаются.
#
# Запуск (стек уже поднят: cd infra; docker compose up -d --build):
#   pwsh scripts/smoke-web.ps1
#   pwsh scripts/smoke-web.ps1 -BaseUrl http://localhost:8088
#
# Сценарий только читает данные (плюс ротация refresh-токена своей сессии),
# поэтому его безопасно запускать на любой локальной базе.
#
[CmdletBinding()]
param(
    [string]$BaseUrl = $(if ($env:WEB_BASE_URL) { $env:WEB_BASE_URL } else { 'http://localhost:8088' }),
    [string]$AdminEmail = 'admin@lms.local',
    [string]$AdminPassword = 'Admin123!'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$script:failures = 0
$script:checks = 0

function Write-Step([string]$Text) {
    Write-Host ""
    Write-Host "== $Text" -ForegroundColor Cyan
}

function Assert-True([bool]$Condition, [string]$Name, [string]$Detail = '') {
    $script:checks++
    $suffix = if ($Detail) { " — $Detail" } else { "" }
    if ($Condition) {
        Write-Host "  PASS  $Name$suffix" -ForegroundColor Green
    }
    else {
        $script:failures++
        Write-Host "  FAIL  $Name$suffix" -ForegroundColor Red
    }
}

function Invoke-Http {
    param(
        [string]$Method,
        [string]$Path,
        [string]$Token,
        [string]$Body
    )

    $headers = @{}
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }

    $parameters = @{
        Method          = $Method
        Uri             = "$BaseUrl$Path"
        Headers         = $headers
        UseBasicParsing = $true
        TimeoutSec      = 20
    }
    if ($Body) {
        $parameters['ContentType'] = 'application/json'
        $parameters['Body'] = $Body
    }

    # Совместимо с Windows PowerShell 5.1: -SkipHttpErrorCheck появился только в pwsh 7.
    try {
        $response = Invoke-WebRequest @parameters
        # Windows PowerShell 5.1 отдаёт Content как byte[] для нестандартных
        # Content-Type (actuator: application/vnd.spring-boot.actuator.v3+json).
        # Без декодирования -match и ConvertFrom-Json получают массив байтов.
        $content = $response.Content
        if ($content -is [byte[]]) {
            $content = [System.Text.Encoding]::UTF8.GetString($content)
        }
        return [pscustomobject]@{
            StatusCode  = [int]$response.StatusCode
            Content     = [string]$content
            ContentType = [string]$response.Headers['Content-Type']
        }
    }
    catch {
        $webResponse = $_.Exception.Response
        if ($null -eq $webResponse) { throw }
        $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream())
        $content = $reader.ReadToEnd()
        return [pscustomobject]@{
            StatusCode  = [int]$webResponse.StatusCode
            Content     = $content
            ContentType = [string]$webResponse.ContentType
        }
    }
}

Write-Host "LMS web smoke → $BaseUrl"

# ---------- 1. Статика ----------
Write-Step "Статика SPA"
$index = Invoke-Http -Method GET -Path '/'
Assert-True ($index.StatusCode -eq 200) 'GET / → 200' $index.StatusCode
Assert-True ($index.Content -match 'id="view"') 'index.html содержит контейнер представлений'
Assert-True ($index.Content -match 'js/main\.js') 'index.html подключает js/main.js'

$main = Invoke-Http -Method GET -Path '/js/main.js'
Assert-True ($main.StatusCode -eq 200) 'GET /js/main.js → 200'
Assert-True ($main.ContentType -match 'javascript') 'js/main.js отдаётся как JavaScript' $main.ContentType
Assert-True ($main.Content -match 'bootstrap') 'main.js содержит точку входа'

$css = Invoke-Http -Method GET -Path '/css/app.css'
Assert-True ($css.StatusCode -eq 200) 'GET /css/app.css → 200'

Write-Step "Служебные файлы не публикуются"
foreach ($path in @('/package.json', '/test/browser-smoke.html', '/nginx.conf')) {
    $response = Invoke-Http -Method GET -Path $path
    # SPA-фолбэк отдаёт index.html с кодом 200, поэтому проверяем ещё и содержимое:
    # служебный файл не должен попасть в ответ.
    $leaked = ($response.StatusCode -eq 200) -and ($response.Content -match 'browser-smoke|"type": "module"|resolver 127')
    Assert-True (-not $leaked) "GET $path не отдаёт служебный файл" "status=$($response.StatusCode)"
}

# ---------- 2. Health через прокси ----------
Write-Step "Health gateway через nginx"
$health = Invoke-Http -Method GET -Path '/healthz'
Assert-True ($health.StatusCode -eq 200) 'GET /healthz → 200' $health.StatusCode
Assert-True ($health.Content -match '"status":"UP"') 'gateway сообщает UP'

# ---------- 3. API через прокси ----------
Write-Step "API через /api (same-origin)"
$login = Invoke-Http -Method POST -Path '/api/auth/login' -Body (@{
        email    = $AdminEmail
        password = $AdminPassword
    } | ConvertTo-Json -Compress)
Assert-True ($login.StatusCode -eq 200) 'POST /api/auth/login → 200' $login.StatusCode

$tokens = $null
try { $tokens = $login.Content | ConvertFrom-Json } catch { $tokens = $null }
Assert-True ($null -ne $tokens -and $tokens.accessToken) 'получен access-токен'
Assert-True ($null -ne $tokens -and $tokens.refreshToken) 'получен refresh-токен'

$me = Invoke-Http -Method GET -Path '/api/auth/me' -Token $tokens.accessToken
Assert-True ($me.StatusCode -eq 200) 'GET /api/auth/me → 200' $me.StatusCode
Assert-True ($me.Content -match $AdminEmail) 'профиль соответствует демо-админу'

$courses = Invoke-Http -Method GET -Path '/api/courses' -Token $tokens.accessToken
Assert-True ($courses.StatusCode -eq 200) 'GET /api/courses → 200' $courses.StatusCode
Assert-True ($courses.Content.TrimStart().StartsWith('[')) 'список курсов — JSON-массив'

$anonymous = Invoke-Http -Method GET -Path '/api/courses'
Assert-True ($anonymous.StatusCode -eq 401) 'GET /api/courses без токена → 401' $anonymous.StatusCode

$badLogin = Invoke-Http -Method POST -Path '/api/auth/login' -Body '{"email":"admin@lms.local","password":"wrong"}'
Assert-True ($badLogin.StatusCode -eq 401) 'неверный пароль → 401' $badLogin.StatusCode

# ---------- 4. Enrollment и notifications через прокси ----------
Write-Step "Enrollment и notifications через прокси (этап 2)"
$enrollments = Invoke-Http -Method GET -Path '/api/enrollments' -Token $tokens.accessToken
Assert-True ($enrollments.StatusCode -eq 200) 'GET /api/enrollments → 200' $enrollments.StatusCode
Assert-True ($enrollments.Content.TrimStart().StartsWith('[')) 'мои записи — JSON-массив'

$enrollmentsAnon = Invoke-Http -Method GET -Path '/api/enrollments'
Assert-True ($enrollmentsAnon.StatusCode -eq 401) 'GET /api/enrollments без токена → 401' $enrollmentsAnon.StatusCode

$notifications = Invoke-Http -Method GET -Path '/api/notifications' -Token $tokens.accessToken
Assert-True ($notifications.StatusCode -eq 200) 'GET /api/notifications → 200' $notifications.StatusCode
Assert-True ($notifications.Content.TrimStart().StartsWith('[')) 'мои уведомления — JSON-массив'

$notificationsAnon = Invoke-Http -Method GET -Path '/api/notifications'
Assert-True ($notificationsAnon.StatusCode -eq 401) 'GET /api/notifications без токена → 401' $notificationsAnon.StatusCode

Write-Step "Статика новых модулей UI (этап 2)"
foreach ($path in @('/js/api/enrollments.js', '/js/api/notifications.js', '/js/views/my-courses.js', '/js/views/notifications.js')) {
    $module = Invoke-Http -Method GET -Path $path
    Assert-True ($module.StatusCode -eq 200 -and $module.Content -match 'export') "GET $path → 200, ES-модуль" $module.StatusCode
}

# ---------- 5. Ротация refresh через прокси ----------
Write-Step "Refresh-ротация"
$refresh = Invoke-Http -Method POST -Path '/api/auth/refresh' -Body (@{ refreshToken = $tokens.refreshToken } | ConvertTo-Json -Compress)
Assert-True ($refresh.StatusCode -eq 200) 'POST /api/auth/refresh → 200' $refresh.StatusCode

$rotated = $null
try { $rotated = $refresh.Content | ConvertFrom-Json } catch { $rotated = $null }
Assert-True ($null -ne $rotated -and $rotated.accessToken) 'получен новый access-токен'
# Access-токен может совпасть байт-в-байт, если refresh случился в ту же секунду:
# claims (sub/roles/email/iat/exp) одинаковы, а подпись RS256 детерминирована.
# Гарантия ротации относится к refresh-токену.
Assert-True ($null -ne $rotated -and $rotated.refreshToken -ne $tokens.refreshToken) 'refresh-токен ротирован'

$meRotated = Invoke-Http -Method GET -Path '/api/auth/me' -Token $rotated.accessToken
Assert-True ($meRotated.StatusCode -eq 200) 'новый access-токен работает (GET /api/auth/me)' $meRotated.StatusCode

$logout = Invoke-Http -Method POST -Path '/api/auth/logout' -Token $rotated.accessToken -Body (@{ refreshToken = $rotated.refreshToken } | ConvertTo-Json -Compress)
Assert-True ($logout.StatusCode -eq 204) 'POST /api/auth/logout → 204' $logout.StatusCode

# ---------- Итог ----------
Write-Host ""
if ($script:failures -eq 0) {
    Write-Host "OK: $($script:checks) проверок пройдено. UI доступен: $BaseUrl" -ForegroundColor Green
    exit 0
}
Write-Host "ПРОВАЛ: $($script:failures) из $($script:checks) проверок не прошли." -ForegroundColor Red
Write-Host "Подсказки: docker compose ps; docker compose logs --tail 50 web; docs/UI.md" -ForegroundColor Yellow
exit 1
