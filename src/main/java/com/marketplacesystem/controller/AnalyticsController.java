package com.marketplacesystem.controller;

import com.marketplacesystem.dto.AdminSummaryResponse;
import com.marketplacesystem.dto.ApiResponse;
import com.marketplacesystem.dto.CategorySalesResponse;
import com.marketplacesystem.dto.RevenuePointResponse;
import com.marketplacesystem.dto.TopProductResponse;
import com.marketplacesystem.service.AnalyticsService;
import com.marketplacesystem.util.AppConstants;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping(AppConstants.API_VERSION_1 + "/admin/analytics")
@PreAuthorize("hasRole('ADMIN')")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping("/summary")
    public ResponseEntity<ApiResponse<AdminSummaryResponse>> getSummary() {
        return ResponseEntity.ok(ApiResponse.success(analyticsService.getSummary()));
    }

    @GetMapping("/top-products")
    public ResponseEntity<ApiResponse<List<TopProductResponse>>> getTopProducts(
            @RequestParam(defaultValue = "10") int limit) {
        return ResponseEntity.ok(ApiResponse.success(analyticsService.getTopProducts(limit)));
    }

    @GetMapping("/sales-by-category")
    public ResponseEntity<ApiResponse<List<CategorySalesResponse>>> getSalesByCategory() {
        return ResponseEntity.ok(ApiResponse.success(analyticsService.getSalesByCategory()));
    }

    @GetMapping("/revenue-timeline")
    public ResponseEntity<ApiResponse<List<RevenuePointResponse>>> getRevenueTimeline(
            @RequestParam(defaultValue = "30") int days) {
        return ResponseEntity.ok(ApiResponse.success(analyticsService.getRevenueTimeline(days)));
    }
}
