package com.marketplacesystem.controller;

import com.marketplacesystem.dto.ApiResponse;
import com.marketplacesystem.dto.CheckoutRequest;
import com.marketplacesystem.dto.OrderResponse;
import com.marketplacesystem.dto.OrderStatusRequest;
import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.entity.OrderStatus;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.OrderService;
import com.marketplacesystem.util.AppConstants;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(AppConstants.API_VERSION_1 + "/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping
    public ResponseEntity<ApiResponse<OrderResponse>> checkout(
            @Valid @RequestBody CheckoutRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        OrderResponse response = orderService.createOrderFromCart(request, principal);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(response, "Order placed successfully"));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<OrderResponse>>> getMyOrders(
            @RequestParam(required = false) OrderStatus status,
            @AuthenticationPrincipal UserPrincipal principal,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(orderService.getMyOrders(principal, status, pageable)));
    }

    @GetMapping("/seller")
    @PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<PagedResponse<OrderResponse>>> getSellerOrders(
            @RequestParam(required = false) OrderStatus status,
            @AuthenticationPrincipal UserPrincipal principal,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(orderService.getSellerOrders(principal, status, pageable)));
    }

    @GetMapping("/admin")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<PagedResponse<OrderResponse>>> getAllOrders(
            @RequestParam(required = false) OrderStatus status,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(orderService.getAllOrders(status, pageable)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<OrderResponse>> getOrderById(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(orderService.getOrderById(id, principal)));
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<ApiResponse<OrderResponse>> updateOrderStatus(
            @PathVariable Long id,
            @Valid @RequestBody OrderStatusRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        OrderResponse response = orderService.updateOrderStatus(id, request, principal);
        return ResponseEntity.ok(ApiResponse.success(response, "Order status updated"));
    }
}
