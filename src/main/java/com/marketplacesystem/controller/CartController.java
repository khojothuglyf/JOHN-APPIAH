package com.marketplacesystem.controller;

import com.marketplacesystem.dto.ApiResponse;
import com.marketplacesystem.dto.CartItemRequest;
import com.marketplacesystem.dto.CartResponse;
import com.marketplacesystem.dto.UpdateQuantityRequest;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.CartService;
import com.marketplacesystem.util.AppConstants;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(AppConstants.API_VERSION_1 + "/cart")
public class CartController {

    private final CartService cartService;

    public CartController(CartService cartService) {
        this.cartService = cartService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<CartResponse>> getCart(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(cartService.getCart(principal)));
    }

    @PostMapping("/items")
    public ResponseEntity<ApiResponse<CartResponse>> addToCart(
            @Valid @RequestBody CartItemRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        CartResponse response = cartService.addToCart(request, principal);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(response, "Item added to cart"));
    }

    @PutMapping("/items/{cartItemId}")
    public ResponseEntity<ApiResponse<CartResponse>> updateQuantity(
            @PathVariable Long cartItemId,
            @Valid @RequestBody UpdateQuantityRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(cartService.updateQuantity(cartItemId, request, principal), "Cart updated"));
    }

    @DeleteMapping("/items/{cartItemId}")
    public ResponseEntity<ApiResponse<CartResponse>> removeFromCart(
            @PathVariable Long cartItemId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(cartService.removeFromCart(cartItemId, principal), "Item removed from cart"));
    }

    @DeleteMapping
    public ResponseEntity<ApiResponse<Void>> clearCart(@AuthenticationPrincipal UserPrincipal principal) {
        cartService.clearCart(principal);
        return ResponseEntity.ok(ApiResponse.success(null, "Cart cleared"));
    }
}
