package com.lms.auth.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class RsaKeyProviderTest {

    @TempDir
    Path keyDirectory;

    @Test
    void generatesAndPersistsKeyPairOnFirstStart() {
        RsaKeyProvider provider = provider(keyDirectory);

        assertThat(keyDirectory.resolve("jwt-rsa-private.pem")).exists();
        assertThat(keyDirectory.resolve("jwt-rsa-public.pem")).exists();
        assertThat(provider.publicJwkSet().getKeys()).hasSize(1);
        assertThat(provider.publicJwkSet().getKeys().getFirst().isPrivate()).isFalse();
        assertThat(provider.keyId()).isNotBlank();
    }

    @Test
    void reusesExistingKeyPairAfterRestart() throws Exception {
        RsaKeyProvider first = provider(keyDirectory);
        String modulus = first.publicKey().getModulus().toString(16);
        String kid = first.keyId();

        RsaKeyProvider second = provider(keyDirectory);

        assertThat(second.publicKey().getModulus().toString(16)).isEqualTo(modulus);
        assertThat(second.keyId()).isEqualTo(kid);
        assertThat(Files.readString(keyDirectory.resolve("jwt-rsa-private.pem")))
                .contains("BEGIN PRIVATE KEY");
    }

    @Test
    void generatedKeysAreRsa2048() {
        RsaKeyProvider provider = provider(keyDirectory);

        assertThat(provider.rsaKey().size()).isEqualTo(2048);
        assertThat(provider.rsaKey().isPrivate()).isTrue();
    }

    private static RsaKeyProvider provider(Path directory) {
        AuthProperties properties = new AuthProperties();
        properties.setKeyDir(directory.toString());
        return new RsaKeyProvider(properties);
    }
}
