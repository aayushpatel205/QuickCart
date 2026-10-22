package com.quickcart.order.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record CreateOrderRequest(
        @NotBlank String userId,
        @NotBlank String restaurantId,
        @NotEmpty List<@Valid OrderItemRequest> items,
        @NotBlank String address) {
}
