package com.marketplacesystem.dto;

import java.math.BigDecimal;

public record CouponCheckResponse(
        boolean valid,
        String message,
        String code,
        BigDecimal discountAmount) {
}
