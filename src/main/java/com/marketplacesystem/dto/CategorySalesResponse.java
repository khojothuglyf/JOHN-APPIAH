package com.marketplacesystem.dto;

import java.math.BigDecimal;

public record CategorySalesResponse(
        Long categoryId,
        String categoryName,
        Long quantitySold,
        BigDecimal revenue) {
}
