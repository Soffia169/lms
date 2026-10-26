package com.lms.common.web;

/**
 * Ресурс не найден — отображается в HTTP 404 с телом {@code ProblemDetail}.
 *
 * <p>Исключение намеренно живёт в {@code common-web}: это транспортный контракт
 * ошибки, а не бизнес-исключение конкретного сервиса.</p>
 */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }

    public static ResourceNotFoundException of(String resource, Object id) {
        return new ResourceNotFoundException("%s with id %s not found".formatted(resource, id));
    }
}
