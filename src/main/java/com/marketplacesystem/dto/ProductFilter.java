package com.marketplacesystem.dto;

import java.math.BigDecimal;

public record ProductFilter(
        String keyword,
        Long categoryId,
        Long sellerId,
        BigDecimal minPrice,
        BigDecimal maxPrice,
        Boolean inStock) {
}
