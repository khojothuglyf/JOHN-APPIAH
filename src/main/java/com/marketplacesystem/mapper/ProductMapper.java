package com.marketplacesystem.mapper;

import com.marketplacesystem.dto.ProductResponse;
import com.marketplacesystem.entity.Category;
import com.marketplacesystem.entity.Product;
import com.marketplacesystem.entity.User;
import org.springframework.stereotype.Component;

@Component
public class ProductMapper {

    public ProductResponse toResponse(Product product) {
        Category category = product.getCategory();
        User seller = product.getSeller();
        return new ProductResponse(
                product.getId(),
                product.getName(),
                product.getDescription(),
                product.getPrice(),
                product.getStock(),
                product.getSku(),
                product.getImageUrl(),
                product.getStatus(),
                category.getId(),
                category.getName(),
                seller.getId(),
                seller.getFirstName() + " " + seller.getLastName(),
                product.getAverageRating(),
                product.getReviewCount(),
                product.getCreatedAt(),
                product.getUpdatedAt());
    }
}
