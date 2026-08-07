package com.marketplacesystem.dto;

import java.time.LocalDateTime;

public record ReviewResponse(
        Long id,
        Long productId,
        String productName,
        Long userId,
        String userName,
        Integer rating,
        String comment,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {
}
