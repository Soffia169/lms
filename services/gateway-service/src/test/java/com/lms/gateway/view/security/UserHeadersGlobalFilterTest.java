package com.lms.gateway.view.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import com.lms.gateway.filter.UserHeadersGlobalFilter;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ServerWebExchange;

import reactor.core.publisher.Mono;

class UserHeadersGlobalFilterTest {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    private final UserHeadersGlobalFilter filter = new UserHeadersGlobalFilter();

    @Test
    void addsHeadersFromTokenAndStripsSpoofedValues() {
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "none")
                .subject(USER_ID.toString())
                .claim("roles", List.of("INSTRUCTOR", "STUDENT"))
                .build();
        ServerWebExchange exchange = exchangeWith(new JwtAuthenticationToken(jwt), "spoofed", "ADMIN");

        ServerHttpRequest forwarded = forward(exchange);

        assertThat(forwarded.getHeaders().getFirst("X-User-Id")).isEqualTo(USER_ID.toString());
        assertThat(forwarded.getHeaders().getFirst("X-User-Roles")).isEqualTo("INSTRUCTOR,STUDENT");
    }

    @Test
    void stripsSpoofedHeadersWhenRequestIsUnauthenticated() {
        ServerWebExchange exchange = exchangeWith(null, "spoofed", "ADMIN");

        ServerHttpRequest forwarded = forward(exchange);

        assertThat(forwarded.getHeaders().getFirst("X-User-Id")).isNull();
        assertThat(forwarded.getHeaders().getFirst("X-User-Roles")).isNull();
    }

    private static ServerWebExchange exchangeWith(JwtAuthenticationToken authentication,
                                                 String userIdHeader,
                                                 String userRolesHeader) {
        MockServerHttpRequest request = MockServerHttpRequest.get("http://localhost/api/courses/1")
                .header("X-User-Id", userIdHeader)
                .header("X-User-Roles", userRolesHeader)
                .build();
        ServerWebExchange exchange = MockServerWebExchange.from(request);
        if (authentication != null) {
            exchange = exchange.mutate().principal(Mono.just(authentication)).build();
        }
        return exchange;
    }

    private ServerHttpRequest forward(ServerWebExchange exchange) {
        AtomicReference<ServerHttpRequest> captured = new AtomicReference<>();
        GatewayFilterChain chain = current -> {
            captured.set(current.getRequest());
            return Mono.empty();
        };

        filter.filter(exchange, chain).block();

        assertThat(captured.get()).isNotNull();
        return captured.get();
    }
}
