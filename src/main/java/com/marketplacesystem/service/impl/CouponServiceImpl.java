package com.marketplacesystem.service.impl;

import com.marketplacesystem.dto.CouponCheckResponse;
import com.marketplacesystem.dto.CouponRequest;
import com.marketplacesystem.dto.CouponResponse;
import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.entity.Coupon;
import com.marketplacesystem.entity.CouponType;
import com.marketplacesystem.entity.CouponUsage;
import com.marketplacesystem.entity.User;
import com.marketplacesystem.exception.BadRequestException;
import com.marketplacesystem.exception.ConflictException;
import com.marketplacesystem.exception.ResourceNotFoundException;
import com.marketplacesystem.mapper.CouponMapper;
import com.marketplacesystem.repository.CouponRepository;
import com.marketplacesystem.repository.CouponUsageRepository;
import com.marketplacesystem.service.CouponService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class CouponServiceImpl implements CouponService {

    private final CouponRepository couponRepository;
    private final CouponUsageRepository couponUsageRepository;
    private final CouponMapper couponMapper;

    public CouponServiceImpl(CouponRepository couponRepository,
                             CouponUsageRepository couponUsageRepository,
                             CouponMapper couponMapper) {
        this.couponRepository = couponRepository;
        this.couponUsageRepository = couponUsageRepository;
        this.couponMapper = couponMapper;
    }

    @Override
    @Transactional
    public CouponResponse createCoupon(CouponRequest request) {
        String code = request.code().trim().toUpperCase();
        if (couponRepository.existsByCode(code)) {
            throw new ConflictException("A coupon with code '" + code + "' already exists");
        }
        Coupon coupon = new Coupon();
        coupon.setCode(code);
        coupon.setType(request.type());
        coupon.setValue(request.value());
        coupon.setMinOrderAmount(request.minOrderAmount());
        coupon.setMaxDiscountAmount(request.maxDiscountAmount());
        coupon.setValidFrom(request.validFrom());
        coupon.setValidUntil(request.validUntil());
        coupon.setMaxUses(request.maxUses());
        coupon.setActive(request.active() == null || request.active());
        couponRepository.save(coupon);
        return couponMapper.toResponse(coupon);
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<CouponResponse> getAllCoupons(Pageable pageable) {
        Page<Coupon> page = couponRepository.findAll(pageable);
        List<CouponResponse> content = page.getContent().stream()
                .map(couponMapper::toResponse)
                .toList();
        return new PagedResponse<>(content, page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages(), page.isLast());
    }

    @Override
    @Transactional(readOnly = true)
    public CouponResponse getCouponById(Long id) {
        return couponMapper.toResponse(findCoupon(id));
    }

    @Override
    @Transactional
    public CouponResponse updateCoupon(Long id, CouponRequest request) {
        Coupon coupon = findCoupon(id);
        String code = request.code().trim().toUpperCase();
        if (couponRepository.existsByCodeAndIdNot(code, id)) {
            throw new ConflictException("A coupon with code '" + code + "' already exists");
        }
        coupon.setCode(code);
        coupon.setType(request.type());
        coupon.setValue(request.value());
        coupon.setMinOrderAmount(request.minOrderAmount());
        coupon.setMaxDiscountAmount(request.maxDiscountAmount());
        coupon.setValidFrom(request.validFrom());
        coupon.setValidUntil(request.validUntil());
        coupon.setMaxUses(request.maxUses());
        coupon.setActive(request.active() == null || request.active());
        couponRepository.save(coupon);
        return couponMapper.toResponse(coupon);
    }

    @Override
    @Transactional
    public void deleteCoupon(Long id) {
        Coupon coupon = findCoupon(id);
        couponUsageRepository.deleteByCouponId(coupon.getId());
        couponRepository.delete(coupon);
    }

    @Override
    @Transactional(readOnly = true)
    public CouponCheckResponse checkCoupon(String code, BigDecimal cartTotal, User user) {
        Coupon coupon = findByCode(code);
        String message = validate(coupon, user, cartTotal);
        if (message != null) {
            return new CouponCheckResponse(false, message, coupon.getCode(), BigDecimal.ZERO);
        }
        BigDecimal discount = computeDiscount(coupon, cartTotal == null ? BigDecimal.ZERO : cartTotal);
        return new CouponCheckResponse(true, "Coupon applied successfully", coupon.getCode(), discount);
    }

    @Override
    @Transactional
    public BigDecimal validateAndApply(String code, User user, BigDecimal orderTotal) {
        Coupon coupon = findByCode(code);
        String message = validate(coupon, user, orderTotal);
        if (message != null) {
            throw new BadRequestException(message);
        }
        BigDecimal discount = computeDiscount(coupon, orderTotal);
        coupon.setUsedCount(coupon.getUsedCount() + 1);
        couponRepository.save(coupon);

        CouponUsage usage = new CouponUsage();
        usage.setCoupon(coupon);
        usage.setUser(user);
        couponUsageRepository.save(usage);
        return discount;
    }

    private String validate(Coupon coupon, User user, BigDecimal orderTotal) {
        LocalDateTime now = LocalDateTime.now();
        if (!Boolean.TRUE.equals(coupon.getActive())) {
            return "Coupon '" + coupon.getCode() + "' is not active";
        }
        if (coupon.getValidFrom() != null && now.isBefore(coupon.getValidFrom())) {
            return "Coupon '" + coupon.getCode() + "' is not yet valid";
        }
        if (coupon.getValidUntil() != null && now.isAfter(coupon.getValidUntil())) {
            return "Coupon '" + coupon.getCode() + "' has expired";
        }
        if (coupon.getMaxUses() != null && coupon.getUsedCount() >= coupon.getMaxUses()) {
            return "Coupon '" + coupon.getCode() + "' has reached its usage limit";
        }
        if (couponUsageRepository.existsByCouponIdAndUserId(coupon.getId(), user.getId())) {
            return "You have already used coupon '" + coupon.getCode() + "'";
        }
        if (orderTotal != null && coupon.getMinOrderAmount() != null
                && orderTotal.compareTo(coupon.getMinOrderAmount()) < 0) {
            return "Order total must be at least " + coupon.getMinOrderAmount()
                    + " to use coupon '" + coupon.getCode() + "'";
        }
        return null;
    }

    private BigDecimal computeDiscount(Coupon coupon, BigDecimal orderTotal) {
        BigDecimal discount;
        if (coupon.getType() == CouponType.PERCENT) {
            discount = orderTotal.multiply(coupon.getValue())
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        } else {
            discount = coupon.getValue();
        }
        if (coupon.getMaxDiscountAmount() != null && discount.compareTo(coupon.getMaxDiscountAmount()) > 0) {
            discount = coupon.getMaxDiscountAmount();
        }
        if (discount.compareTo(orderTotal) > 0) {
            discount = orderTotal;
        }
        return discount;
    }

    private Coupon findByCode(String code) {
        if (code == null || code.isBlank()) {
            throw new BadRequestException("Coupon code is required");
        }
        return couponRepository.findByCode(code.trim().toUpperCase())
                .orElseThrow(() -> new BadRequestException("Coupon '" + code.trim().toUpperCase() + "' does not exist"));
    }

    private Coupon findCoupon(Long id) {
        return couponRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Coupon not found with id: " + id));
    }
}
