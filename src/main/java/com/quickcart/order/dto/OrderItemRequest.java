package com.quickcart.order.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record OrderItemRequest(@NotBlank String itemId, @Min(1) int qty) {
}
