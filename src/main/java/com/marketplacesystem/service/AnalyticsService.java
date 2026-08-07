package com.marketplacesystem.service;

import com.marketplacesystem.dto.AdminSummaryResponse;
import com.marketplacesystem.dto.CategorySalesResponse;
import com.marketplacesystem.dto.RevenuePointResponse;
import com.marketplacesystem.dto.TopProductResponse;

import java.util.List;

public interface AnalyticsService {

    AdminSummaryResponse getSummary();

    List<TopProductResponse> getTopProducts(int limit);

    List<CategorySalesResponse> getSalesByCategory();

    List<RevenuePointResponse> getRevenueTimeline(int days);
}
