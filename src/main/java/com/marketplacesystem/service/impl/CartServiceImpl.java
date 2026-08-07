package com.marketplacesystem.service.impl;

import com.marketplacesystem.dto.CartItemRequest;
import com.marketplacesystem.dto.CartItemResponse;
import com.marketplacesystem.dto.CartResponse;
import com.marketplacesystem.dto.UpdateQuantityRequest;
import com.marketplacesystem.entity.CartItem;
import com.marketplacesystem.entity.Product;
import com.marketplacesystem.entity.ProductStatus;
import com.marketplacesystem.exception.BadRequestException;
import com.marketplacesystem.exception.ResourceNotFoundException;
import com.marketplacesystem.mapper.CartMapper;
import com.marketplacesystem.repository.CartItemRepository;
import com.marketplacesystem.repository.ProductRepository;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.CartService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
public class CartServiceImpl implements CartService {

    private static final int MAX_QUANTITY = 1000;

    private final CartItemRepository cartItemRepository;
    private final ProductRepository productRepository;
    private final CartMapper cartMapper;

    public CartServiceImpl(CartItemRepository cartItemRepository,
                           ProductRepository productRepository,
                           CartMapper cartMapper) {
        this.cartItemRepository = cartItemRepository;
        this.productRepository = productRepository;
        this.cartMapper = cartMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public CartResponse getCart(UserPrincipal principal) {
        return buildResponse(principal.getId());
    }

    @Override
    @Transactional
    public CartResponse addToCart(CartItemRequest request, UserPrincipal principal) {
        Product product = productRepository.findById(request.productId())
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with id: " + request.productId()));
        if (product.getStatus() != ProductStatus.ACTIVE) {
            throw new BadRequestException("Product is not available for purchase");
        }

        CartItem item = cartItemRepository.findByUserIdAndProductId(principal.getId(), product.getId())
                .orElseGet(() -> {
                    CartItem newItem = new CartItem();
                    newItem.setUser(principal.getUser());
                    newItem.setProduct(product);
                    newItem.setQuantity(0);
                    return newItem;
                });

        int newQuantity = item.getQuantity() + request.quantity();
        if (newQuantity > MAX_QUANTITY) {
            throw new BadRequestException("Quantity cannot exceed " + MAX_QUANTITY);
        }
        item.setQuantity(newQuantity);
        cartItemRepository.save(item);
        return buildResponse(principal.getId());
    }

    @Override
    @Transactional
    public CartResponse updateQuantity(Long cartItemId, UpdateQuantityRequest request, UserPrincipal principal) {
        CartItem item = findOwnedItem(cartItemId, principal);
        item.setQuantity(request.quantity());
        cartItemRepository.save(item);
        return buildResponse(principal.getId());
    }

    @Override
    @Transactional
    public CartResponse removeFromCart(Long cartItemId, UserPrincipal principal) {
        CartItem item = findOwnedItem(cartItemId, principal);
        cartItemRepository.delete(item);
        return buildResponse(principal.getId());
    }

    @Override
    @Transactional
    public void clearCart(UserPrincipal principal) {
        List<CartItem> items = cartItemRepository.findByUserIdOrderByCreatedAtAsc(principal.getId());
        cartItemRepository.deleteAll(items);
    }

    private CartItem findOwnedItem(Long cartItemId, UserPrincipal principal) {
        CartItem item = cartItemRepository.findById(cartItemId)
                .orElseThrow(() -> new ResourceNotFoundException("Cart item not found with id: " + cartItemId));
        if (!item.getUser().getId().equals(principal.getId())) {
            throw new ResourceNotFoundException("Cart item not found with id: " + cartItemId);
        }
        return item;
    }

    private CartResponse buildResponse(Long userId) {
        List<CartItem> items = cartItemRepository.findByUserIdOrderByCreatedAtAsc(userId);
        List<CartItemResponse> responses = items.stream().map(cartMapper::toResponse).toList();
        int totalItems = responses.stream().mapToInt(CartItemResponse::quantity).sum();
        BigDecimal totalPrice = responses.stream()
                .map(CartItemResponse::subtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new CartResponse(responses, totalItems, totalPrice);
    }
}
