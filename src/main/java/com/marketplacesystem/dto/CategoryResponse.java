package com.marketplacesystem.dto;

import java.time.LocalDateTime;
import java.util.List;

public record CategoryResponse(
        Long id,
        String name,
        String description,
        Long parentId,
        List<CategoryResponse> subcategories,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {
}
