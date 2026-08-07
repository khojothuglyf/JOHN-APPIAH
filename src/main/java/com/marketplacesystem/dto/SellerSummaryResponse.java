package com.marketplacesystem.dto;

import java.math.BigDecimal;

public record SellerSummaryResponse(
        long totalProducts,
        long activeProducts,
        long lowStockProducts,
        long totalOrders,
        long pendingOrders,
        long shippedOrders,
        long deliveredOrders,
        long cancelledOrders,
        long totalItemsSold,
        BigDecimal totalRevenue,
        Double averageRating) {
}
