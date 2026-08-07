package com.marketplacesystem.service;

import com.marketplacesystem.dto.CategoryRequest;
import com.marketplacesystem.dto.CategoryResponse;

import java.util.List;

public interface CategoryService {

    List<CategoryResponse> getAllCategories();

    CategoryResponse getCategoryById(Long id);

    CategoryResponse createCategory(CategoryRequest request);

    CategoryResponse updateCategory(Long id, CategoryRequest request);

    void deleteCategory(Long id);
}
