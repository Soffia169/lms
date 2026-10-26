package com.lms.auth.dto;

import java.util.UUID;

import com.lms.auth.model.User;

public record UserResponse(UUID id, String email, String fullName, String role) {

    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getEmail(), user.getFullName(), user.getRole().name());
    }
}
