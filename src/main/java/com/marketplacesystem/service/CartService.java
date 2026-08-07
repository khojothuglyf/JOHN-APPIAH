package com.marketplacesystem.service;

import com.marketplacesystem.dto.CartItemRequest;
import com.marketplacesystem.dto.CartResponse;
import com.marketplacesystem.dto.UpdateQuantityRequest;
import com.marketplacesystem.security.UserPrincipal;

public interface CartService {

    CartResponse getCart(UserPrincipal principal);

    CartResponse addToCart(CartItemRequest request, UserPrincipal principal);

    CartResponse updateQuantity(Long cartItemId, UpdateQuantityRequest request, UserPrincipal principal);

    CartResponse removeFromCart(Long cartItemId, UserPrincipal principal);

    void clearCart(UserPrincipal principal);
}
