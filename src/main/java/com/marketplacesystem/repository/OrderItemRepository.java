package com.marketplacesystem.repository;

import com.marketplacesystem.entity.OrderItem;
import com.marketplacesystem.entity.OrderStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface OrderItemRepository extends JpaRepository<OrderItem, Long> {

    boolean existsByProductId(Long productId);

    boolean existsByProductIdAndOrderUserIdAndOrderStatus(Long productId, Long userId, OrderStatus status);

    @Query("select o.product.id, o.product.name, sum(o.quantity), sum(o.subtotal) "
            + "from OrderItem o where o.order.status <> :excluded "
            + "group by o.product.id, o.product.name order by sum(o.quantity) desc")
    List<Object[]> findTopProducts(@Param("excluded") OrderStatus excluded, Pageable pageable);

    @Query("select o.product.category.id, o.product.category.name, sum(o.quantity), sum(o.subtotal) "
            + "from OrderItem o where o.order.status <> :excluded "
            + "group by o.product.category.id, o.product.category.name order by sum(o.subtotal) desc")
    List<Object[]> findSalesByCategory(@Param("excluded") OrderStatus excluded);

    @Query("select count(distinct o.order.id) from OrderItem o "
            + "where o.product.seller.id = :sellerId and o.order.status = :status")
    long countDistinctOrdersForSeller(@Param("sellerId") Long sellerId, @Param("status") OrderStatus status);

    @Query("select coalesce(sum(o.quantity), 0) from OrderItem o "
            + "where o.product.seller.id = :sellerId and o.order.status <> :excluded")
    long sumQuantityForSeller(@Param("sellerId") Long sellerId, @Param("excluded") OrderStatus excluded);

    @Query("select coalesce(sum(o.subtotal), 0) from OrderItem o "
            + "where o.product.seller.id = :sellerId and o.order.status <> :excluded")
    BigDecimal sumRevenueForSeller(@Param("sellerId") Long sellerId, @Param("excluded") OrderStatus excluded);

    @Query("select o.product.id, o.product.name, sum(o.quantity), sum(o.subtotal) "
            + "from OrderItem o where o.product.seller.id = :sellerId and o.order.status <> :excluded "
            + "group by o.product.id, o.product.name order by sum(o.quantity) desc")
    List<Object[]> findTopProductsForSeller(@Param("sellerId") Long sellerId,
                                            @Param("excluded") OrderStatus excluded,
                                            Pageable pageable);

    @Query("select o.product.category.id, o.product.category.name, sum(o.quantity), sum(o.subtotal) "
            + "from OrderItem o where o.product.seller.id = :sellerId and o.order.status <> :excluded "
            + "group by o.product.category.id, o.product.category.name order by sum(o.subtotal) desc")
    List<Object[]> findSalesByCategoryForSeller(@Param("sellerId") Long sellerId,
                                                @Param("excluded") OrderStatus excluded);

    @Query("select function('date', o.order.createdAt), sum(o.subtotal) from OrderItem o "
            + "where o.product.seller.id = :sellerId and o.order.status <> :excluded and o.order.createdAt >= :start "
            + "group by function('date', o.order.createdAt) order by function('date', o.order.createdAt)")
    List<Object[]> findRevenueTimelineForSeller(@Param("sellerId") Long sellerId,
                                                @Param("excluded") OrderStatus excluded,
                                                @Param("start") java.time.LocalDateTime start);
}
