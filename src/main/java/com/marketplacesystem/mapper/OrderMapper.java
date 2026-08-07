package com.marketplacesystem.mapper;

import com.marketplacesystem.dto.OrderItemResponse;
import com.marketplacesystem.dto.OrderResponse;
import com.marketplacesystem.entity.Order;
import com.marketplacesystem.entity.OrderItem;
import com.marketplacesystem.entity.User;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class OrderMapper {

    public OrderResponse toResponse(Order order) {
        User customer = order.getUser();
        List<OrderItemResponse> items = order.getItems().stream()
                .map(this::toItemResponse)
                .toList();
        return new OrderResponse(
                order.getId(),
                order.getOrderNumber(),
                order.getStatus(),
                order.getTotalAmount(),
                order.getDiscountAmount(),
                order.getCouponCode(),
                order.getShippingAddress(),
                order.getCity(),
                order.getPostalCode(),
                order.getCountry(),
                customer.getId(),
                customer.getFirstName() + " " + customer.getLastName(),
                items,
                order.getCreatedAt(),
                order.getUpdatedAt());
    }

    private OrderItemResponse toItemResponse(OrderItem item) {
        return new OrderItemResponse(
                item.getId(),
                item.getProduct().getId(),
                item.getProductName(),
                item.getUnitPrice(),
                item.getQuantity(),
                item.getSubtotal());
    }
}
