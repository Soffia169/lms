package com.lms.gateway.filter;

import java.util.List;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

import reactor.core.publisher.Mono;

/**
 * Пробрасывает идентичность в заголовках {@code X-User-Id} / {@code X-User-Roles}.
 *
 * <p>Заголовки от клиента всегда вырезаются — иначе любой мог бы подставить чужой
 * id. Сервисы используют их только как информационные: авторизация опирается на
 * повторно проверенный JWT (defense in depth).</p>
 */
@Component
public class UserHeadersGlobalFilter implements GlobalFilter, Ordered {

    public static final String USER_ID_HEADER = "X-User-Id";
    public static final String USER_ROLES_HEADER = "X-User-Roles";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest sanitized = exchange.getRequest().mutate()
                .headers(headers -> {
                    headers.remove(USER_ID_HEADER);
                    headers.remove(USER_ROLES_HEADER);
                })
                .build();

        return exchange.getPrincipal()
                .ofType(JwtAuthenticationToken.class)
                .map(authentication -> withUserHeaders(sanitized, authentication.getToken()))
                .defaultIfEmpty(sanitized)
                .flatMap(request -> chain.filter(exchange.mutate().request(request).build()));
    }

    private static ServerHttpRequest withUserHeaders(ServerHttpRequest request, Jwt jwt) {
        ServerHttpRequest.Builder builder = request.mutate().header(USER_ID_HEADER, jwt.getSubject());
        List<String> roles = jwt.getClaimAsStringList("roles");
        if (roles != null && !roles.isEmpty()) {
            builder.header(USER_ROLES_HEADER, String.join(",", roles));
        }
        return builder.build();
    }

    @Override
    public int getOrder() {
        // До фильтров маршрутизации, но после security-фильтров.
        return -1;
    }
}
