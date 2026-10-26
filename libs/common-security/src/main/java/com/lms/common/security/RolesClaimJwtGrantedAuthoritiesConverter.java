package com.lms.common.security;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Преобразует роли из JWT-claim (по умолчанию {@code roles}) в authorities вида
 * {@code ROLE_<ROLE>}, совместимые с {@code hasRole(...)} и {@code @PreAuthorize}.
 *
 * <p>Роли в токене ожидаются в верхнем регистре (документированные значения:
 * {@code STUDENT}, {@code INSTRUCTOR}, {@code ADMIN}); регистр приводится
 * к верхнему, префикс {@code ROLE_} не дублируется.</p>
 */
public final class RolesClaimJwtGrantedAuthoritiesConverter implements Converter<Jwt, Collection<GrantedAuthority>> {

    /** Claim с ролями по умолчанию. */
    public static final String DEFAULT_CLAIM = "roles";

    private static final String ROLE_PREFIX = "ROLE_";

    private final String claimName;

    public RolesClaimJwtGrantedAuthoritiesConverter() {
        this(DEFAULT_CLAIM);
    }

    public RolesClaimJwtGrantedAuthoritiesConverter(String claimName) {
        this.claimName = Objects.requireNonNull(claimName, "claimName must not be null");
    }

    @Override
    public Collection<GrantedAuthority> convert(Jwt jwt) {
        Object claim = jwt.getClaims().get(claimName);
        if (claim == null) {
            return List.of();
        }

        Collection<?> roles = (claim instanceof Collection<?> collection) ? collection : List.of(claim);

        return roles.stream()
                .filter(Objects::nonNull)
                .map(Object::toString)
                .map(String::trim)
                .filter(role -> !role.isEmpty())
                .map(RolesClaimJwtGrantedAuthoritiesConverter::toAuthorityName)
                .distinct()
                .<GrantedAuthority>map(SimpleGrantedAuthority::new)
                .toList();
    }

    private static String toAuthorityName(String role) {
        String normalized = role.toUpperCase(Locale.ROOT);
        return normalized.startsWith(ROLE_PREFIX) ? normalized : ROLE_PREFIX + normalized;
    }
}
