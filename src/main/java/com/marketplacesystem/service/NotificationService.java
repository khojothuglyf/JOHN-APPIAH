package com.marketplacesystem.service;

import com.marketplacesystem.dto.NotificationResponse;
import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.entity.NotificationType;
import com.marketplacesystem.entity.User;
import com.marketplacesystem.security.UserPrincipal;
import org.springframework.data.domain.Pageable;

public interface NotificationService {

    void create(User user, NotificationType type, String title, String message);

    PagedResponse<NotificationResponse> getMyNotifications(UserPrincipal principal, Boolean unreadOnly, Pageable pageable);

    long getUnreadCount(UserPrincipal principal);

    void markAsRead(Long id, UserPrincipal principal);

    void markAllAsRead(UserPrincipal principal);
}
