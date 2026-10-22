package com.quickcart.order.kafka;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickcart.order.service.OrderService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.UUID;

@Component
public class PaymentEventConsumer {
    private final OrderService orderService;
    private final ObjectMapper objectMapper;

    public PaymentEventConsumer(OrderService orderService, ObjectMapper objectMapper) {
        this.orderService = orderService;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "payment.completed", groupId = "order-service")
    public void paymentCompleted(ConsumerRecord<String, String> record) throws Exception {
        JsonNode event = objectMapper.readTree(record.value());
        orderService.handlePaymentCompleted(eventId(record), UUID.fromString(event.get("orderId").asText()),
                event.get("paymentId").asText(), new BigDecimal(event.get("amount").asText()));
    }

    @KafkaListener(topics = "payment.failed", groupId = "order-service")
    public void paymentFailed(ConsumerRecord<String, String> record) throws Exception {
        JsonNode event = objectMapper.readTree(record.value());
        orderService.handlePaymentFailed(eventId(record), UUID.fromString(event.get("orderId").asText()),
                event.path("reason").asText("Payment failed"));
    }

    private String eventId(ConsumerRecord<String, String> record) {
        if (record.key() != null && !record.key().isBlank()) {
            return record.topic() + ":" + record.key();
        }
        return record.topic() + ":" + record.partition() + ":" + record.offset();
    }
}
