package com.marketplacesystem.service;

import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.dto.WishlistItemResponse;
import com.marketplacesystem.security.UserPrincipal;
import org.springframework.data.domain.Pageable;

public interface WishlistService {

    PagedResponse<WishlistItemResponse> getMyWishlist(UserPrincipal principal, Pageable pageable);

    WishlistItemResponse addToWishlist(Long productId, UserPrincipal principal);

    void removeFromWishlist(Long productId, UserPrincipal principal);

    boolean isInWishlist(Long productId, UserPrincipal principal);
}
