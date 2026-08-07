package com.marketplacesystem.controller;

import com.marketplacesystem.dto.ApiResponse;
import com.marketplacesystem.dto.CouponCheckResponse;
import com.marketplacesystem.dto.CouponRequest;
import com.marketplacesystem.dto.CouponResponse;
import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.CouponService;
import com.marketplacesystem.util.AppConstants;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;

@RestController
@RequestMapping(AppConstants.API_VERSION_1)
public class CouponController {

    private final CouponService couponService;

    public CouponController(CouponService couponService) {
        this.couponService = couponService;
    }

    @PostMapping("/admin/coupons")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<CouponResponse>> createCoupon(
            @Valid @RequestBody CouponRequest request) {
        CouponResponse response = couponService.createCoupon(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(response, "Coupon created successfully"));
    }

    @GetMapping("/admin/coupons")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<PagedResponse<CouponResponse>>> getAllCoupons(
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(couponService.getAllCoupons(pageable)));
    }

    @GetMapping("/admin/coupons/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<CouponResponse>> getCouponById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(couponService.getCouponById(id)));
    }

    @PutMapping("/admin/coupons/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<CouponResponse>> updateCoupon(
            @PathVariable Long id,
            @Valid @RequestBody CouponRequest request) {
        CouponResponse response = couponService.updateCoupon(id, request);
        return ResponseEntity.ok(ApiResponse.success(response, "Coupon updated successfully"));
    }

    @DeleteMapping("/admin/coupons/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteCoupon(@PathVariable Long id) {
        couponService.deleteCoupon(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Coupon deleted successfully"));
    }

    @GetMapping("/coupons/check")
    public ResponseEntity<ApiResponse<CouponCheckResponse>> checkCoupon(
            @RequestParam String code,
            @RequestParam(required = false) BigDecimal cartTotal,
            @AuthenticationPrincipal UserPrincipal principal) {
        CouponCheckResponse response = couponService.checkCoupon(code, cartTotal, principal.getUser());
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
