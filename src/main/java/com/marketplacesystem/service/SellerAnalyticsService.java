package com.marketplacesystem.service;

import com.marketplacesystem.dto.CategorySalesResponse;
import com.marketplacesystem.dto.RevenuePointResponse;
import com.marketplacesystem.dto.SellerSummaryResponse;
import com.marketplacesystem.dto.TopProductResponse;
import com.marketplacesystem.security.UserPrincipal;

import java.util.List;

public interface SellerAnalyticsService {

    SellerSummaryResponse getSummary(UserPrincipal principal);

    List<TopProductResponse> getTopProducts(UserPrincipal principal, int limit);

    List<CategorySalesResponse> getSalesByCategory(UserPrincipal principal);

    List<RevenuePointResponse> getRevenueTimeline(UserPrincipal principal, int days);
}
