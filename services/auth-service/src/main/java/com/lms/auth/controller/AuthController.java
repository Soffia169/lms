package com.lms.auth.controller;

import java.util.UUID;

import com.lms.auth.service.AuthService;
import com.lms.auth.dto.AuthResponse;
import com.lms.auth.dto.LoginRequest;
import com.lms.auth.dto.RefreshTokenRequest;
import com.lms.auth.dto.RegisterRequest;
import com.lms.auth.dto.RoleUpdateRequest;
import com.lms.auth.dto.UserResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * HTTP-адаптер auth-service. Бизнес-логики нет: валидация DTO и делегирование
 * в {@link AuthService}.
 */
@RestController
@RequestMapping("/api/auth")
@Tag(name = "Auth", description = "Регистрация, логин, refresh-токены, роли")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Регистрация; роль всегда STUDENT")
    public UserResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    @Operation(summary = "Вход по email и паролю; выдаёт access + refresh")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/refresh")
    @Operation(summary = "Обновление пары токенов с ротацией refresh-токена")
    public AuthResponse refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return authService.refresh(request.refreshToken());
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Отзыв refresh-токена текущего пользователя")
    public void logout(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody RefreshTokenRequest request) {
        authService.logout(currentUserId(jwt), request.refreshToken());
    }

    @GetMapping("/me")
    @Operation(summary = "Профиль текущего пользователя")
    public UserResponse me(@AuthenticationPrincipal Jwt jwt) {
        return authService.me(currentUserId(jwt));
    }

    @PatchMapping("/users/{userId}/role")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Изменение роли пользователя (ADMIN)")
    public UserResponse changeRole(@PathVariable UUID userId, @Valid @RequestBody RoleUpdateRequest request) {
        return authService.changeRole(userId, request.role());
    }

    private static UUID currentUserId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
