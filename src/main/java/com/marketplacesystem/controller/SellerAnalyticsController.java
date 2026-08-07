package com.marketplacesystem.controller;

import com.marketplacesystem.dto.ApiResponse;
import com.marketplacesystem.dto.CategorySalesResponse;
import com.marketplacesystem.dto.RevenuePointResponse;
import com.marketplacesystem.dto.SellerSummaryResponse;
import com.marketplacesystem.dto.TopProductResponse;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.SellerAnalyticsService;
import com.marketplacesystem.util.AppConstants;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping(AppConstants.API_VERSION_1 + "/seller/analytics")
@PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
public class SellerAnalyticsController {

    private final SellerAnalyticsService sellerAnalyticsService;

    public SellerAnalyticsController(SellerAnalyticsService sellerAnalyticsService) {
        this.sellerAnalyticsService = sellerAnalyticsService;
    }

    @GetMapping("/summary")
    public ResponseEntity<ApiResponse<SellerSummaryResponse>> getSummary(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(sellerAnalyticsService.getSummary(principal)));
    }

    @GetMapping("/top-products")
    public ResponseEntity<ApiResponse<List<TopProductResponse>>> getTopProducts(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "10") int limit) {
        return ResponseEntity.ok(ApiResponse.success(sellerAnalyticsService.getTopProducts(principal, limit)));
    }

    @GetMapping("/sales-by-category")
    public ResponseEntity<ApiResponse<List<CategorySalesResponse>>> getSalesByCategory(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(sellerAnalyticsService.getSalesByCategory(principal)));
    }

    @GetMapping("/revenue-timeline")
    public ResponseEntity<ApiResponse<List<RevenuePointResponse>>> getRevenueTimeline(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "30") int days) {
        return ResponseEntity.ok(ApiResponse.success(sellerAnalyticsService.getRevenueTimeline(principal, days)));
    }
}
