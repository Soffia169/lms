package com.lms.notification.controller;

import java.util.List;
import java.util.UUID;

import com.lms.notification.model.Notification;
import com.lms.notification.repository.NotificationRepository;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
@Tag(name = "Notifications", description = "In-app уведомления пользователя")
public class NotificationController {

    private final NotificationRepository notifications;

    public NotificationController(NotificationRepository notifications) {
        this.notifications = notifications;
    }

    @GetMapping
    @Operation(summary = "Мои уведомления (до 100, свежие первыми)")
    public List<NotificationResponse> mine(@AuthenticationPrincipal Jwt jwt) {
        UUID userId = UUID.fromString(jwt.getSubject());
        return notifications.findTop100ByRecipientIdOrderByCreatedAtDesc(userId).stream()
                .map(NotificationResponse::from)
                .toList();
    }

    public record NotificationResponse(UUID id, String type, String subject, String body,
                                       java.time.Instant createdAt, java.time.Instant readAt) {

        public static NotificationResponse from(Notification notification) {
            return new NotificationResponse(
                    notification.getId(),
                    notification.getType(),
                    notification.getSubject(),
                    notification.getBody(),
                    notification.getCreatedAt(),
                    notification.getReadAt());
        }
    }
}
