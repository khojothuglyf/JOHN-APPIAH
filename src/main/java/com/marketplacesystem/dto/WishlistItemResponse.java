package com.marketplacesystem.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record WishlistItemResponse(
        Long id,
        Long productId,
        String productName,
        BigDecimal price,
        String imageUrl,
        String sellerName,
        Double averageRating,
        Integer reviewCount,
        LocalDateTime addedAt) {
}
