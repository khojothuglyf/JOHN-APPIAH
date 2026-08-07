package com.marketplacesystem.service.impl;

import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.dto.ProductFilter;
import com.marketplacesystem.dto.ProductRequest;
import com.marketplacesystem.dto.ProductResponse;
import com.marketplacesystem.entity.Category;
import com.marketplacesystem.entity.Product;
import com.marketplacesystem.entity.ProductStatus;
import com.marketplacesystem.exception.ConflictException;
import com.marketplacesystem.exception.ForbiddenException;
import com.marketplacesystem.exception.ResourceNotFoundException;
import com.marketplacesystem.mapper.ProductMapper;
import com.marketplacesystem.repository.CartItemRepository;
import com.marketplacesystem.repository.CategoryRepository;
import com.marketplacesystem.repository.OrderItemRepository;
import com.marketplacesystem.repository.ProductRepository;
import com.marketplacesystem.repository.WishlistItemRepository;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.ProductService;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
public class ProductServiceImpl implements ProductService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final CartItemRepository cartItemRepository;
    private final OrderItemRepository orderItemRepository;
    private final WishlistItemRepository wishlistItemRepository;
    private final ProductMapper productMapper;

    public ProductServiceImpl(ProductRepository productRepository,
                              CategoryRepository categoryRepository,
                              CartItemRepository cartItemRepository,
                              OrderItemRepository orderItemRepository,
                              WishlistItemRepository wishlistItemRepository,
                              ProductMapper productMapper) {
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
        this.cartItemRepository = cartItemRepository;
        this.orderItemRepository = orderItemRepository;
        this.wishlistItemRepository = wishlistItemRepository;
        this.productMapper = productMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<ProductResponse> getActiveProducts(ProductFilter filter, Pageable pageable) {
        Specification<Product> specification = buildActiveProductSpecification(filter);
        Page<Product> page = productRepository.findAll(specification, pageable);
        return toPagedResponse(page);
    }

    @Override
    @Transactional(readOnly = true)
    public ProductResponse getProductById(Long id, UserPrincipal principal) {
        Product product = findProduct(id);
        if (product.getStatus() != ProductStatus.ACTIVE && !canManage(product, principal)) {
            throw new ResourceNotFoundException("Product not found with id: " + id);
        }
        return productMapper.toResponse(product);
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<ProductResponse> getMyProducts(UserPrincipal principal, Pageable pageable) {
        Page<Product> page = productRepository.findBySellerId(principal.getId(), pageable);
        return toPagedResponse(page);
    }

    @Override
    @Transactional
    public ProductResponse createProduct(ProductRequest request, UserPrincipal principal) {
        String sku = request.sku().trim();
        if (productRepository.existsBySku(sku)) {
            throw new ConflictException("A product with SKU '" + sku + "' already exists");
        }

        Category category = findCategory(request.categoryId());
        Product product = new Product();
        product.setName(request.name().trim());
        product.setDescription(request.description());
        product.setPrice(request.price());
        product.setStock(request.stock());
        product.setSku(sku);
        product.setImageUrl(request.imageUrl());
        product.setStatus(request.status() == null ? ProductStatus.ACTIVE : request.status());
        product.setCategory(category);
        product.setSeller(principal.getUser());
        productRepository.save(product);
        return productMapper.toResponse(product);
    }

    @Override
    @Transactional
    public ProductResponse updateProduct(Long id, ProductRequest request, UserPrincipal principal) {
        Product product = findProduct(id);
        verifyCanManage(product, principal);

        String sku = request.sku().trim();
        if (productRepository.existsBySkuAndIdNot(sku, id)) {
            throw new ConflictException("A product with SKU '" + sku + "' already exists");
        }

        Category category = findCategory(request.categoryId());
        product.setName(request.name().trim());
        product.setDescription(request.description());
        product.setPrice(request.price());
        product.setStock(request.stock());
        product.setSku(sku);
        product.setImageUrl(request.imageUrl());
        product.setStatus(request.status() == null ? ProductStatus.ACTIVE : request.status());
        product.setCategory(category);
        productRepository.save(product);
        return productMapper.toResponse(product);
    }

    @Override
    @Transactional
    public void deleteProduct(Long id, UserPrincipal principal) {
        Product product = findProduct(id);
        verifyCanManage(product, principal);
        if (orderItemRepository.existsByProductId(id)) {
            throw new ConflictException("Cannot delete a product that is part of an order");
        }
        cartItemRepository.deleteByProductId(product.getId());
        wishlistItemRepository.deleteByProductId(product.getId());
        productRepository.delete(product);
    }

    private Specification<Product> buildActiveProductSpecification(ProductFilter filter) {
        return (root, query, criteriaBuilder) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(criteriaBuilder.equal(root.get("status"), ProductStatus.ACTIVE));
            if (filter != null) {
                if (filter.keyword() != null && !filter.keyword().isBlank()) {
                    String keyword = "%" + filter.keyword().trim().toLowerCase() + "%";
                    predicates.add(criteriaBuilder.or(
                            criteriaBuilder.like(criteriaBuilder.lower(root.get("name")), keyword),
                            criteriaBuilder.like(criteriaBuilder.lower(root.get("description")), keyword),
                            criteriaBuilder.like(criteriaBuilder.lower(root.get("sku")), keyword)));
                }
                if (filter.categoryId() != null) {
                    predicates.add(criteriaBuilder.equal(root.get("category").get("id"), filter.categoryId()));
                }
                if (filter.sellerId() != null) {
                    predicates.add(criteriaBuilder.equal(root.get("seller").get("id"), filter.sellerId()));
                }
                if (filter.minPrice() != null) {
                    predicates.add(criteriaBuilder.greaterThanOrEqualTo(root.get("price"), filter.minPrice()));
                }
                if (filter.maxPrice() != null) {
                    predicates.add(criteriaBuilder.lessThanOrEqualTo(root.get("price"), filter.maxPrice()));
                }
                if (Boolean.TRUE.equals(filter.inStock())) {
                    predicates.add(criteriaBuilder.greaterThan(root.get("stock"), 0));
                }
            }
            return criteriaBuilder.and(predicates.toArray(new Predicate[0]));
        };
    }

    private PagedResponse<ProductResponse> toPagedResponse(Page<Product> page) {
        List<ProductResponse> content = page.getContent().stream()
                .map(productMapper::toResponse)
                .toList();
        return new PagedResponse<>(content, page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages(), page.isLast());
    }

    private boolean canManage(Product product, UserPrincipal principal) {
        if (principal == null) {
            return false;
        }
        boolean isAdmin = principal.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch("ROLE_ADMIN"::equals);
        return isAdmin || product.getSeller().getId().equals(principal.getId());
    }

    private void verifyCanManage(Product product, UserPrincipal principal) {
        if (!canManage(product, principal)) {
            throw new ForbiddenException("You do not have permission to manage this product");
        }
    }

    private Product findProduct(Long id) {
        return productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with id: " + id));
    }

    private Category findCategory(Long id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found with id: " + id));
    }
}
