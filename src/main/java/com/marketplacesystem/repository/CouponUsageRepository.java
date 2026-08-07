package com.marketplacesystem.repository;

import com.marketplacesystem.entity.CouponUsage;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CouponUsageRepository extends JpaRepository<CouponUsage, Long> {

    boolean existsByCouponIdAndUserId(Long couponId, Long userId);

    void deleteByCouponId(Long couponId);
}
