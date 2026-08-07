package com.marketplacesystem.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record CartItemRequest(
        @NotNull(message = "Product ID is required")
        @Positive(message = "Product ID must be a positive number")
        Long productId,

        @NotNull(message = "Quantity is required")
        @Min(value = 1, message = "Quantity must be at least 1")
        @Max(value = 1000, message = "Quantity cannot exceed 1000")
        Integer quantity) {
}
