package com.marketplacesystem.service;

import com.marketplacesystem.dto.CouponCheckResponse;
import com.marketplacesystem.dto.CouponRequest;
import com.marketplacesystem.dto.CouponResponse;
import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.entity.User;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;

public interface CouponService {

    CouponResponse createCoupon(CouponRequest request);

    PagedResponse<CouponResponse> getAllCoupons(Pageable pageable);

    CouponResponse getCouponById(Long id);

    CouponResponse updateCoupon(Long id, CouponRequest request);

    void deleteCoupon(Long id);

    CouponCheckResponse checkCoupon(String code, BigDecimal cartTotal, User user);

    BigDecimal validateAndApply(String code, User user, BigDecimal orderTotal);
}
