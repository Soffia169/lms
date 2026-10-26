package com.lms.auth.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Держит RSA-пару для подписи JWT.
 *
 * <p>Ключи генерируются при первом старте и сохраняются в PEM-файлы в
 * {@code lms.auth.jwt.key-dir}. Это позволяет токенам оставаться валидными после
 * рестарта сервиса и не хранить приватный ключ в репозитории. В контейнере каталог
 * монтируется именованным томом.</p>
 */
@Component
public class RsaKeyProvider {

    private static final Logger log = LoggerFactory.getLogger(RsaKeyProvider.class);

    private static final int KEY_SIZE = 2048;
    private static final String PRIVATE_FILE = "jwt-rsa-private.pem";
    private static final String PUBLIC_FILE = "jwt-rsa-public.pem";

    private final RSAKey rsaKey;
    private final RSAPublicKey publicKey;

    public RsaKeyProvider(AuthProperties properties) {
        Path directory = Path.of(properties.getKeyDir());
        Path privatePath = directory.resolve(PRIVATE_FILE);
        Path publicPath = directory.resolve(PUBLIC_FILE);

        try {
            KeyPair keyPair;
            if (Files.exists(privatePath) && Files.exists(publicPath)) {
                keyPair = load(privatePath, publicPath);
                log.info("Loaded RSA key pair from {}", directory.toAbsolutePath());
            } else {
                keyPair = generate();
                store(directory, privatePath, publicPath, keyPair);
                log.warn("Generated new RSA key pair in {} — access tokens issued before now are invalid",
                        directory.toAbsolutePath());
            }

            this.publicKey = (RSAPublicKey) keyPair.getPublic();
            String keyId = new RSAKey.Builder(this.publicKey).build().computeThumbprint().toString();
            this.rsaKey = new RSAKey.Builder(this.publicKey)
                    .privateKey((RSAPrivateKey) keyPair.getPrivate())
                    .keyID(keyId)
                    .build();
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to initialize RSA key pair from " + directory.toAbsolutePath(),
                    exception);
        }
    }

    /** Приватный JWK с kid — источник для {@code NimbusJwtEncoder}. */
    public RSAKey rsaKey() {
        return rsaKey;
    }

    public RSAPublicKey publicKey() {
        return publicKey;
    }

    public String keyId() {
        return rsaKey.getKeyID();
    }

    /** Публичный JWK Set для /.well-known/jwks.json. */
    public JWKSet publicJwkSet() {
        return new JWKSet(rsaKey).toPublicJWKSet();
    }

    private static KeyPair load(Path privatePath, Path publicPath) throws Exception {
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        RSAPrivateKey privateKey = (RSAPrivateKey) keyFactory
                .generatePrivate(new PKCS8EncodedKeySpec(readPem(privatePath)));
        RSAPublicKey publicKey = (RSAPublicKey) keyFactory
                .generatePublic(new X509EncodedKeySpec(readPem(publicPath)));
        return new KeyPair(publicKey, privateKey);
    }

    private static void store(Path directory, Path privatePath, Path publicPath, KeyPair keyPair) throws IOException {
        Files.createDirectories(directory);
        Files.writeString(privatePath, toPem("PRIVATE KEY", keyPair.getPrivate().getEncoded()));
        Files.writeString(publicPath, toPem("PUBLIC KEY", keyPair.getPublic().getEncoded()));
    }

    private static KeyPair generate() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(KEY_SIZE);
        return generator.generateKeyPair();
    }

    private static byte[] readPem(Path path) throws IOException {
        String pem = Files.readString(path, StandardCharsets.US_ASCII);
        String base64 = pem
                .replaceAll("-----BEGIN [A-Z ]+-----", "")
                .replaceAll("-----END [A-Z ]+-----", "")
                .replaceAll("\\s", "");
        return Base64.getDecoder().decode(base64);
    }

    private static String toPem(String type, byte[] encoded) {
        String base64 = Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII)).encodeToString(encoded);
        return "-----BEGIN " + type + "-----\n" + base64 + "\n-----END " + type + "-----\n";
    }
}
