package com.marketplacesystem.service;

import com.marketplacesystem.dto.CheckoutRequest;
import com.marketplacesystem.dto.OrderResponse;
import com.marketplacesystem.dto.OrderStatusRequest;
import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.entity.OrderStatus;
import com.marketplacesystem.security.UserPrincipal;
import org.springframework.data.domain.Pageable;

public interface OrderService {

    OrderResponse createOrderFromCart(CheckoutRequest request, UserPrincipal principal);

    PagedResponse<OrderResponse> getMyOrders(UserPrincipal principal, OrderStatus status, Pageable pageable);

    PagedResponse<OrderResponse> getSellerOrders(UserPrincipal principal, OrderStatus status, Pageable pageable);

    PagedResponse<OrderResponse> getAllOrders(OrderStatus status, Pageable pageable);

    OrderResponse getOrderById(Long id, UserPrincipal principal);

    OrderResponse updateOrderStatus(Long id, OrderStatusRequest request, UserPrincipal principal);
}
