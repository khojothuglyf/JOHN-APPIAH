package com.marketplacesystem.dto;

import com.marketplacesystem.entity.CouponType;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record CouponResponse(
        Long id,
        String code,
        CouponType type,
        BigDecimal value,
        BigDecimal minOrderAmount,
        BigDecimal maxDiscountAmount,
        LocalDateTime validFrom,
        LocalDateTime validUntil,
        Integer maxUses,
        Integer usedCount,
        boolean active,
        LocalDateTime createdAt) {
}
