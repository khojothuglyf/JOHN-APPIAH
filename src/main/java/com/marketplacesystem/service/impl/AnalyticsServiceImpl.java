package com.marketplacesystem.service.impl;

import com.marketplacesystem.dto.AdminSummaryResponse;
import com.marketplacesystem.dto.CategorySalesResponse;
import com.marketplacesystem.dto.RevenuePointResponse;
import com.marketplacesystem.dto.TopProductResponse;
import com.marketplacesystem.entity.OrderStatus;
import com.marketplacesystem.entity.PaymentStatus;
import com.marketplacesystem.entity.ProductStatus;
import com.marketplacesystem.entity.RoleName;
import com.marketplacesystem.repository.OrderItemRepository;
import com.marketplacesystem.repository.OrderRepository;
import com.marketplacesystem.repository.PaymentRepository;
import com.marketplacesystem.repository.ProductRepository;
import com.marketplacesystem.repository.ReviewRepository;
import com.marketplacesystem.repository.UserRepository;
import com.marketplacesystem.service.AnalyticsService;
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
public class AnalyticsServiceImpl implements AnalyticsService {

    private static final int LOW_STOCK_THRESHOLD = 10;

    private final UserRepository userRepository;
    private final ProductRepository productRepository;
    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final PaymentRepository paymentRepository;
    private final ReviewRepository reviewRepository;

    public AnalyticsServiceImpl(UserRepository userRepository,
                                ProductRepository productRepository,
                                OrderRepository orderRepository,
                                OrderItemRepository orderItemRepository,
                                PaymentRepository paymentRepository,
                                ReviewRepository reviewRepository) {
        this.userRepository = userRepository;
        this.productRepository = productRepository;
        this.orderRepository = orderRepository;
        this.orderItemRepository = orderItemRepository;
        this.paymentRepository = paymentRepository;
        this.reviewRepository = reviewRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public AdminSummaryResponse getSummary() {
        return new AdminSummaryResponse(
                userRepository.count(),
                userRepository.countByRoleName(RoleName.SELLER),
                userRepository.countByRoleName(RoleName.CUSTOMER),
                productRepository.count(),
                productRepository.countByStatus(ProductStatus.ACTIVE),
                productRepository.countByStockLessThan(LOW_STOCK_THRESHOLD),
                orderRepository.count(),
                orderRepository.countByStatus(OrderStatus.PENDING),
                orderRepository.countByStatus(OrderStatus.SHIPPED),
                orderRepository.countByStatus(OrderStatus.DELIVERED),
                orderRepository.countByStatus(OrderStatus.CANCELLED),
                reviewRepository.count(),
                paymentRepository.countByStatus(PaymentStatus.COMPLETED),
                paymentRepository.sumAmountByStatus(PaymentStatus.COMPLETED));
    }

    @Override
    @Transactional(readOnly = true)
    public List<TopProductResponse> getTopProducts(int limit) {
        int safeLimit = Math.min(Math.max(limit, 1), 50);
        List<Object[]> rows = orderItemRepository.findTopProducts(
                OrderStatus.CANCELLED, PageRequest.of(0, safeLimit));
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
    public List<CategorySalesResponse> getSalesByCategory() {
        List<Object[]> rows = orderItemRepository.findSalesByCategory(OrderStatus.CANCELLED);
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
    public List<RevenuePointResponse> getRevenueTimeline(int days) {
        int safeDays = Math.min(Math.max(days, 1), 365);
        LocalDateTime start = LocalDate.now(ZoneOffset.UTC).atStartOfDay().minusDays(safeDays - 1L);
        List<Object[]> rows = paymentRepository.findRevenueTimeline(PaymentStatus.COMPLETED, start);
        List<RevenuePointResponse> result = new ArrayList<>();
        for (Object[] row : rows) {
            java.sql.Date date = (java.sql.Date) row[0];
            result.add(new RevenuePointResponse(date.toLocalDate(), (BigDecimal) row[1]));
        }
        return result;
    }
}
