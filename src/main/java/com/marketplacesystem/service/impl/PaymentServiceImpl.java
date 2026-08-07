package com.marketplacesystem.service.impl;

import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.dto.PaymentRequest;
import com.marketplacesystem.dto.PaymentResponse;
import com.marketplacesystem.entity.NotificationType;
import com.marketplacesystem.entity.Order;
import com.marketplacesystem.entity.OrderStatus;
import com.marketplacesystem.entity.Payment;
import com.marketplacesystem.entity.PaymentMethod;
import com.marketplacesystem.entity.PaymentStatus;
import com.marketplacesystem.exception.BadRequestException;
import com.marketplacesystem.exception.ConflictException;
import com.marketplacesystem.exception.ForbiddenException;
import com.marketplacesystem.exception.ResourceNotFoundException;
import com.marketplacesystem.mapper.PaymentMapper;
import com.marketplacesystem.repository.OrderRepository;
import com.marketplacesystem.repository.PaymentRepository;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.NotificationService;
import com.marketplacesystem.service.PaymentService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

@Service
public class PaymentServiceImpl implements PaymentService {

    private static final String CURRENCY = "NGN";

    private final PaymentRepository paymentRepository;
    private final OrderRepository orderRepository;
    private final PaymentMapper paymentMapper;
    private final NotificationService notificationService;
    private final SecureRandom secureRandom = new SecureRandom();

    public PaymentServiceImpl(PaymentRepository paymentRepository,
                              OrderRepository orderRepository,
                              PaymentMapper paymentMapper,
                              NotificationService notificationService) {
        this.paymentRepository = paymentRepository;
        this.orderRepository = orderRepository;
        this.paymentMapper = paymentMapper;
        this.notificationService = notificationService;
    }

    @Override
    @Transactional
    public PaymentResponse createPayment(Long orderId, PaymentRequest request, UserPrincipal principal) {
        Order order = findOrder(orderId);
        if (!order.getUser().getId().equals(principal.getId()) && !hasRole(principal, "ROLE_ADMIN")) {
            throw new ForbiddenException("Only the order owner or an admin can pay for an order");
        }
        if (order.getStatus() == OrderStatus.CANCELLED || order.getStatus() == OrderStatus.DELIVERED) {
            throw new BadRequestException("Cannot pay for an order that is " + order.getStatus());
        }
        if (paymentRepository.existsByOrderId(orderId)) {
            throw new ConflictException("This order already has a payment");
        }

        Payment payment = new Payment();
        payment.setOrder(order);
        payment.setUser(order.getUser());
        payment.setAmount(order.getTotalAmount());
        payment.setCurrency(CURRENCY);
        payment.setMethod(request.method());
        payment.setTransactionRef(generateTransactionRef());
        if (request.method() == PaymentMethod.CASH_ON_DELIVERY) {
            payment.setStatus(PaymentStatus.PENDING);
        } else {
            payment.setStatus(PaymentStatus.COMPLETED);
            payment.setPaidAt(LocalDateTime.now(ZoneOffset.UTC));
        }
        Payment saved = paymentRepository.save(payment);
        if (saved.getStatus() == PaymentStatus.COMPLETED) {
            notificationService.create(order.getUser(), NotificationType.PAYMENT_CONFIRMED,
                    "Payment confirmed",
                    "Payment of " + CURRENCY + " " + saved.getAmount() + " for order #"
                            + order.getOrderNumber() + " was confirmed.");
        }
        return paymentMapper.toResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public PaymentResponse getPaymentByOrderId(Long orderId, UserPrincipal principal) {
        Order order = findOrder(orderId);
        boolean isAdmin = hasRole(principal, "ROLE_ADMIN");
        boolean isOwner = order.getUser().getId().equals(principal.getId());
        boolean isSellerWithItem = hasRole(principal, "ROLE_SELLER") && order.getItems().stream()
                .anyMatch(item -> item.getProduct().getSeller().getId().equals(principal.getId()));
        if (!isAdmin && !isOwner && !isSellerWithItem) {
            throw new ForbiddenException("You do not have permission to view this payment");
        }
        Payment payment = paymentRepository.findByOrderId(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("No payment found for order id: " + orderId));
        return paymentMapper.toResponse(payment);
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<PaymentResponse> getMyPayments(UserPrincipal principal, Pageable pageable) {
        Page<Payment> page = paymentRepository.findByUserId(principal.getId(), pageable);
        return toPagedResponse(page);
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<PaymentResponse> getAllPayments(Pageable pageable) {
        return toPagedResponse(paymentRepository.findAll(pageable));
    }

    @Override
    @Transactional
    public PaymentResponse refundPayment(Long paymentId, UserPrincipal principal) {
        if (!hasRole(principal, "ROLE_ADMIN")) {
            throw new ForbiddenException("Only an admin can refund a payment");
        }
        Payment payment = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new ResourceNotFoundException("Payment not found with id: " + paymentId));
        if (payment.getStatus() != PaymentStatus.COMPLETED) {
            throw new BadRequestException("Only a completed payment can be refunded (current status: " + payment.getStatus() + ")");
        }
        payment.setStatus(PaymentStatus.REFUNDED);
        Payment saved = paymentRepository.save(payment);
        notificationService.create(payment.getUser(), NotificationType.PAYMENT_REFUNDED,
                "Payment refunded",
                "A refund of " + CURRENCY + " " + saved.getAmount() + " for order #"
                        + saved.getOrder().getOrderNumber() + " was issued.");
        return paymentMapper.toResponse(saved);
    }

    @Override
    @Transactional
    public void requirePaymentBeforeShipping(Long orderId) {
        Payment payment = paymentRepository.findByOrderId(orderId)
                .orElseThrow(() -> new BadRequestException("This order has not been paid"));
        if (payment.getMethod() == PaymentMethod.CASH_ON_DELIVERY) {
            if (payment.getStatus() == PaymentStatus.PENDING || payment.getStatus() == PaymentStatus.COMPLETED) {
                return;
            }
        } else if (payment.getStatus() == PaymentStatus.COMPLETED) {
            return;
        }
        throw new BadRequestException("Order cannot be shipped until the payment is completed (current status: " + payment.getStatus() + ")");
    }

    @Override
    @Transactional
    public void completeCodOnDelivery(Long orderId) {
        paymentRepository.findByOrderId(orderId).ifPresent(payment -> {
            if (payment.getMethod() == PaymentMethod.CASH_ON_DELIVERY
                    && payment.getStatus() == PaymentStatus.PENDING) {
                payment.setStatus(PaymentStatus.COMPLETED);
                payment.setPaidAt(LocalDateTime.now(ZoneOffset.UTC));
                paymentRepository.save(payment);
                notificationService.create(payment.getUser(), NotificationType.PAYMENT_CONFIRMED,
                        "Payment confirmed",
                        "Cash on delivery payment of " + CURRENCY + " " + payment.getAmount()
                                + " for order #" + payment.getOrder().getOrderNumber() + " was confirmed.");
            }
        });
    }

    @Override
    @Transactional
    public void autoRefundOnCancel(Long orderId) {
        paymentRepository.findByOrderId(orderId).ifPresent(payment -> {
            if (payment.getStatus() == PaymentStatus.COMPLETED) {
                payment.setStatus(PaymentStatus.REFUNDED);
                paymentRepository.save(payment);
                notificationService.create(payment.getUser(), NotificationType.PAYMENT_REFUNDED,
                        "Payment refunded",
                        "Your payment of " + CURRENCY + " " + payment.getAmount()
                                + " for cancelled order #" + payment.getOrder().getOrderNumber() + " was refunded.");
            } else if (payment.getStatus() == PaymentStatus.PENDING) {
                payment.setStatus(PaymentStatus.FAILED);
                paymentRepository.save(payment);
            }
        });
    }

    private Order findOrder(Long orderId) {
        return orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));
    }

    private String generateTransactionRef() {
        for (int i = 0; i < 5; i++) {
            String ref = "PAY-" + (10000000 + secureRandom.nextInt(90000000));
            if (!paymentRepository.existsByTransactionRef(ref)) {
                return ref;
            }
        }
        throw new IllegalStateException("Could not generate a unique transaction reference");
    }

    private boolean hasRole(UserPrincipal principal, String role) {
        return principal.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(role::equals);
    }

    private PagedResponse<PaymentResponse> toPagedResponse(Page<Payment> page) {
        List<PaymentResponse> content = page.getContent().stream()
                .map(paymentMapper::toResponse)
                .toList();
        return new PagedResponse<>(content, page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages(), page.isLast());
    }
}
