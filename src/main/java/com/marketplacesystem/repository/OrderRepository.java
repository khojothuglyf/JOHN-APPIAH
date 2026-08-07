package com.marketplacesystem.repository;

import com.marketplacesystem.entity.Order;
import com.marketplacesystem.entity.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<Order, Long> {

    boolean existsByOrderNumber(String orderNumber);

    @EntityGraph(attributePaths = {"user", "items", "items.product"})
    @Override
    Page<Order> findAll(Pageable pageable);

    @EntityGraph(attributePaths = {"user", "items", "items.product"})
    Page<Order> findByUserId(Long userId, Pageable pageable);

    @EntityGraph(attributePaths = {"user", "items", "items.product"})
    Page<Order> findByUserIdAndStatus(Long userId, OrderStatus status, Pageable pageable);

    @EntityGraph(attributePaths = {"user", "items", "items.product"})
    Page<Order> findDistinctByItemsProductSellerId(Long sellerId, Pageable pageable);

    @EntityGraph(attributePaths = {"user", "items", "items.product"})
    Page<Order> findDistinctByItemsProductSellerIdAndStatus(Long sellerId, OrderStatus status, Pageable pageable);

    @EntityGraph(attributePaths = {"user", "items", "items.product"})
    Page<Order> findByStatus(OrderStatus status, Pageable pageable);

    long countByStatus(OrderStatus status);
}
