package com.lms.auth.controller;

import java.util.Map;

import com.lms.auth.config.RsaKeyProvider;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Публичный JWK Set. По нему gateway и остальные сервисы проверяют подпись
 * access-токенов; приватная часть ключа наружу не отдаётся.
 */
@RestController
@RequestMapping("/api/auth/.well-known")
@Tag(name = "Auth keys", description = "Публичные ключи для проверки JWT")
public class JwkController {

    private final RsaKeyProvider keyProvider;

    public JwkController(RsaKeyProvider keyProvider) {
        this.keyProvider = keyProvider;
    }

    @GetMapping(value = "/jwks.json", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "JWK Set с текущим ключом подписи")
    public Map<String, Object> jwks() {
        return keyProvider.publicJwkSet().toJSONObject();
    }
}
