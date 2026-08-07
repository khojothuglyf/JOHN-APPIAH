package com.marketplacesystem.service.impl;

import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.dto.ReviewRequest;
import com.marketplacesystem.dto.ReviewResponse;
import com.marketplacesystem.entity.OrderStatus;
import com.marketplacesystem.entity.Product;
import com.marketplacesystem.entity.Review;
import com.marketplacesystem.exception.BadRequestException;
import com.marketplacesystem.exception.ConflictException;
import com.marketplacesystem.exception.ForbiddenException;
import com.marketplacesystem.exception.ResourceNotFoundException;
import com.marketplacesystem.mapper.ReviewMapper;
import com.marketplacesystem.repository.OrderItemRepository;
import com.marketplacesystem.repository.ProductRepository;
import com.marketplacesystem.repository.ReviewRepository;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.ReviewService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ReviewServiceImpl implements ReviewService {

    private final ReviewRepository reviewRepository;
    private final ProductRepository productRepository;
    private final OrderItemRepository orderItemRepository;
    private final ReviewMapper reviewMapper;

    public ReviewServiceImpl(ReviewRepository reviewRepository,
                             ProductRepository productRepository,
                             OrderItemRepository orderItemRepository,
                             ReviewMapper reviewMapper) {
        this.reviewRepository = reviewRepository;
        this.productRepository = productRepository;
        this.orderItemRepository = orderItemRepository;
        this.reviewMapper = reviewMapper;
    }

    @Override
    @Transactional
    public ReviewResponse createReview(Long productId, ReviewRequest request, UserPrincipal principal) {
        Product product = findProduct(productId);
        if (!orderItemRepository.existsByProductIdAndOrderUserIdAndOrderStatus(
                productId, principal.getId(), OrderStatus.DELIVERED)) {
            throw new ForbiddenException("You can only review a product you have purchased and received");
        }
        if (reviewRepository.existsByProductIdAndUserId(productId, principal.getId())) {
            throw new ConflictException("You have already reviewed this product");
        }

        Review review = new Review();
        review.setProduct(product);
        review.setUser(principal.getUser());
        review.setRating(request.rating());
        review.setComment(request.comment() == null ? null : request.comment().trim());
        Review saved = reviewRepository.save(review);
        recalculateProductRating(product);
        return reviewMapper.toResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<ReviewResponse> getProductReviews(Long productId, Pageable pageable) {
        findProduct(productId);
        Page<Review> page = reviewRepository.findByProductId(productId, pageable);
        return toPagedResponse(page);
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<ReviewResponse> getMyReviews(UserPrincipal principal, Pageable pageable) {
        return toPagedResponse(reviewRepository.findByUserId(principal.getId(), pageable));
    }

    @Override
    @Transactional
    public ReviewResponse updateReview(Long reviewId, ReviewRequest request, UserPrincipal principal) {
        Review review = findReview(reviewId);
        if (!review.getUser().getId().equals(principal.getId())) {
            throw new ForbiddenException("You can only update your own reviews");
        }
        review.setRating(request.rating());
        review.setComment(request.comment() == null ? null : request.comment().trim());
        Review saved = reviewRepository.save(review);
        recalculateProductRating(review.getProduct());
        return reviewMapper.toResponse(saved);
    }

    @Override
    @Transactional
    public void deleteReview(Long reviewId, UserPrincipal principal) {
        Review review = findReview(reviewId);
        boolean isAdmin = hasRole(principal, "ROLE_ADMIN");
        if (!isAdmin && !review.getUser().getId().equals(principal.getId())) {
            throw new ForbiddenException("You can only delete your own reviews");
        }
        Product product = review.getProduct();
        reviewRepository.delete(review);
        recalculateProductRating(product);
    }

    private void recalculateProductRating(Product product) {
        List<Review> reviews = reviewRepository.findByProductId(product.getId());
        if (reviews.isEmpty()) {
            product.setAverageRating(0.0);
            product.setReviewCount(0);
        } else {
            double sum = reviews.stream().mapToInt(Review::getRating).sum();
            product.setAverageRating(Math.round(sum / reviews.size() * 10.0) / 10.0);
            product.setReviewCount(reviews.size());
        }
        productRepository.save(product);
    }

    private Product findProduct(Long productId) {
        return productRepository.findById(productId)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with id: " + productId));
    }

    private Review findReview(Long reviewId) {
        return reviewRepository.findById(reviewId)
                .orElseThrow(() -> new ResourceNotFoundException("Review not found with id: " + reviewId));
    }

    private boolean hasRole(UserPrincipal principal, String role) {
        return principal.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(role::equals);
    }

    private PagedResponse<ReviewResponse> toPagedResponse(Page<Review> page) {
        List<ReviewResponse> content = page.getContent().stream()
                .map(reviewMapper::toResponse)
                .toList();
        return new PagedResponse<>(content, page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages(), page.isLast());
    }
}
