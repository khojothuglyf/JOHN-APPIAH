package com.marketplacesystem.dto;

import java.math.BigDecimal;

public record TopProductResponse(
        Long productId,
        String productName,
        Long quantitySold,
        BigDecimal revenue) {
}
