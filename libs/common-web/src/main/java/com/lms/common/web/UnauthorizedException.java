package com.lms.common.web;

/**
 * Аутентификация не удалась: неверные учётные данные или недействительный
 * токен (HTTP 401).
 *
 * <p>Не путать с 403: здесь клиент не доказал, кем является; при 403 — доказал,
 * но прав недостаточно.</p>
 */
public class UnauthorizedException extends RuntimeException {

    public UnauthorizedException(String message) {
        super(message);
    }
}
