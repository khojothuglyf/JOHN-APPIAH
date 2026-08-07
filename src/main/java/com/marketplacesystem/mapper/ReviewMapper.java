package com.marketplacesystem.mapper;

import com.marketplacesystem.dto.ReviewResponse;
import com.marketplacesystem.entity.Review;
import com.marketplacesystem.entity.User;
import org.springframework.stereotype.Component;

@Component
public class ReviewMapper {

    public ReviewResponse toResponse(Review review) {
        User user = review.getUser();
        return new ReviewResponse(
                review.getId(),
                review.getProduct().getId(),
                review.getProduct().getName(),
                user.getId(),
                user.getFirstName() + " " + user.getLastName(),
                review.getRating(),
                review.getComment(),
                review.getCreatedAt(),
                review.getUpdatedAt());
    }
}
