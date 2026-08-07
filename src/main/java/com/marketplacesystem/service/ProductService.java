package com.marketplacesystem.service;

import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.dto.ProductFilter;
import com.marketplacesystem.dto.ProductRequest;
import com.marketplacesystem.dto.ProductResponse;
import com.marketplacesystem.security.UserPrincipal;
import org.springframework.data.domain.Pageable;

public interface ProductService {

    PagedResponse<ProductResponse> getActiveProducts(ProductFilter filter, Pageable pageable);

    ProductResponse getProductById(Long id, UserPrincipal principal);

    PagedResponse<ProductResponse> getMyProducts(UserPrincipal principal, Pageable pageable);

    ProductResponse createProduct(ProductRequest request, UserPrincipal principal);

    ProductResponse updateProduct(Long id, ProductRequest request, UserPrincipal principal);

    void deleteProduct(Long id, UserPrincipal principal);
}
