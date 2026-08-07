package com.marketplacesystem.service;

import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.dto.ReviewRequest;
import com.marketplacesystem.dto.ReviewResponse;
import com.marketplacesystem.security.UserPrincipal;
import org.springframework.data.domain.Pageable;

public interface ReviewService {

    ReviewResponse createReview(Long productId, ReviewRequest request, UserPrincipal principal);

    PagedResponse<ReviewResponse> getProductReviews(Long productId, Pageable pageable);

    PagedResponse<ReviewResponse> getMyReviews(UserPrincipal principal, Pageable pageable);

    ReviewResponse updateReview(Long reviewId, ReviewRequest request, UserPrincipal principal);

    void deleteReview(Long reviewId, UserPrincipal principal);
}
