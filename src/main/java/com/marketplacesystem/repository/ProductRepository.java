package com.marketplacesystem.repository;

import com.marketplacesystem.entity.Product;
import com.marketplacesystem.entity.ProductStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<Product, Long>, JpaSpecificationExecutor<Product> {

    boolean existsBySku(String sku);

    boolean existsBySkuAndIdNot(String sku, Long id);

    boolean existsByCategoryId(Long categoryId);

    @EntityGraph(attributePaths = {"category", "seller"})
    @Override
    Page<Product> findAll(Specification<Product> spec, Pageable pageable);

    @EntityGraph(attributePaths = {"category", "seller"})
    Page<Product> findBySellerId(Long sellerId, Pageable pageable);

    long countByStatus(ProductStatus status);

    long countByStockLessThan(int threshold);

    long countBySellerId(Long sellerId);

    long countBySellerIdAndStatus(Long sellerId, ProductStatus status);

    long countBySellerIdAndStockLessThan(Long sellerId, int threshold);

    @Query("select coalesce(avg(p.averageRating), 0) from Product p where p.seller.id = :sellerId")
    double averageRatingForSeller(@Param("sellerId") Long sellerId);
}
