package com.marketplacesystem.service.impl;

import com.marketplacesystem.dto.NotificationResponse;
import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.entity.Notification;
import com.marketplacesystem.entity.NotificationType;
import com.marketplacesystem.entity.User;
import com.marketplacesystem.exception.ResourceNotFoundException;
import com.marketplacesystem.mapper.NotificationMapper;
import com.marketplacesystem.repository.NotificationRepository;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.NotificationService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class NotificationServiceImpl implements NotificationService {

    private final NotificationRepository notificationRepository;
    private final NotificationMapper notificationMapper;

    public NotificationServiceImpl(NotificationRepository notificationRepository,
                                   NotificationMapper notificationMapper) {
        this.notificationRepository = notificationRepository;
        this.notificationMapper = notificationMapper;
    }

    @Override
    @Transactional
    public void create(User user, NotificationType type, String title, String message) {
        Notification notification = new Notification();
        notification.setUser(user);
        notification.setType(type);
        notification.setTitle(title);
        notification.setMessage(message);
        notificationRepository.save(notification);
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<NotificationResponse> getMyNotifications(UserPrincipal principal, Boolean unreadOnly, Pageable pageable) {
        Page<Notification> page = Boolean.TRUE.equals(unreadOnly)
                ? notificationRepository.findByUserIdAndReadFalse(principal.getId(), pageable)
                : notificationRepository.findByUserId(principal.getId(), pageable);
        List<NotificationResponse> content = page.getContent().stream()
                .map(notificationMapper::toResponse)
                .toList();
        return new PagedResponse<>(content, page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages(), page.isLast());
    }

    @Override
    @Transactional(readOnly = true)
    public long getUnreadCount(UserPrincipal principal) {
        return notificationRepository.countByUserIdAndReadFalse(principal.getId());
    }

    @Override
    @Transactional
    public void markAsRead(Long id, UserPrincipal principal) {
        int updated = notificationRepository.markAsRead(id, principal.getId());
        if (updated == 0) {
            throw new ResourceNotFoundException("Notification not found with id: " + id);
        }
    }

    @Override
    @Transactional
    public void markAllAsRead(UserPrincipal principal) {
        notificationRepository.markAllAsRead(principal.getId());
    }
}
