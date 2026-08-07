package com.marketplacesystem.mapper;

import com.marketplacesystem.dto.PaymentResponse;
import com.marketplacesystem.entity.Payment;
import org.springframework.stereotype.Component;

@Component
public class PaymentMapper {

    public PaymentResponse toResponse(Payment payment) {
        return new PaymentResponse(
                payment.getId(),
                payment.getOrder().getId(),
                payment.getOrder().getOrderNumber(),
                payment.getAmount(),
                payment.getCurrency(),
                payment.getMethod(),
                payment.getStatus(),
                payment.getTransactionRef(),
                payment.getPaidAt(),
                payment.getCreatedAt());
    }
}
