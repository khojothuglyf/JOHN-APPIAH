package com.marketplacesystem.repository;

import com.marketplacesystem.entity.WishlistItem;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface WishlistItemRepository extends JpaRepository<WishlistItem, Long> {

    @EntityGraph(attributePaths = {"product", "product.seller"})
    Page<WishlistItem> findByUserId(Long userId, Pageable pageable);

    Optional<WishlistItem> findByUserIdAndProductId(Long userId, Long productId);

    boolean existsByUserIdAndProductId(Long userId, Long productId);

    void deleteByProductId(Long productId);
}
