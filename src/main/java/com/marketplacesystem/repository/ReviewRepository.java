package com.marketplacesystem.repository;

import com.marketplacesystem.entity.Review;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ReviewRepository extends JpaRepository<Review, Long> {

    @EntityGraph(attributePaths = {"product", "user"})
    Page<Review> findByProductId(Long productId, Pageable pageable);

    @EntityGraph(attributePaths = {"product", "user"})
    Page<Review> findByUserId(Long userId, Pageable pageable);

    List<Review> findByProductId(Long productId);

    Optional<Review> findByProductIdAndUserId(Long productId, Long userId);

    boolean existsByProductIdAndUserId(Long productId, Long userId);
}
