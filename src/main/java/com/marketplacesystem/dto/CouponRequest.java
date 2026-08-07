package com.marketplacesystem.dto;

import com.marketplacesystem.entity.CouponType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record CouponRequest(
        @NotBlank(message = "Coupon code is required")
        @Size(max = 50, message = "Coupon code must not exceed 50 characters")
        String code,

        @NotNull(message = "Coupon type is required")
        CouponType type,

        @NotNull(message = "Coupon value is required")
        @DecimalMin(value = "0.01", message = "Coupon value must be greater than zero")
        BigDecimal value,

        @DecimalMin(value = "0.00", message = "Minimum order amount cannot be negative")
        BigDecimal minOrderAmount,

        @DecimalMin(value = "0.01", message = "Maximum discount must be greater than zero")
        BigDecimal maxDiscountAmount,

        LocalDateTime validFrom,

        LocalDateTime validUntil,

        @NotNull(message = "Maximum uses is required")
        @Min(value = 1, message = "Maximum uses must be at least 1")
        Integer maxUses,

        Boolean active) {
}
