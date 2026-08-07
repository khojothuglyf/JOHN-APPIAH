package com.marketplacesystem.controller;

import com.marketplacesystem.dto.ApiResponse;
import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.dto.ReviewRequest;
import com.marketplacesystem.dto.ReviewResponse;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.ReviewService;
import com.marketplacesystem.util.AppConstants;
import jakarta.validation.Valid;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(AppConstants.API_VERSION_1)
public class ReviewController {

    private final ReviewService reviewService;

    public ReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    @PostMapping("/products/{productId}/reviews")
    public ResponseEntity<ApiResponse<ReviewResponse>> createReview(
            @PathVariable Long productId,
            @Valid @RequestBody ReviewRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        ReviewResponse response = reviewService.createReview(productId, request, principal);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(response, "Review submitted"));
    }

    @GetMapping("/products/{productId}/reviews")
    public ResponseEntity<ApiResponse<PagedResponse<ReviewResponse>>> getProductReviews(
            @PathVariable Long productId,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(reviewService.getProductReviews(productId, pageable)));
    }

    @GetMapping("/reviews/my")
    public ResponseEntity<ApiResponse<PagedResponse<ReviewResponse>>> getMyReviews(
            @AuthenticationPrincipal UserPrincipal principal,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(reviewService.getMyReviews(principal, pageable)));
    }

    @PutMapping("/reviews/{reviewId}")
    public ResponseEntity<ApiResponse<ReviewResponse>> updateReview(
            @PathVariable Long reviewId,
            @Valid @RequestBody ReviewRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(reviewService.updateReview(reviewId, request, principal),
                "Review updated"));
    }

    @DeleteMapping("/reviews/{reviewId}")
    public ResponseEntity<ApiResponse<Void>> deleteReview(
            @PathVariable Long reviewId,
            @AuthenticationPrincipal UserPrincipal principal) {
        reviewService.deleteReview(reviewId, principal);
        return ResponseEntity.ok(ApiResponse.success(null, "Review deleted"));
    }
}
