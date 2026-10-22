package com.quickcart.order.controller;

import com.quickcart.order.dto.CreateOrderRequest;
import com.quickcart.order.dto.CreateOrderResponse;
import com.quickcart.order.dto.OrderResponse;
import com.quickcart.order.service.OrderService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/orders")
public class OrderController {
    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping
    public ResponseEntity<CreateOrderResponse> create(@Valid @RequestBody CreateOrderRequest request,
                                                      @RequestHeader(value = "X-User-Id", required = false) String forwardedUserId) {
        CreateOrderResponse response = orderService.createOrder(request, forwardedUserId);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/{id}")
    public OrderResponse get(@PathVariable UUID id) {
        return orderService.getOrder(id);
    }

    @PutMapping("/{id}/cancel")
    public OrderResponse cancel(@PathVariable UUID id) {
        return orderService.cancelPendingOrder(id);
    }
}
