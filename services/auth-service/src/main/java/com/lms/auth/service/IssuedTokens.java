package com.lms.auth.service;

/**
 * Пара токенов, выданная клиенту.
 *
 * @param accessToken  JWT для заголовка {@code Authorization: Bearer}
 * @param refreshToken непрозрачный refresh-токен (хранится в БД только хешем)
 * @param expiresIn    TTL access-токена в секундах
 */
public record IssuedTokens(String accessToken, String refreshToken, long expiresIn) {
}
