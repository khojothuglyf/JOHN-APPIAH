package com.marketplacesystem.repository;

import com.marketplacesystem.entity.Notification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    Page<Notification> findByUserId(Long userId, Pageable pageable);

    Page<Notification> findByUserIdAndReadFalse(Long userId, Pageable pageable);

    long countByUserIdAndReadFalse(Long userId);

    @Modifying
    @Query("update Notification n set n.read = true where n.id = :id and n.user.id = :userId")
    int markAsRead(@Param("id") Long id, @Param("userId") Long userId);

    @Modifying
    @Query("update Notification n set n.read = true where n.user.id = :userId and n.read = false")
    int markAllAsRead(@Param("userId") Long userId);
}
