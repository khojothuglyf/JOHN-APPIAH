package com.marketplacesystem.service.impl;

import com.marketplacesystem.dto.CategoryRequest;
import com.marketplacesystem.dto.CategoryResponse;
import com.marketplacesystem.entity.Category;
import com.marketplacesystem.exception.ConflictException;
import com.marketplacesystem.exception.ResourceNotFoundException;
import com.marketplacesystem.mapper.CategoryMapper;
import com.marketplacesystem.repository.CategoryRepository;
import com.marketplacesystem.repository.ProductRepository;
import com.marketplacesystem.service.CategoryService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class CategoryServiceImpl implements CategoryService {

    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final CategoryMapper categoryMapper;

    public CategoryServiceImpl(CategoryRepository categoryRepository,
                              ProductRepository productRepository,
                              CategoryMapper categoryMapper) {
        this.categoryRepository = categoryRepository;
        this.productRepository = productRepository;
        this.categoryMapper = categoryMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public List<CategoryResponse> getAllCategories() {
        return categoryRepository.findAll().stream()
                .map(categoryMapper::toResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public CategoryResponse getCategoryById(Long id) {
        return categoryMapper.toResponse(findCategory(id));
    }

    @Override
    @Transactional
    public CategoryResponse createCategory(CategoryRequest request) {
        String name = request.name().trim();
        if (categoryRepository.existsByNameIgnoreCase(name)) {
            throw new ConflictException("A category with name '" + name + "' already exists");
        }
        Category category = new Category();
        category.setName(name);
        category.setDescription(request.description());
        if (request.parentId() != null) {
            category.setParent(findCategory(request.parentId()));
        }
        categoryRepository.save(category);
        return categoryMapper.toResponse(category);
    }

    @Override
    @Transactional
    public CategoryResponse updateCategory(Long id, CategoryRequest request) {
        Category category = findCategory(id);
        String name = request.name().trim();
        if (categoryRepository.existsByNameIgnoreCaseAndIdNot(name, id)) {
            throw new ConflictException("A category with name '" + name + "' already exists");
        }
        category.setName(name);
        category.setDescription(request.description());
        if (request.parentId() != null) {
            if (request.parentId().equals(id)) {
                throw new ConflictException("A category cannot be its own parent");
            }
            category.setParent(findCategory(request.parentId()));
        }
        categoryRepository.save(category);
        return categoryMapper.toResponse(category);
    }

    @Override
    @Transactional
    public void deleteCategory(Long id) {
        Category category = findCategory(id);
        if (categoryRepository.existsByParentId(id)) {
            throw new ConflictException("Cannot delete a category that has subcategories. Delete or reassign the subcategories first.");
        }
        if (productRepository.existsByCategoryId(id)) {
            throw new ConflictException("Cannot delete a category that has products. Delete or reassign the products first.");
        }
        categoryRepository.delete(category);
    }

    private Category findCategory(Long id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found with id: " + id));
    }
}
