package com.quickcart.order.service;

import com.quickcart.order.entity.Order;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class NotificationPublisher {
    private final RabbitTemplate rabbitTemplate;
    private final String exchange;
    private final String routingKey;

    public NotificationPublisher(RabbitTemplate rabbitTemplate,
                                 @Value("${quickcart.rabbit.exchange}") String exchange,
                                 @Value("${quickcart.rabbit.routing-key}") String routingKey) {
        this.rabbitTemplate = rabbitTemplate;
        this.exchange = exchange;
        this.routingKey = routingKey;
    }

    public void orderPlaced(Order order) {
        send(order, "ORDER_PLACED", "Order placed and waiting for payment");
    }

    public void orderConfirmed(Order order) {
        send(order, "ORDER_CONFIRMED", "Payment completed and order confirmed");
    }

    public void paymentFailed(Order order, String reason) {
        send(order, "PAYMENT_FAILED", reason);
    }

    private void send(Order order, String type, String message) {
        rabbitTemplate.convertAndSend(exchange, routingKey, Map.of(
                "orderId", order.getId().toString(),
                "userId", order.getUserId(),
                "type", type,
                "message", message
        ));
    }
}
