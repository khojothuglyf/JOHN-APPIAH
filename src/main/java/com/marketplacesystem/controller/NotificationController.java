package com.marketplacesystem.controller;

import com.marketplacesystem.dto.ApiResponse;
import com.marketplacesystem.dto.NotificationResponse;
import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.dto.UnreadCountResponse;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.NotificationService;
import com.marketplacesystem.util.AppConstants;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(AppConstants.API_VERSION_1 + "/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<NotificationResponse>>> getMyNotifications(
            @RequestParam(required = false) Boolean unreadOnly,
            @AuthenticationPrincipal UserPrincipal principal,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(notificationService.getMyNotifications(principal, unreadOnly, pageable)));
    }

    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<UnreadCountResponse>> getUnreadCount(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(new UnreadCountResponse(notificationService.getUnreadCount(principal))));
    }

    @PutMapping("/{id}/read")
    public ResponseEntity<ApiResponse<Void>> markAsRead(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal principal) {
        notificationService.markAsRead(id, principal);
        return ResponseEntity.ok(ApiResponse.success(null, "Notification marked as read"));
    }

    @PutMapping("/read-all")
    public ResponseEntity<ApiResponse<Void>> markAllAsRead(
            @AuthenticationPrincipal UserPrincipal principal) {
        notificationService.markAllAsRead(principal);
        return ResponseEntity.ok(ApiResponse.success(null, "All notifications marked as read"));
    }
}
