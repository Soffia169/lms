package com.lms.common.web;

/**
 * Конфликт состояния: ресурс уже существует (HTTP 409).
 *
 * <p>Например, повторная регистрация на занятый email. Транспортный контракт
 * ошибки, а не бизнес-исключение конкретного сервиса.</p>
 */
public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
