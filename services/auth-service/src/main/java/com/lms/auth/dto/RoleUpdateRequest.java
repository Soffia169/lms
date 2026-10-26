package com.lms.auth.dto;

import jakarta.validation.constraints.NotNull;

import com.lms.auth.model.Role;

public record RoleUpdateRequest(@NotNull Role role) {
}
