package com.marketplacesystem.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record RevenuePointResponse(
        LocalDate date,
        BigDecimal amount) {
}
