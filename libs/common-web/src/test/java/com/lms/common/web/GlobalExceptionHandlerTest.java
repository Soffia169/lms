package com.lms.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.Map;

import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.NotBlank;

import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void resourceNotFoundMapsTo404ProblemDetail() {
        ProblemDetail problem = handler.handleResourceNotFound(ResourceNotFoundException.of("Course", 42L));

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.NOT_FOUND.value());
        assertThat(problem.getTitle()).isEqualTo("Not Found");
        assertThat(problem.getDetail()).isEqualTo("Course with id 42 not found");
    }

    @Test
    void conflictMapsTo409ProblemDetail() {
        ProblemDetail problem = handler.handleConflict(new ConflictException("Email already registered"));

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(problem.getTitle()).isEqualTo("Conflict");
        assertThat(problem.getDetail()).isEqualTo("Email already registered");
    }

    @Test
    void unauthorizedMapsTo401ProblemDetail() {
        ProblemDetail problem = handler.handleUnauthorized(new UnauthorizedException("Invalid email or password"));

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(problem.getTitle()).isEqualTo("Unauthorized");
    }

    @Test
    void validationErrorsAreExposedAsErrorMap() {
        BeanPropertyBindingResult bindingResult = new BeanPropertyBindingResult(new Object(), "request");
        bindingResult.addError(new FieldError("request", "title", "must not be blank"));

        ProblemDetail problem = handler.handleMethodArgumentNotValid(
                new MethodArgumentNotValidException(methodParameter(), bindingResult));

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(problem.getTitle()).isEqualTo("Validation Failed");
        assertThat(errorsOf(problem)).containsEntry("title", "must not be blank");
    }

    @Test
    void constraintViolationIsExposedAsErrorMap() {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            Validator validator = factory.getValidator();
            var violations = validator.validate(new TitleRequest(" "));
            assertThat(violations).isNotEmpty();

            ProblemDetail problem = handler.handleConstraintViolation(
                    new ConstraintViolationException(violations));

            assertThat(problem.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST.value());
            // текст сообщения зависит от локали валидатора — проверяем ключ и непустое описание
            assertThat(errorsOf(problem)).containsKey("title");
            assertThat(errorsOf(problem).get("title")).isNotBlank();
        }
    }

    @Test
    void malformedBodyMapsTo400() {
        ProblemDetail problem = handler.handleHttpMessageNotReadable(
                new HttpMessageNotReadableException("malformed", new MockHttpInputMessage(new byte[0])));

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(problem.getTitle()).isEqualTo("Malformed Request");
    }

    @Test
    void typeMismatchNamesOffendingParameter() {
        ProblemDetail problem = handler.handleMethodArgumentTypeMismatch(new MethodArgumentTypeMismatchException(
                "abc", Long.class, "id", methodParameter(), new NumberFormatException("bad number")));

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(problem.getDetail()).contains("'id'");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, String> errorsOf(ProblemDetail problem) {
        assertThat(problem.getProperties()).containsKey("errors");
        return (Map<String, String>) problem.getProperties().get("errors");
    }

    private static MethodParameter methodParameter() {
        Method method = methodParameterSource();
        return new MethodParameter(method, 0);
    }

    private static Method methodParameterSource() {
        try {
            return GlobalExceptionHandlerTest.class.getDeclaredMethod("sample", String.class);
        } catch (NoSuchMethodException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private record TitleRequest(@NotBlank String title) {
    }

    @SuppressWarnings("unused")
    private void sample(String value) {
        // источник MethodParameter для тестов
    }
}
