package com.quickcart.order.dto;

import java.math.BigDecimal;

public record OrderItemResponse(String itemId, int qty, BigDecimal price) {
}
