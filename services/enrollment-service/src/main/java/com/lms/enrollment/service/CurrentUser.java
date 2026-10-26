package com.lms.enrollment.service;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.security.oauth2.jwt.Jwt;

/** Текущий пользователь из проверенного JWT. */
public record CurrentUser(UUID id, Set<String> roles) {

    public static CurrentUser from(Jwt jwt) {
        List<String> rawRoles = jwt.getClaimAsStringList("roles");
        Set<String> roles = rawRoles == null
                ? Set.of()
                : rawRoles.stream()
                        .filter(role -> role != null && !role.isBlank())
                        .map(role -> role.trim().toUpperCase(Locale.ROOT))
                        .collect(Collectors.toUnmodifiableSet());
        return new CurrentUser(UUID.fromString(jwt.getSubject()), roles);
    }
}
