package com.marketplacesystem.repository;

import com.marketplacesystem.entity.CartItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CartItemRepository extends JpaRepository<CartItem, Long> {

    List<CartItem> findByUserIdOrderByCreatedAtAsc(Long userId);

    Optional<CartItem> findByUserIdAndProductId(Long userId, Long productId);

    void deleteByProductId(Long productId);
}
