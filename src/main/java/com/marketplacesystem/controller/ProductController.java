package com.marketplacesystem.controller;

import com.marketplacesystem.dto.ApiResponse;
import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.dto.ProductFilter;
import com.marketplacesystem.dto.ProductRequest;
import com.marketplacesystem.dto.ProductResponse;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.ProductService;
import com.marketplacesystem.util.AppConstants;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;

@RestController
@RequestMapping(AppConstants.API_VERSION_1 + "/products")
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<ProductResponse>>> getActiveProducts(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) Long sellerId,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) Boolean inStock,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        ProductFilter filter = new ProductFilter(keyword, categoryId, sellerId, minPrice, maxPrice, inStock);
        return ResponseEntity.ok(ApiResponse.success(productService.getActiveProducts(filter, pageable)));
    }

    @GetMapping("/mine")
    @PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<PagedResponse<ProductResponse>>> getMyProducts(
            @AuthenticationPrincipal UserPrincipal principal,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(productService.getMyProducts(principal, pageable)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ProductResponse>> getProductById(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(productService.getProductById(id, principal)));
    }

    @PostMapping
    @PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<ProductResponse>> createProduct(
            @Valid @RequestBody ProductRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        ProductResponse response = productService.createProduct(request, principal);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(response, "Product created successfully"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<ProductResponse>> updateProduct(
            @PathVariable Long id,
            @Valid @RequestBody ProductRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        ProductResponse response = productService.updateProduct(id, request, principal);
        return ResponseEntity.ok(ApiResponse.success(response, "Product updated successfully"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('SELLER') or hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteProduct(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal principal) {
        productService.deleteProduct(id, principal);
        return ResponseEntity.ok(ApiResponse.success(null, "Product deleted successfully"));
    }
}
