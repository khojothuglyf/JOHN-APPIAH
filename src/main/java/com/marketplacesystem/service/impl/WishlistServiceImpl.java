package com.marketplacesystem.service.impl;

import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.dto.WishlistItemResponse;
import com.marketplacesystem.entity.Product;
import com.marketplacesystem.entity.ProductStatus;
import com.marketplacesystem.entity.WishlistItem;
import com.marketplacesystem.exception.BadRequestException;
import com.marketplacesystem.exception.ConflictException;
import com.marketplacesystem.exception.ResourceNotFoundException;
import com.marketplacesystem.mapper.WishlistMapper;
import com.marketplacesystem.repository.ProductRepository;
import com.marketplacesystem.repository.WishlistItemRepository;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.WishlistService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class WishlistServiceImpl implements WishlistService {

    private final WishlistItemRepository wishlistItemRepository;
    private final ProductRepository productRepository;
    private final WishlistMapper wishlistMapper;

    public WishlistServiceImpl(WishlistItemRepository wishlistItemRepository,
                               ProductRepository productRepository,
                               WishlistMapper wishlistMapper) {
        this.wishlistItemRepository = wishlistItemRepository;
        this.productRepository = productRepository;
        this.wishlistMapper = wishlistMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<WishlistItemResponse> getMyWishlist(UserPrincipal principal, Pageable pageable) {
        Page<WishlistItem> page = wishlistItemRepository.findByUserId(principal.getId(), pageable);
        List<WishlistItemResponse> content = page.getContent().stream()
                .map(wishlistMapper::toResponse)
                .toList();
        return new PagedResponse<>(content, page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages(), page.isLast());
    }

    @Override
    @Transactional
    public WishlistItemResponse addToWishlist(Long productId, UserPrincipal principal) {
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with id: " + productId));
        if (product.getStatus() != ProductStatus.ACTIVE) {
            throw new BadRequestException("Only active products can be added to a wishlist");
        }
        if (wishlistItemRepository.existsByUserIdAndProductId(principal.getId(), productId)) {
            throw new ConflictException("Product is already in your wishlist");
        }
        WishlistItem item = new WishlistItem();
        item.setUser(principal.getUser());
        item.setProduct(product);
        return wishlistMapper.toResponse(wishlistItemRepository.save(item));
    }

    @Override
    @Transactional
    public void removeFromWishlist(Long productId, UserPrincipal principal) {
        WishlistItem item = wishlistItemRepository.findByUserIdAndProductId(principal.getId(), productId)
                .orElseThrow(() -> new ResourceNotFoundException("Product is not in your wishlist"));
        wishlistItemRepository.delete(item);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isInWishlist(Long productId, UserPrincipal principal) {
        return wishlistItemRepository.existsByUserIdAndProductId(principal.getId(), productId);
    }
}
