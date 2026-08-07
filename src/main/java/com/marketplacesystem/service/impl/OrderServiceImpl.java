package com.marketplacesystem.service.impl;

import com.marketplacesystem.dto.CheckoutRequest;
import com.marketplacesystem.dto.OrderItemResponse;
import com.marketplacesystem.dto.OrderResponse;
import com.marketplacesystem.dto.OrderStatusRequest;
import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.entity.CartItem;
import com.marketplacesystem.entity.NotificationType;
import com.marketplacesystem.entity.Order;
import com.marketplacesystem.entity.OrderItem;
import com.marketplacesystem.entity.OrderStatus;
import com.marketplacesystem.entity.Product;
import com.marketplacesystem.entity.ProductStatus;
import com.marketplacesystem.exception.BadRequestException;
import com.marketplacesystem.exception.ForbiddenException;
import com.marketplacesystem.exception.ResourceNotFoundException;import com.marketplacesystem.mapper.OrderMapper;
import com.marketplacesystem.repository.CartItemRepository;
import com.marketplacesystem.repository.OrderRepository;
import com.marketplacesystem.repository.ProductRepository;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.CouponService;
import com.marketplacesystem.service.NotificationService;
import com.marketplacesystem.service.OrderService;
import com.marketplacesystem.service.PaymentService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Service
public class OrderServiceImpl implements OrderService {

    private static final Set<OrderStatus> CANCELLABLE_STATUSES = Set.of(OrderStatus.PENDING, OrderStatus.CONFIRMED);

    private final OrderRepository orderRepository;
    private final CartItemRepository cartItemRepository;
    private final ProductRepository productRepository;
    private final PaymentService paymentService;
    private final CouponService couponService;
    private final NotificationService notificationService;
    private final OrderMapper orderMapper;
    private final SecureRandom secureRandom = new SecureRandom();

    public OrderServiceImpl(OrderRepository orderRepository,
                            CartItemRepository cartItemRepository,
                            ProductRepository productRepository,
                            PaymentService paymentService,
                            CouponService couponService,
                            NotificationService notificationService,
                            OrderMapper orderMapper) {
        this.orderRepository = orderRepository;
        this.cartItemRepository = cartItemRepository;
        this.productRepository = productRepository;
        this.paymentService = paymentService;
        this.couponService = couponService;
        this.notificationService = notificationService;
        this.orderMapper = orderMapper;
    }

    @Override
    @Transactional
    public OrderResponse createOrderFromCart(CheckoutRequest request, UserPrincipal principal) {
        List<CartItem> cartItems = cartItemRepository.findByUserIdOrderByCreatedAtAsc(principal.getId());
        if (cartItems.isEmpty()) {
            throw new BadRequestException("Your cart is empty");
        }

        Order order = new Order();
        order.setOrderNumber(generateOrderNumber());
        order.setUser(principal.getUser());
        order.setStatus(OrderStatus.PENDING);
        order.setShippingAddress(request.shippingAddress().trim());
        order.setCity(request.city() == null ? null : request.city().trim());
        order.setPostalCode(request.postalCode() == null ? null : request.postalCode().trim());
        order.setCountry(request.country() == null ? null : request.country().trim());

        BigDecimal total = BigDecimal.ZERO;
        for (CartItem cartItem : cartItems) {
            Product product = cartItem.getProduct();
            if (product.getStatus() != ProductStatus.ACTIVE) {
                throw new BadRequestException("Product '" + product.getName() + "' is not available for purchase");
            }
            if (product.getStock() < cartItem.getQuantity()) {
                throw new BadRequestException("Insufficient stock for product '" + product.getName()
                        + "' (available: " + product.getStock() + ")");
            }

            OrderItem item = new OrderItem();
            item.setOrder(order);
            item.setProduct(product);
            item.setProductName(product.getName());
            item.setUnitPrice(product.getPrice());
            item.setQuantity(cartItem.getQuantity());
            item.setSubtotal(product.getPrice().multiply(BigDecimal.valueOf(cartItem.getQuantity())));
            order.getItems().add(item);

            product.setStock(product.getStock() - cartItem.getQuantity());
            productRepository.save(product);
            total = total.add(item.getSubtotal());
        }

        BigDecimal discount = BigDecimal.ZERO;
        if (request.couponCode() != null && !request.couponCode().isBlank()) {
            discount = couponService.validateAndApply(request.couponCode(), principal.getUser(), total);
            order.setCouponCode(request.couponCode().trim().toUpperCase());
            order.setDiscountAmount(discount);
        }
        order.setTotalAmount(total.subtract(discount));
        orderRepository.save(order);
        cartItemRepository.deleteAll(cartItems);
        return orderMapper.toResponse(order);
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<OrderResponse> getMyOrders(UserPrincipal principal, OrderStatus status, Pageable pageable) {
        Page<Order> page = status == null
                ? orderRepository.findByUserId(principal.getId(), pageable)
                : orderRepository.findByUserIdAndStatus(principal.getId(), status, pageable);
        return toPagedResponse(page);
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<OrderResponse> getSellerOrders(UserPrincipal principal, OrderStatus status, Pageable pageable) {
        Page<Order> page = status == null
                ? orderRepository.findDistinctByItemsProductSellerId(principal.getId(), pageable)
                : orderRepository.findDistinctByItemsProductSellerIdAndStatus(principal.getId(), status, pageable);
        return toPagedResponse(page);
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<OrderResponse> getAllOrders(OrderStatus status, Pageable pageable) {
        Page<Order> page = status == null ? orderRepository.findAll(pageable) : orderRepository.findByStatus(status, pageable);
        return toPagedResponse(page);
    }

    @Override
    @Transactional(readOnly = true)
    public OrderResponse getOrderById(Long id, UserPrincipal principal) {
        Order order = findOrder(id);
        boolean isAdmin = hasRole(principal, "ROLE_ADMIN");
        boolean isSeller = hasRole(principal, "ROLE_SELLER");
        boolean isOwner = order.getUser().getId().equals(principal.getId());
        boolean isSellerWithItem = isSeller && order.getItems().stream()
                .anyMatch(item -> item.getProduct().getSeller().getId().equals(principal.getId()));
        if (!isAdmin && !isOwner && !isSellerWithItem) {
            throw new ForbiddenException("You do not have permission to view this order");
        }
        return orderMapper.toResponse(order);
    }

    @Override
    @Transactional
    public OrderResponse updateOrderStatus(Long id, OrderStatusRequest request, UserPrincipal principal) {
        Order order = findOrder(id);
        OrderStatus current = order.getStatus();
        OrderStatus target = request.status();
        boolean isAdmin = hasRole(principal, "ROLE_ADMIN");
        boolean isSeller = hasRole(principal, "ROLE_SELLER");
        boolean isOwner = order.getUser().getId().equals(principal.getId());

        if (target == OrderStatus.CANCELLED) {
            if (!isAdmin && !isOwner) {
                throw new ForbiddenException("Only the order owner or an admin can cancel an order");
            }
            if (!CANCELLABLE_STATUSES.contains(current)) {
                throw new BadRequestException("Cannot cancel an order that is already " + current);
            }
            order.setStatus(OrderStatus.CANCELLED);
            restoreStock(order);
            paymentService.autoRefundOnCancel(order.getId());
        } else {
            if (!isAdmin && !isSeller) {
                throw new ForbiddenException("Only a seller or an admin can update order status");
            }
            validateTransition(current, target);
            if (target == OrderStatus.SHIPPED || target == OrderStatus.DELIVERED) {
                paymentService.requirePaymentBeforeShipping(order.getId());
            }
            order.setStatus(target);
            if (target == OrderStatus.DELIVERED) {
                paymentService.completeCodOnDelivery(order.getId());
            }
        }

        orderRepository.save(order);
        notificationService.create(order.getUser(), NotificationType.ORDER_STATUS_CHANGED,
                "Order " + order.getOrderNumber() + " " + target.name().toLowerCase(),
                "Your order #" + order.getOrderNumber() + " is now " + target.name().toLowerCase() + ".");
        return orderMapper.toResponse(order);
    }

    private void validateTransition(OrderStatus current, OrderStatus target) {
        boolean legal = switch (target) {
            case CONFIRMED -> current == OrderStatus.PENDING;
            case SHIPPED -> current == OrderStatus.PENDING || current == OrderStatus.CONFIRMED;
            case DELIVERED -> current == OrderStatus.SHIPPED;
            default -> false;
        };
        if (!legal) {
            throw new BadRequestException("Cannot transition an order from " + current + " to " + target);
        }
    }

    private void restoreStock(Order order) {
        for (OrderItem item : order.getItems()) {
            Product product = item.getProduct();
            product.setStock(product.getStock() + item.getQuantity());
            productRepository.save(product);
        }
    }

    private Order findOrder(Long id) {
        return orderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + id));
    }

    private String generateOrderNumber() {
        for (int i = 0; i < 5; i++) {
            String number = "ORD-" + (10000000 + secureRandom.nextInt(90000000));
            if (!orderRepository.existsByOrderNumber(number)) {
                return number;
            }
        }
        throw new IllegalStateException("Could not generate a unique order number");
    }

    private boolean hasRole(UserPrincipal principal, String role) {
        return principal.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(role::equals);
    }

    private PagedResponse<OrderResponse> toPagedResponse(Page<Order> page) {
        List<OrderResponse> content = page.getContent().stream()
                .map(orderMapper::toResponse)
                .toList();
        return new PagedResponse<>(content, page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages(), page.isLast());
    }
}
