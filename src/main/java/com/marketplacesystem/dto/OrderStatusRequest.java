package com.marketplacesystem.dto;

import com.marketplacesystem.entity.OrderStatus;
import jakarta.validation.constraints.NotNull;

public record OrderStatusRequest(
        @NotNull(message = "Status is required")
        OrderStatus status) {
}
