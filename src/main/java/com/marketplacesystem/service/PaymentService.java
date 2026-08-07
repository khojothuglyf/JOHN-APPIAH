package com.marketplacesystem.service;

import com.marketplacesystem.dto.PagedResponse;
import com.marketplacesystem.dto.PaymentRequest;
import com.marketplacesystem.dto.PaymentResponse;
import com.marketplacesystem.security.UserPrincipal;
import org.springframework.data.domain.Pageable;

public interface PaymentService {

    PaymentResponse createPayment(Long orderId, PaymentRequest request, UserPrincipal principal);

    PaymentResponse getPaymentByOrderId(Long orderId, UserPrincipal principal);

    PagedResponse<PaymentResponse> getMyPayments(UserPrincipal principal, Pageable pageable);

    PagedResponse<PaymentResponse> getAllPayments(Pageable pageable);

    PaymentResponse refundPayment(Long paymentId, UserPrincipal principal);

    void requirePaymentBeforeShipping(Long orderId);

    void completeCodOnDelivery(Long orderId);

    void autoRefundOnCancel(Long orderId);
}
