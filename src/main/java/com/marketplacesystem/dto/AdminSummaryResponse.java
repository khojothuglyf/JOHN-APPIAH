package com.marketplacesystem.dto;

import java.math.BigDecimal;

public record AdminSummaryResponse(
        long totalUsers,
        long totalSellers,
        long totalCustomers,
        long totalProducts,
        long activeProducts,
        long lowStockProducts,
        long totalOrders,
        long pendingOrders,
        long shippedOrders,
        long deliveredOrders,
        long cancelledOrders,
        long totalReviews,
        long completedPayments,
        BigDecimal totalRevenue) {
}
