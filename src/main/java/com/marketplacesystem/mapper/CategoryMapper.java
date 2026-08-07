package com.marketplacesystem.mapper;

import com.marketplacesystem.dto.CategoryResponse;
import com.marketplacesystem.entity.Category;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class CategoryMapper {

    public CategoryResponse toResponse(Category category) {
        Category parent = category.getParent();
        List<CategoryResponse> subcategories = category.getSubcategories().stream()
                .map(this::toResponse)
                .toList();
        return new CategoryResponse(
                category.getId(),
                category.getName(),
                category.getDescription(),
                parent == null ? null : parent.getId(),
                subcategories,
                category.getCreatedAt(),
                category.getUpdatedAt());
    }
}
