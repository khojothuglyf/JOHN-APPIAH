package com.marketplacesystem.dto;

import java.time.LocalDateTime;

public record NotificationResponse(
        Long id,
        String type,
        String title,
        String message,
        boolean isRead,
        LocalDateTime createdAt) {
}
