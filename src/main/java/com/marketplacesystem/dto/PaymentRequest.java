package com.marketplacesystem.dto;

import com.marketplacesystem.entity.PaymentMethod;
import jakarta.validation.constraints.NotNull;

public record PaymentRequest(
        @NotNull(message = "Payment method is required")
        PaymentMethod method) {
}
