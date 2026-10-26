package com.lms.auth.model;

/**
 * Роль пользователя. Значения совпадают с claim {@code roles} в JWT
 * и с authorities {@code ROLE_*} в сервисах.
 */
public enum Role {
    STUDENT,
    INSTRUCTOR,
    ADMIN
}
