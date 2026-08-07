package com.marketplacesystem.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record CartItemResponse(
        Long id,
        Long productId,
        String productName,
        BigDecimal unitPrice,
        Integer quantity,
        BigDecimal subtotal,
        String imageUrl,
        Long sellerId,
        LocalDateTime addedAt) {
}
