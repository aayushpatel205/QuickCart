package com.quickcart.order.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record OrderResponse(
        UUID orderId,
        String userId,
        String restaurantId,
        BigDecimal amount,
        String status,
        String address,
        OffsetDateTime createdAt,
        List<OrderItemResponse> items) {
}
