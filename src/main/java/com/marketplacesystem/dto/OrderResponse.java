package com.marketplacesystem.dto;

import com.marketplacesystem.entity.OrderStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record OrderResponse(
        Long id,
        String orderNumber,
        OrderStatus status,
        BigDecimal totalAmount,
        BigDecimal discountAmount,
        String couponCode,
        String shippingAddress,
        String city,
        String postalCode,
        String country,
        Long userId,
        String customerName,
        List<OrderItemResponse> items,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {
}
