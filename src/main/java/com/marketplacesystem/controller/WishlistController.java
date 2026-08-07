package com.marketplacesystem.controller;

import com.marketplacesystem.dto.ApiResponse;
import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.dto.WishlistItemResponse;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.WishlistService;
import com.marketplacesystem.util.AppConstants;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(AppConstants.API_VERSION_1 + "/wishlist")
public class WishlistController {

    private final WishlistService wishlistService;

    public WishlistController(WishlistService wishlistService) {
        this.wishlistService = wishlistService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<WishlistItemResponse>>> getMyWishlist(
            @AuthenticationPrincipal UserPrincipal principal,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(wishlistService.getMyWishlist(principal, pageable)));
    }

    @PostMapping("/{productId}")
    public ResponseEntity<ApiResponse<WishlistItemResponse>> addToWishlist(
            @PathVariable Long productId,
            @AuthenticationPrincipal UserPrincipal principal) {
        WishlistItemResponse response = wishlistService.addToWishlist(productId, principal);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(response, "Added to wishlist"));
    }

    @DeleteMapping("/{productId}")
    public ResponseEntity<ApiResponse<Void>> removeFromWishlist(
            @PathVariable Long productId,
            @AuthenticationPrincipal UserPrincipal principal) {
        wishlistService.removeFromWishlist(productId, principal);
        return ResponseEntity.ok(ApiResponse.success(null, "Removed from wishlist"));
    }

    @GetMapping("/check/{productId}")
    public ResponseEntity<ApiResponse<Boolean>> isInWishlist(
            @PathVariable Long productId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(wishlistService.isInWishlist(productId, principal)));
    }
}
