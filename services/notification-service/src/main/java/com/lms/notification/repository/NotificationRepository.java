package com.lms.notification.repository;

import java.util.List;
import java.util.UUID;

import com.lms.notification.model.Notification;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    List<Notification> findTop100ByRecipientIdOrderByCreatedAtDesc(UUID recipientId);
}
