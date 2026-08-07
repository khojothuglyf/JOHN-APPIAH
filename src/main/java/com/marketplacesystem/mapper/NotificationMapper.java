package com.marketplacesystem.mapper;

import com.marketplacesystem.dto.NotificationResponse;
import com.marketplacesystem.entity.Notification;
import org.springframework.stereotype.Component;

@Component
public class NotificationMapper {

    public NotificationResponse toResponse(Notification notification) {
        return new NotificationResponse(
                notification.getId(),
                notification.getType().name(),
                notification.getTitle(),
                notification.getMessage(),
                notification.isRead(),
                notification.getCreatedAt());
    }
}
