package com.marketplacesystem.mapper;

import com.marketplacesystem.dto.CartItemResponse;
import com.marketplacesystem.entity.CartItem;
import com.marketplacesystem.entity.Product;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
public class CartMapper {

    public CartItemResponse toResponse(CartItem item) {
        Product product = item.getProduct();
        BigDecimal unitPrice = product.getPrice();
        BigDecimal subtotal = unitPrice.multiply(BigDecimal.valueOf(item.getQuantity()));
        return new CartItemResponse(
                item.getId(),
                product.getId(),
                product.getName(),
                unitPrice,
                item.getQuantity(),
                subtotal,
                product.getImageUrl(),
                product.getSeller().getId(),
                item.getCreatedAt());
    }
}
