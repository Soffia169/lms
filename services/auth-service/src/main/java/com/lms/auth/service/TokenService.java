package com.lms.auth.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import com.lms.auth.config.AuthProperties;
import com.lms.auth.config.RsaKeyProvider;
import com.lms.auth.model.RefreshToken;
import com.lms.auth.repository.RefreshTokenRepository;
import com.lms.auth.model.User;

import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/**
 * Выпуск access- и refresh-токенов.
 *
 * <p>Access-токен — подписанный RS256 JWT с {@code sub}, {@code roles},
 * {@code email}. Refresh-токен — непрозрачная случайная строка; в БД попадает
 * только её SHA-256 хеш.</p>
 */
@Service
public class TokenService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int REFRESH_TOKEN_BYTES = 32;

    private final JwtEncoder jwtEncoder;
    private final RsaKeyProvider keyProvider;
    private final AuthProperties properties;
    private final RefreshTokenRepository refreshTokenRepository;
    private final Clock clock;

    public TokenService(JwtEncoder jwtEncoder,
                        RsaKeyProvider keyProvider,
                        AuthProperties properties,
                        RefreshTokenRepository refreshTokenRepository,
                        Clock clock) {
        this.jwtEncoder = jwtEncoder;
        this.keyProvider = keyProvider;
        this.properties = properties;
        this.refreshTokenRepository = refreshTokenRepository;
        this.clock = clock;
    }

    public IssuedTokens issue(User user) {
        Instant now = clock.instant();
        Instant accessTokenExpiresAt = now.plus(properties.getAccessTokenTtl());

        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(properties.getIssuer())
                .subject(user.getId().toString())
                .issuedAt(now)
                .expiresAt(accessTokenExpiresAt)
                .claim("email", user.getEmail())
                .claim("roles", List.of(user.getRole().name()))
                .build();
        JwsHeader header = JwsHeader.with(SignatureAlgorithm.RS256)
                .keyId(keyProvider.keyId())
                .build();
        String accessToken = jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();

        String rawRefreshToken = generateRefreshToken();
        RefreshToken refreshToken = new RefreshToken(
                UUID.randomUUID(),
                user.getId(),
                sha256(rawRefreshToken),
                now,
                now.plus(properties.getRefreshTokenTtl()));
        refreshTokenRepository.save(refreshToken);

        return new IssuedTokens(accessToken, rawRefreshToken, properties.getAccessTokenTtl().toSeconds());
    }

    /** SHA-256 в hex — то, что хранится в refresh_tokens.token_hash. */
    public static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    private static String generateRefreshToken() {
        byte[] bytes = new byte[REFRESH_TOKEN_BYTES];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
