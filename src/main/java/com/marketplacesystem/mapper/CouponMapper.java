package com.marketplacesystem.mapper;

import com.marketplacesystem.dto.CouponResponse;
import com.marketplacesystem.entity.Coupon;
import org.springframework.stereotype.Component;

@Component
public class CouponMapper {

    public CouponResponse toResponse(Coupon coupon) {
        return new CouponResponse(
                coupon.getId(),
                coupon.getCode(),
                coupon.getType(),
                coupon.getValue(),
                coupon.getMinOrderAmount(),
                coupon.getMaxDiscountAmount(),
                coupon.getValidFrom(),
                coupon.getValidUntil(),
                coupon.getMaxUses(),
                coupon.getUsedCount(),
                Boolean.TRUE.equals(coupon.getActive()),
                coupon.getCreatedAt());
    }
}
