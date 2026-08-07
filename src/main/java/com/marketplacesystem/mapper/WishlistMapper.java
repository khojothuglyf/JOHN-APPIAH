package com.marketplacesystem.mapper;

import com.marketplacesystem.dto.WishlistItemResponse;
import com.marketplacesystem.entity.WishlistItem;
import org.springframework.stereotype.Component;

@Component
public class WishlistMapper {

    public WishlistItemResponse toResponse(WishlistItem item) {
        return new WishlistItemResponse(
                item.getId(),
                item.getProduct().getId(),
                item.getProduct().getName(),
                item.getProduct().getPrice(),
                item.getProduct().getImageUrl(),
                item.getProduct().getSeller().getFirstName() + " " + item.getProduct().getSeller().getLastName(),
                item.getProduct().getAverageRating(),
                item.getProduct().getReviewCount(),
                item.getCreatedAt());
    }
}
