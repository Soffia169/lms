#!/usr/bin/env pwsh
#
# Сквозной сценарий этапа 1 для Windows (аналог demo-stage-1.sh):
#   регистрация → логин → 403 у студента → выдача роли INSTRUCTOR админом →
#   создание курса/модуля/урока → публикация → refresh-ротация → logout.
#
# Запуск: pwsh scripts/demo-stage-1.ps1
#         pwsh scripts/demo-stage-1.ps1 -BaseUrl http://localhost:8080
#
[CmdletBinding()]
param(
    [string]$BaseUrl = $(if ($env:BASE_URL) { $env:BASE_URL } else { 'http://localhost:8080' }),
    [string]$AdminEmail = 'admin@lms.local',
    [string]$AdminPassword = 'Admin123!',
    [string]$UserPassword = 'Password123!'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$runId = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$studentEmail = "student-$runId@lms.local"

function Write-Step([string]$Text) {
    Write-Host ""
    Write-Host "== $Text" -ForegroundColor Cyan
}

function Write-Ok([string]$Text) {
    Write-Host $Text -ForegroundColor Green
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        [string]$Token,
        [string]$Body
    )

    $headers = @{}
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }

    $parameters = @{
        Method           = $Method
        Uri              = "$BaseUrl$Path"
        Headers          = $headers
        UseBasicParsing  = $true
    }
    if ($Body) {
        $parameters['ContentType'] = 'application/json'
        $parameters['Body'] = $Body
    }

    # Совместимо с Windows PowerShell 5.1: -SkipHttpErrorCheck появился только в pwsh 7
    try {
        $response = Invoke-WebRequest @parameters
        return [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Content = $response.Content }
    }
    catch {
        $webResponse = $_.Exception.Response
        if ($null -eq $webResponse) { throw }

        $stream = $webResponse.GetResponseStream()
        $content = ''
        if ($null -ne $stream) {
            $reader = New-Object System.IO.StreamReader($stream)
            $content = $reader.ReadToEnd()
        }
        return [pscustomobject]@{ StatusCode = [int]$webResponse.StatusCode; Content = $content }
    }
}

function Assert-Status($Response, [int]$Expected, [string]$Description) {
    if ($Response.StatusCode -ne $Expected) {
        throw "$Description`: ожидался HTTP $Expected, получен $($Response.StatusCode): $($Response.Content)"
    }
    Write-Ok "$Description (HTTP $($Response.StatusCode))"
}

function ConvertTo-JsonBody([hashtable]$Data) {
    return ($Data | ConvertTo-Json -Compress)
}

Write-Step "Ожидание gateway на $BaseUrl"
$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
        $health = Invoke-WebRequest -Uri "$BaseUrl/actuator/health" -UseBasicParsing -TimeoutSec 5
        if ($health.StatusCode -eq 200) { $ready = $true; break }
    }
    catch {
        # gateway ещё поднимается
    }
    Start-Sleep -Seconds 2
}
if (-not $ready) { throw "gateway недоступен: $BaseUrl" }
Write-Ok 'gateway доступен'

Write-Step "1. Регистрация студента ($studentEmail)"
$registerBody = ConvertTo-JsonBody @{
    email    = $studentEmail
    password = $UserPassword
    fullName = 'Demo Student'
}
$response = Invoke-Api -Method POST -Path '/api/auth/register' -Body $registerBody
Assert-Status $response 201 'регистрация студента'
$studentId = ($response.Content | ConvertFrom-Json).id

Write-Step '2. Логин студента'
$loginBody = ConvertTo-JsonBody @{ email = $studentEmail; password = $UserPassword }
$response = Invoke-Api -Method POST -Path '/api/auth/login' -Body $loginBody
Assert-Status $response 200 'логин студента'
$studentToken = ($response.Content | ConvertFrom-Json).accessToken

Write-Step '3. Студент пытается создать курс — ожидаем 403'
$response = Invoke-Api -Method POST -Path '/api/courses' -Token $studentToken -Body (ConvertTo-JsonBody @{ title = 'Forbidden course' })
Assert-Status $response 403 'студент не может создавать курсы'

Write-Step '4. Админ выдаёт студенту роль INSTRUCTOR'
$adminLoginBody = ConvertTo-JsonBody @{ email = $AdminEmail; password = $AdminPassword }
$response = Invoke-Api -Method POST -Path '/api/auth/login' -Body $adminLoginBody
Assert-Status $response 200 'логин админа'
$adminToken = ($response.Content | ConvertFrom-Json).accessToken

$response = Invoke-Api -Method PATCH -Path "/api/auth/users/$studentId/role" -Token $adminToken -Body (ConvertTo-JsonBody @{ role = 'INSTRUCTOR' })
Assert-Status $response 200 'смена роли на INSTRUCTOR'

Write-Step '5. Повторный логин — в токене уже INSTRUCTOR'
$response = Invoke-Api -Method POST -Path '/api/auth/login' -Body $loginBody
Assert-Status $response 200 'логин инструктора'
$tokens = $response.Content | ConvertFrom-Json
$instructorToken = $tokens.accessToken
$refreshToken = $tokens.refreshToken

$response = Invoke-Api -Method GET -Path '/api/auth/me' -Token $instructorToken
Assert-Status $response 200 'профиль инструктора'
if (($response.Content | ConvertFrom-Json).role -ne 'INSTRUCTOR') { throw 'роль в профиле не INSTRUCTOR' }

Write-Step '6. Создание курса, модуля и урока'
$response = Invoke-Api -Method POST -Path '/api/courses' -Token $instructorToken -Body (ConvertTo-JsonBody @{ title = 'Java Basics'; description = 'Demo course' })
Assert-Status $response 201 'создание курса'
$courseId = ($response.Content | ConvertFrom-Json).id

$response = Invoke-Api -Method POST -Path "/api/courses/$courseId/modules" -Token $instructorToken -Body (ConvertTo-JsonBody @{ title = 'Introduction' })
Assert-Status $response 201 'создание модуля'
$moduleId = ($response.Content | ConvertFrom-Json).id

$response = Invoke-Api -Method POST -Path "/api/modules/$moduleId/lessons" -Token $instructorToken -Body (ConvertTo-JsonBody @{ title = 'What is JVM?'; content = 'JVM runs bytecode' })
Assert-Status $response 201 'создание урока'
$lessonId = ($response.Content | ConvertFrom-Json).id

Write-Step '7. Публикация курса'
$response = Invoke-Api -Method POST -Path "/api/courses/$courseId/publish" -Token $instructorToken
Assert-Status $response 200 'публикация курса'
if (-not ($response.Content | ConvertFrom-Json).published) { throw 'курс не опубликован' }

$response = Invoke-Api -Method GET -Path "/api/courses/$courseId" -Token $instructorToken
Assert-Status $response 200 'чтение курса'
$course = $response.Content | ConvertFrom-Json
if ($course.modules[0].lessons[0].id -ne $lessonId) { throw 'урок не найден в структуре курса' }

Write-Step '8. Refresh-ротация'
$refreshBody = ConvertTo-JsonBody @{ refreshToken = $refreshToken }
$response = Invoke-Api -Method POST -Path '/api/auth/refresh' -Body $refreshBody
Assert-Status $response 200 'обновление токенов'
$newTokens = $response.Content | ConvertFrom-Json

$response = Invoke-Api -Method GET -Path '/api/auth/me' -Token $newTokens.accessToken
Assert-Status $response 200 'новый access-токен работает'

$response = Invoke-Api -Method POST -Path '/api/auth/refresh' -Body $refreshBody
Assert-Status $response 401 'старый refresh-токен отклонён'

Write-Step '9. Logout отзывает refresh-токен'
$logoutBody = ConvertTo-JsonBody @{ refreshToken = $newTokens.refreshToken }
$response = Invoke-Api -Method POST -Path '/api/auth/logout' -Token $newTokens.accessToken -Body $logoutBody
Assert-Status $response 204 'logout'

$response = Invoke-Api -Method POST -Path '/api/auth/refresh' -Body $logoutBody
Assert-Status $response 401 'refresh после logout отклонён'

Write-Step 'Итог'
Write-Host "Курс:    $courseId"
Write-Host "Модуль:  $moduleId"
Write-Host "Урок:    $lessonId"
Write-Host "Студент: $studentId"
Write-Ok 'Сценарий этапа 1 пройден'
