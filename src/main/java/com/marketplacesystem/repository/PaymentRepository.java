package com.marketplacesystem.repository;

import com.marketplacesystem.entity.Payment;
import com.marketplacesystem.entity.PaymentStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    Optional<Payment> findByOrderId(Long orderId);

    @EntityGraph(attributePaths = {"order"})
    Page<Payment> findByUserId(Long userId, Pageable pageable);

    boolean existsByOrderId(Long orderId);

    boolean existsByTransactionRef(String transactionRef);

    @Query("select coalesce(sum(p.amount), 0) from Payment p where p.status = :status")
    BigDecimal sumAmountByStatus(@Param("status") PaymentStatus status);

    long countByStatus(PaymentStatus status);

    @Query("select function('date', p.paidAt), sum(p.amount) from Payment p "
            + "where p.status = :status and p.paidAt >= :start "
            + "group by function('date', p.paidAt) order by function('date', p.paidAt)")
    List<Object[]> findRevenueTimeline(@Param("status") PaymentStatus status, @Param("start") LocalDateTime start);
}
