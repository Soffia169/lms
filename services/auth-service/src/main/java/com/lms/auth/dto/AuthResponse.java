package com.lms.auth.dto;

import com.lms.auth.service.IssuedTokens;

public record AuthResponse(String accessToken, String refreshToken, String tokenType, long expiresIn) {

    public static AuthResponse from(IssuedTokens tokens) {
        return new AuthResponse(tokens.accessToken(), tokens.refreshToken(), "Bearer", tokens.expiresIn());
    }
}
