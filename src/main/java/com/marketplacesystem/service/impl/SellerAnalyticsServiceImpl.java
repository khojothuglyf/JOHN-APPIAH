package com.marketplacesystem.service.impl;

import com.marketplacesystem.dto.CategorySalesResponse;
import com.marketplacesystem.dto.RevenuePointResponse;
import com.marketplacesystem.dto.SellerSummaryResponse;
import com.marketplacesystem.dto.TopProductResponse;
import com.marketplacesystem.entity.OrderStatus;
import com.marketplacesystem.entity.ProductStatus;
import com.marketplacesystem.repository.OrderItemRepository;
import com.marketplacesystem.repository.ProductRepository;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.SellerAnalyticsService;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

@Service
public class SellerAnalyticsServiceImpl implements SellerAnalyticsService {

    private static final int LOW_STOCK_THRESHOLD = 10;

    private final ProductRepository productRepository;
    private final OrderItemRepository orderItemRepository;

    public SellerAnalyticsServiceImpl(ProductRepository productRepository,
                                      OrderItemRepository orderItemRepository) {
        this.productRepository = productRepository;
        this.orderItemRepository = orderItemRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public SellerSummaryResponse getSummary(UserPrincipal principal) {
        Long sellerId = principal.getId();
        double averageRating = Math.round(
                productRepository.averageRatingForSeller(sellerId) * 10.0) / 10.0;

        return new SellerSummaryResponse(
                productRepository.countBySellerId(sellerId),
                productRepository.countBySellerIdAndStatus(sellerId, ProductStatus.ACTIVE),
                productRepository.countBySellerIdAndStockLessThan(sellerId, LOW_STOCK_THRESHOLD),
                orderItemRepository.countDistinctOrdersForSeller(sellerId, OrderStatus.PENDING)
                        + orderItemRepository.countDistinctOrdersForSeller(sellerId, OrderStatus.CONFIRMED)
                        + orderItemRepository.countDistinctOrdersForSeller(sellerId, OrderStatus.SHIPPED)
                        + orderItemRepository.countDistinctOrdersForSeller(sellerId, OrderStatus.DELIVERED)
                        + orderItemRepository.countDistinctOrdersForSeller(sellerId, OrderStatus.CANCELLED),
                orderItemRepository.countDistinctOrdersForSeller(sellerId, OrderStatus.PENDING),
                orderItemRepository.countDistinctOrdersForSeller(sellerId, OrderStatus.SHIPPED),
                orderItemRepository.countDistinctOrdersForSeller(sellerId, OrderStatus.DELIVERED),
                orderItemRepository.countDistinctOrdersForSeller(sellerId, OrderStatus.CANCELLED),
                orderItemRepository.sumQuantityForSeller(sellerId, OrderStatus.CANCELLED),
                orderItemRepository.sumRevenueForSeller(sellerId, OrderStatus.CANCELLED),
                averageRating);
    }

    @Override
    @Transactional(readOnly = true)
    public List<TopProductResponse> getTopProducts(UserPrincipal principal, int limit) {
        int safeLimit = Math.min(Math.max(limit, 1), 50);
        List<Object[]> rows = orderItemRepository.findTopProductsForSeller(
                principal.getId(), OrderStatus.CANCELLED, PageRequest.of(0, safeLimit));
        List<TopProductResponse> result = new ArrayList<>();
        for (Object[] row : rows) {
            result.add(new TopProductResponse(
                    ((Number) row[0]).longValue(),
                    (String) row[1],
                    ((Number) row[2]).longValue(),
                    (BigDecimal) row[3]));
        }
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public List<CategorySalesResponse> getSalesByCategory(UserPrincipal principal) {
        List<Object[]> rows = orderItemRepository.findSalesByCategoryForSeller(principal.getId(), OrderStatus.CANCELLED);
        List<CategorySalesResponse> result = new ArrayList<>();
        for (Object[] row : rows) {
            result.add(new CategorySalesResponse(
                    ((Number) row[0]).longValue(),
                    (String) row[1],
                    ((Number) row[2]).longValue(),
                    (BigDecimal) row[3]));
        }
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public List<RevenuePointResponse> getRevenueTimeline(UserPrincipal principal, int days) {
        int safeDays = Math.min(Math.max(days, 1), 365);
        LocalDateTime start = LocalDate.now(ZoneOffset.UTC).atStartOfDay().minusDays(safeDays - 1L);
        List<Object[]> rows = orderItemRepository.findRevenueTimelineForSeller(
                principal.getId(), OrderStatus.CANCELLED, start);
        List<RevenuePointResponse> result = new ArrayList<>();
        for (Object[] row : rows) {
            java.sql.Date date = (java.sql.Date) row[0];
            result.add(new RevenuePointResponse(date.toLocalDate(), (BigDecimal) row[1]));
        }
        return result;
    }
}
