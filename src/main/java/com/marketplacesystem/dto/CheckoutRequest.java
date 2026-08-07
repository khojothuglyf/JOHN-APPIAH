package com.marketplacesystem.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CheckoutRequest(
        @NotBlank(message = "Shipping address is required")
        @Size(max = 255, message = "Shipping address must not exceed 255 characters")
        String shippingAddress,

        @NotBlank(message = "City is required")
        @Size(max = 100, message = "City must not exceed 100 characters")
        String city,

        @Size(max = 20, message = "Postal code must not exceed 20 characters")
        String postalCode,

        @Size(max = 100, message = "Country must not exceed 100 characters")
        String country,

        @Size(max = 50, message = "Coupon code must not exceed 50 characters")
        String couponCode) {
}
