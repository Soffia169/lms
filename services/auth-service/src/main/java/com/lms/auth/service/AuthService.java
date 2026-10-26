package com.lms.auth.service;

import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

import com.lms.auth.model.RefreshToken;
import com.lms.auth.repository.RefreshTokenRepository;
import com.lms.auth.model.Role;
import com.lms.auth.model.User;
import com.lms.auth.repository.UserRepository;
import com.lms.auth.outbox.OutboxWriter;
import com.lms.auth.dto.AuthResponse;
import com.lms.auth.dto.LoginRequest;
import com.lms.auth.dto.RegisterRequest;
import com.lms.auth.dto.UserResponse;
import com.lms.common.events.EventPayloads.UserRegisteredEvent;
import com.lms.common.events.EventTopics;
import com.lms.common.web.ConflictException;
import com.lms.common.web.ResourceNotFoundException;
import com.lms.common.web.UnauthorizedException;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Сценарии аутентификации: регистрация, вход, обновление и отзыв токенов, роли.
 *
 * <p>Регистрация всегда создаёт {@link Role#STUDENT}: повышение прав — отдельная
 * операция администратора, а не параметр публичного запроса.</p>
 */
@Service
public class AuthService {

    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final OutboxWriter outboxWriter;
    private final Clock clock;

    public AuthService(UserRepository users,
                       RefreshTokenRepository refreshTokens,
                       PasswordEncoder passwordEncoder,
                       TokenService tokenService,
                       OutboxWriter outboxWriter,
                       Clock clock) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
        this.outboxWriter = outboxWriter;
        this.clock = clock;
    }

    @Transactional
    public UserResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (users.existsByEmailIgnoreCase(email)) {
            throw new ConflictException("Email is already registered");
        }
        User user = new User(
                UUID.randomUUID(),
                email,
                passwordEncoder.encode(request.password()),
                request.fullName().trim(),
                Role.STUDENT);
        users.save(user);

        // Событие пишется в outbox в той же транзакции, что и пользователь:
        // откат регистрации откатит и событие, и наоборот.
        Instant now = clock.instant();
        outboxWriter.append(
                UUID.randomUUID(),
                EventTopics.USER_REGISTERED,
                new UserRegisteredEvent(user.getId(), user.getEmail(), user.getFullName(),
                        user.getRole().name(), now),
                now);

        return UserResponse.from(user);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        User user = users.findByEmailIgnoreCase(normalizeEmail(request.email()))
                .orElseThrow(AuthService::invalidCredentials);
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw invalidCredentials();
        }
        if (!user.isEnabled()) {
            throw new UnauthorizedException("User is disabled");
        }
        return AuthResponse.from(tokenService.issue(user));
    }

    @Transactional
    public AuthResponse refresh(String rawRefreshToken) {
        RefreshToken stored = refreshTokens.findByTokenHash(TokenService.sha256(rawRefreshToken))
                .orElseThrow(() -> new UnauthorizedException("Invalid refresh token"));
        Instant now = clock.instant();

        if (stored.isRevoked()) {
            // Токен уже использован или отозван: считаем это компрометацией
            // и гасим все активные сессии пользователя.
            refreshTokens.revokeAllForUser(stored.getUserId(), now);
            throw new UnauthorizedException("Refresh token has been revoked");
        }
        if (!stored.getExpiresAt().isAfter(now)) {
            throw new UnauthorizedException("Refresh token expired");
        }

        stored.revoke(now);

        User user = users.findById(stored.getUserId())
                .orElseThrow(() -> new UnauthorizedException("Invalid refresh token"));
        if (!user.isEnabled()) {
            throw new UnauthorizedException("User is disabled");
        }

        // Ротация: старый токен отозван выше, клиент получает новую пару.
        return AuthResponse.from(tokenService.issue(user));
    }

    @Transactional
    public void logout(UUID currentUserId, String rawRefreshToken) {
        refreshTokens.findByTokenHash(TokenService.sha256(rawRefreshToken))
                .filter(token -> token.getUserId().equals(currentUserId))
                .ifPresent(token -> token.revoke(clock.instant()));
    }

    @Transactional(readOnly = true)
    public UserResponse me(UUID userId) {
        return UserResponse.from(requireUser(userId));
    }

    @Transactional
    public UserResponse changeRole(UUID userId, Role role) {
        User user = requireUser(userId);
        user.changeRole(role);
        // Старые токены несут прежние права — заставляем клиента перелогиниться.
        refreshTokens.revokeAllForUser(userId, clock.instant());
        return UserResponse.from(user);
    }

    private User requireUser(UUID userId) {
        return users.findById(userId).orElseThrow(() -> ResourceNotFoundException.of("User", userId));
    }

    private static UnauthorizedException invalidCredentials() {
        return new UnauthorizedException("Invalid email or password");
    }

    private static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
