package com.marketplacesystem.dto;

import com.marketplacesystem.entity.ProductStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ProductResponse(
        Long id,
        String name,
        String description,
        BigDecimal price,
        Integer stock,
        String sku,
        String imageUrl,
        ProductStatus status,
        Long categoryId,
        String categoryName,
        Long sellerId,
        String sellerName,
        Double averageRating,
        Integer reviewCount,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {
}
