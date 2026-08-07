package com.marketplacesystem.controller;

import com.marketplacesystem.dto.ApiResponse;
import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.dto.PaymentRequest;
import com.marketplacesystem.dto.PaymentResponse;
import com.marketplacesystem.security.UserPrincipal;
import com.marketplacesystem.service.PaymentService;
import com.marketplacesystem.util.AppConstants;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(AppConstants.API_VERSION_1 + "/payments")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @PostMapping("/orders/{orderId}")
    public ResponseEntity<ApiResponse<PaymentResponse>> payForOrder(
            @PathVariable Long orderId,
            @Valid @RequestBody PaymentRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        PaymentResponse response = paymentService.createPayment(orderId, request, principal);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(response, "Payment processed"));
    }

    @GetMapping("/orders/{orderId}")
    public ResponseEntity<ApiResponse<PaymentResponse>> getPaymentForOrder(
            @PathVariable Long orderId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(paymentService.getPaymentByOrderId(orderId, principal)));
    }

    @GetMapping("/my")
    public ResponseEntity<ApiResponse<PagedResponse<PaymentResponse>>> getMyPayments(
            @AuthenticationPrincipal UserPrincipal principal,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(paymentService.getMyPayments(principal, pageable)));
    }

    @GetMapping("/admin")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<PagedResponse<PaymentResponse>>> getAllPayments(
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(paymentService.getAllPayments(pageable)));
    }

    @PostMapping("/{paymentId}/refund")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<PaymentResponse>> refundPayment(
            @PathVariable Long paymentId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(paymentService.refundPayment(paymentId, principal),
                "Payment refunded"));
    }
}
