package com.quickcart.order.service;

import com.quickcart.order.dto.OrderItemRequest;
import com.quickcart.restaurant.grpc.Item;
import com.quickcart.restaurant.grpc.MenuServiceGrpc;
import com.quickcart.restaurant.grpc.ValidateRequest;
import com.quickcart.restaurant.grpc.ValidateResponse;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class RestaurantGrpcClient {
    private final MenuServiceGrpc.MenuServiceBlockingStub menuStub;

    public RestaurantGrpcClient(MenuServiceGrpc.MenuServiceBlockingStub menuStub) {
        this.menuStub = menuStub;
    }

    @Retry(name = "restaurantGrpc", fallbackMethod = "fallback")
    @CircuitBreaker(name = "restaurantGrpc", fallbackMethod = "fallback")
    public ValidateResponse validateItems(String restaurantId, List<OrderItemRequest> items) {
        ValidateRequest.Builder request = ValidateRequest.newBuilder().setRestaurantId(restaurantId);
        items.forEach(item -> request.addItems(Item.newBuilder()
                .setItemId(item.itemId())
                .setQty(item.qty())
                .build()));
        return menuStub.validateItems(request.build());
    }

    @SuppressWarnings("unused")
    ValidateResponse fallback(String restaurantId, List<OrderItemRequest> items, Throwable throwable) {
        throw new RestaurantUnavailableException("Restaurant service unavailable");
    }
}
