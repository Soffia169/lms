#!/usr/bin/env pwsh
#
# Сквозной сценарий этапа 2 для Windows (аналог demo-stage-2.sh):
#   публикация курса → снапшот → запись → счётчик → урок → уведомления →
#   остановка RabbitMQ → событие не теряется.
#
# Запуск: powershell -File scripts/demo-stage-2.ps1
#
[CmdletBinding()]
param(
    [string]$BaseUrl = $(if ($env:BASE_URL) { $env:BASE_URL } else { 'http://localhost:8080' }),
    [string]$AdminEmail = 'admin@lms.local',
    [string]$AdminPassword = 'Admin123!',
    [string]$UserPassword = 'Password123!',
    [string]$ComposeDir = 'infra'
)

$ErrorActionPreference = 'Stop'
$runId = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$studentAEmail = "student-a-$runId@lms.local"
$studentBEmail = "student-b-$runId@lms.local"
$instructorEmail = "instructor-$runId@lms.local"

function Write-Step([string]$Text) { Write-Host ""; Write-Host "== $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host $Text -ForegroundColor Green }

function Invoke-Api {
    param([string]$Method, [string]$Path, [string]$Token, [string]$Body)

    $headers = @{}
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }
    $parameters = @{ Method = $Method; Uri = "$BaseUrl$Path"; Headers = $headers; UseBasicParsing = $true }
    if ($Body) {
        $parameters['ContentType'] = 'application/json'
        $parameters['Body'] = $Body
    }
    try {
        $response = Invoke-WebRequest @parameters
        return [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Content = $response.Content }
    }
    catch {
        $webResponse = $_.Exception.Response
        if ($null -eq $webResponse) { throw }
        $content = ''
        $stream = $webResponse.GetResponseStream()
        if ($null -ne $stream) {
            $content = (New-Object System.IO.StreamReader($stream)).ReadToEnd()
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

function Json([hashtable]$Data) { return ($Data | ConvertTo-Json -Compress) }

function Register([string]$Email, [string]$FullName) {
    $response = Invoke-Api -Method POST -Path '/api/auth/register' -Body (Json @{
            email = $Email; password = $UserPassword; fullName = $FullName })
    Assert-Status $response 201 "регистрация $Email"
    return ($response.Content | ConvertFrom-Json).id
}

function Login([string]$Email, [string]$Password = $UserPassword) {
    $response = Invoke-Api -Method POST -Path '/api/auth/login' -Body (Json @{
            email = $Email; password = $Password })
    Assert-Status $response 200 "логин $Email"
    return ($response.Content | ConvertFrom-Json).accessToken
}

function Await-Counter([string]$Token, [string]$CourseId, [int]$Expected) {
    for ($i = 0; $i -lt 100; $i++) {
        $response = Invoke-Api -Method GET -Path "/api/courses/$CourseId" -Token $Token
        if ($response.StatusCode -ne 200) { throw "чтение курса: HTTP $($response.StatusCode)" }
        if (($response.Content | ConvertFrom-Json).enrolledCount -eq $Expected) { return }
        Start-Sleep -Milliseconds 200
    }
    throw "enrolledCount не стал $Expected"
}

function Await-Enrollable([string]$Token, [string]$CourseId) {
    for ($i = 0; $i -lt 100; $i++) {
        $response = Invoke-Api -Method POST -Path '/api/enrollments' -Token $Token -Body (Json @{ courseId = $CourseId })
        if ($response.StatusCode -eq 201) { return ($response.Content | ConvertFrom-Json).id }
        if ($response.StatusCode -eq 409) { throw 'студент уже записан' }
        Start-Sleep -Milliseconds 200
    }
    throw 'курс так и не стал доступен для записи'
}

function Await-NotificationType([string]$Token, [string]$Type) {
    for ($i = 0; $i -lt 100; $i++) {
        $response = Invoke-Api -Method GET -Path '/api/notifications' -Token $Token
        if ($response.StatusCode -ne 200) { throw "чтение уведомлений: HTTP $($response.StatusCode)" }
        if ($response.Content -match "`"type`":`"$Type`"") { return }
        Start-Sleep -Milliseconds 200
    }
    throw "уведомление $Type не появилось"
}

function Compose([string[]]$Arguments) {
    Push-Location $ComposeDir
    $previous = $ErrorActionPreference
    try {
        # В Windows PowerShell 5.1 вывод docker в stderr считается ошибкой при Stop
        $ErrorActionPreference = 'Continue'
        & docker compose @Arguments 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "docker compose $($Arguments -join ' ') завершился с кодом $LASTEXITCODE" }
    }
    finally {
        $ErrorActionPreference = $previous
        Pop-Location
    }
}

function PendingOutbox() {
    Push-Location $ComposeDir
    try {
        $ErrorActionPreference = 'Continue'
        $value = & docker compose exec -T postgres psql -U lms -d enrollment_db -Atc `
            "select count(*) from outbox where published_at is null"
        return [int]($value | Select-Object -Last 1).ToString().Trim()
    }
    finally {
        Pop-Location
    }
}

Write-Step "Ожидание gateway на $BaseUrl"
$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
        $health = Invoke-WebRequest -Uri "$BaseUrl/actuator/health" -UseBasicParsing -TimeoutSec 5
        if ($health.StatusCode -eq 200) { $ready = $true; break }
    }
    catch { }
    Start-Sleep -Seconds 2
}
if (-not $ready) { throw "gateway недоступен: $BaseUrl" }
Write-Ok 'gateway доступен'

Write-Step '1. Пользователи'
$studentAId = Register $studentAEmail 'Student A'
$studentBId = Register $studentBEmail 'Student B'
$instructorId = Register $instructorEmail 'Demo Instructor'

$adminToken = Login $AdminEmail $AdminPassword
$response = Invoke-Api -Method PATCH -Path "/api/auth/users/$instructorId/role" -Token $adminToken -Body (Json @{ role = 'INSTRUCTOR' })
Assert-Status $response 200 'выдача роли INSTRUCTOR'

$studentAToken = Login $studentAEmail
$studentBToken = Login $studentBEmail
$instructorToken = Login $instructorEmail

Write-Step '2. Курс, модуль, урок, публикация'
$response = Invoke-Api -Method POST -Path '/api/courses' -Token $instructorToken -Body (Json @{ title = 'Stage 2 course'; description = 'Events demo' })
Assert-Status $response 201 'создание курса'
$courseId = ($response.Content | ConvertFrom-Json).id

$response = Invoke-Api -Method POST -Path "/api/courses/$courseId/modules" -Token $instructorToken -Body (Json @{ title = 'Module 1' })
Assert-Status $response 201 'создание модуля'
$moduleId = ($response.Content | ConvertFrom-Json).id

$response = Invoke-Api -Method POST -Path "/api/modules/$moduleId/lessons" -Token $instructorToken -Body (Json @{ title = 'Lesson 1'; content = 'Content' })
Assert-Status $response 201 'создание урока'
$lessonId = ($response.Content | ConvertFrom-Json).id

$response = Invoke-Api -Method POST -Path "/api/courses/$courseId/publish" -Token $instructorToken
Assert-Status $response 200 'публикация курса'

Write-Step '3. Запись студента A (ждём снапшот из course.published)'
$enrollmentA = Await-Enrollable $studentAToken $courseId
Write-Ok "запись создана: $enrollmentA"
Await-Counter $instructorToken $courseId 1
Write-Ok 'счётчик курса: 1'

Write-Step '4. Отметка урока и уведомления'
$response = Invoke-Api -Method POST -Path "/api/enrollments/$enrollmentA/lessons/$lessonId/complete" -Token $studentAToken
Assert-Status $response 200 'урок завершён'
Await-NotificationType $studentAToken 'ENROLLMENT_CREATED'
Await-NotificationType $studentAToken 'LESSON_COMPLETED'
Write-Ok 'уведомления созданы'

Write-Step '5. Остановка RabbitMQ: событие не теряется'
Compose @('stop', 'rabbitmq')
Write-Ok 'rabbitmq остановлен'

$enrollmentB = Await-Enrollable $studentBToken $courseId
Write-Ok "запись B создана при остановленном брокере: $enrollmentB"

$pending = PendingOutbox
if ($pending -lt 1) { throw 'в outbox нет неопубликованных событий' }
Write-Ok "в outbox ожидает событий: $pending"

Compose @('start', 'rabbitmq')
Write-Ok 'rabbitmq запущен'

Await-Counter $instructorToken $courseId 2
Write-Ok 'счётчик курса после восстановления: 2'

for ($i = 0; $i -lt 100; $i++) {
    if ((PendingOutbox) -eq 0) { break }
    Start-Sleep -Milliseconds 500
}
if ((PendingOutbox) -ne 0) { throw 'outbox не опустел после восстановления' }
Write-Ok 'outbox пуст — все события опубликованы'

Write-Step 'Итог'
Write-Host "Курс:      $courseId"
Write-Host "Урок:      $lessonId"
Write-Host "Запись A:  $enrollmentA"
Write-Host "Запись B:  $enrollmentB"
Write-Host "Студент A: $studentAId"
Write-Host "Студент B: $studentBId"
Write-Ok 'Сценарий этапа 2 пройден'
