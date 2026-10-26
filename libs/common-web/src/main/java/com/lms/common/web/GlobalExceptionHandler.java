package com.lms.common.web;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

import jakarta.validation.ConstraintViolationException;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Приводит типовые ошибки HTTP-слоя к единому формату RFC 9457
 * ({@code application/problem+json}).
 *
 * <p>Обработчик не содержит бизнес-логики: он только переводит исключение
 * в транспортное представление. Сервис может добавить свои обработчики рядом —
 * более специфичный {@code @ExceptionHandler} имеет приоритет.</p>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final String VALIDATION_FAILED_TITLE = "Validation Failed";
    private static final String MALFORMED_REQUEST_TITLE = "Malformed Request";
    private static final String NOT_FOUND_TITLE = "Not Found";
    private static final String CONFLICT_TITLE = "Conflict";
    private static final String UNAUTHORIZED_TITLE = "Unauthorized";
    private static final String ERRORS_PROPERTY = "errors";

    @ExceptionHandler(ResourceNotFoundException.class)
    public ProblemDetail handleResourceNotFound(ResourceNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, NOT_FOUND_TITLE, exception.getMessage());
    }

    @ExceptionHandler(ConflictException.class)
    public ProblemDetail handleConflict(ConflictException exception) {
        return problem(HttpStatus.CONFLICT, CONFLICT_TITLE, exception.getMessage());
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ProblemDetail handleUnauthorized(UnauthorizedException exception) {
        return problem(HttpStatus.UNAUTHORIZED, UNAUTHORIZED_TITLE, exception.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleMethodArgumentNotValid(MethodArgumentNotValidException exception) {
        Map<String, String> errors = new LinkedHashMap<>();
        for (FieldError fieldError : exception.getBindingResult().getFieldErrors()) {
            String message = fieldError.getDefaultMessage() == null ? "invalid value" : fieldError.getDefaultMessage();
            errors.putIfAbsent(fieldError.getField(), message);
        }

        ProblemDetail problem = problem(
                HttpStatus.BAD_REQUEST, VALIDATION_FAILED_TITLE, "Request contains invalid fields");
        problem.setProperty(ERRORS_PROPERTY, errors);
        return problem;
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ProblemDetail handleConstraintViolation(ConstraintViolationException exception) {
        Map<String, String> errors = exception.getConstraintViolations().stream()
                .collect(Collectors.toMap(
                        violation -> violation.getPropertyPath().toString(),
                        violation -> violation.getMessage() == null ? "invalid value" : violation.getMessage(),
                        (first, second) -> first,
                        LinkedHashMap::new));

        ProblemDetail problem = problem(
                HttpStatus.BAD_REQUEST, VALIDATION_FAILED_TITLE, "Request contains invalid parameters");
        problem.setProperty(ERRORS_PROPERTY, errors);
        return problem;
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail handleHttpMessageNotReadable(HttpMessageNotReadableException exception) {
        return problem(HttpStatus.BAD_REQUEST, MALFORMED_REQUEST_TITLE, "Request body is missing or malformed");
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ProblemDetail handleMethodArgumentTypeMismatch(MethodArgumentTypeMismatchException exception) {
        return problem(
                HttpStatus.BAD_REQUEST,
                MALFORMED_REQUEST_TITLE,
                "Parameter '%s' has invalid value".formatted(exception.getName()));
    }

    private static ProblemDetail problem(HttpStatus status, String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        return problem;
    }
}
