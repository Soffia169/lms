package com.lms.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Collection;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

class RolesClaimJwtGrantedAuthoritiesConverterTest {

    private final RolesClaimJwtGrantedAuthoritiesConverter converter =
            new RolesClaimJwtGrantedAuthoritiesConverter();

    @Test
    void mapsRolesClaimToRoleAuthorities() {
        Jwt jwt = jwtWithRoles(List.of("STUDENT", "INSTRUCTOR"));

        assertThat(authorityNames(jwt)).containsExactlyInAnyOrder("ROLE_STUDENT", "ROLE_INSTRUCTOR");
    }

    @Test
    void acceptsSingleStringRole() {
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "none")
                .claim("roles", "ADMIN")
                .build();

        assertThat(authorityNames(jwt)).containsExactly("ROLE_ADMIN");
    }

    @Test
    void doesNotDoublePrefixAlreadyPrefixedRoles() {
        Jwt jwt = jwtWithRoles(List.of("ROLE_ADMIN"));

        assertThat(authorityNames(jwt)).containsExactly("ROLE_ADMIN");
    }

    @Test
    void normalizesRoleCaseAndWhitespace() {
        Jwt jwt = jwtWithRoles(List.of(" instructor ", "Admin"));

        assertThat(authorityNames(jwt)).containsExactlyInAnyOrder("ROLE_INSTRUCTOR", "ROLE_ADMIN");
    }

    @Test
    void returnsEmptyCollectionWhenClaimIsMissing() {
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "none")
                .claim("sub", "user-1")
                .build();

        assertThat(converter.convert(jwt)).isEmpty();
    }

    @Test
    void supportsCustomClaimName() {
        RolesClaimJwtGrantedAuthoritiesConverter custom =
                new RolesClaimJwtGrantedAuthoritiesConverter("authorities");
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "none")
                .claim("authorities", List.of("STUDENT"))
                .build();

        assertThat(custom.convert(jwt))
                .extracting(GrantedAuthority::getAuthority)
                .containsExactly("ROLE_STUDENT");
    }

    @Test
    void deduplicatesRepeatedRoles() {
        Jwt jwt = jwtWithRoles(List.of("STUDENT", "student"));

        assertThat(authorityNames(jwt)).containsExactly("ROLE_STUDENT");
    }

    private static Jwt jwtWithRoles(List<String> roles) {
        return Jwt.withTokenValue("token")
                .header("alg", "none")
                .claim("roles", roles)
                .build();
    }

    private List<String> authorityNames(Jwt jwt) {
        Collection<GrantedAuthority> authorities = converter.convert(jwt);
        return authorities.stream().map(GrantedAuthority::getAuthority).toList();
    }
}
