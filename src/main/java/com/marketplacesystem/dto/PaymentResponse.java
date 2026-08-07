package com.marketplacesystem.dto;

import com.marketplacesystem.entity.PaymentMethod;
import com.marketplacesystem.entity.PaymentStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record PaymentResponse(
        Long id,
        Long orderId,
        String orderNumber,
        BigDecimal amount,
        String currency,
        PaymentMethod method,
        PaymentStatus status,
        String transactionRef,
        LocalDateTime paidAt,
        LocalDateTime createdAt) {
}
