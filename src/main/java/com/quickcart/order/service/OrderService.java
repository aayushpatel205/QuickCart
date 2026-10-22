package com.quickcart.order.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickcart.order.dto.CreateOrderRequest;
import com.quickcart.order.dto.CreateOrderResponse;
import com.quickcart.order.dto.OrderItemResponse;
import com.quickcart.order.dto.OrderResponse;
import com.quickcart.order.entity.Order;
import com.quickcart.order.entity.OrderItem;
import com.quickcart.order.entity.OrderStatus;
import com.quickcart.order.entity.OutboxEvent;
import com.quickcart.order.entity.ProcessedEvent;
import com.quickcart.order.repository.OrderRepository;
import com.quickcart.order.repository.OutboxRepository;
import com.quickcart.order.repository.ProcessedEventRepository;
import com.quickcart.restaurant.grpc.ValidateResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class OrderService {
    private static final Logger log = LoggerFactory.getLogger(OrderService.class);
    private final OrderRepository orderRepository;
    private final OutboxRepository outboxRepository;
    private final ProcessedEventRepository processedEventRepository;
    private final RestaurantGrpcClient restaurantGrpcClient;
    private final NotificationPublisher notificationPublisher;
    private final ObjectMapper objectMapper;

    public OrderService(OrderRepository orderRepository,
                        OutboxRepository outboxRepository,
                        ProcessedEventRepository processedEventRepository,
                        RestaurantGrpcClient restaurantGrpcClient,
                        NotificationPublisher notificationPublisher,
                        ObjectMapper objectMapper) {
        this.orderRepository = orderRepository;
        this.outboxRepository = outboxRepository;
        this.processedEventRepository = processedEventRepository;
        this.restaurantGrpcClient = restaurantGrpcClient;
        this.notificationPublisher = notificationPublisher;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public CreateOrderResponse createOrder(CreateOrderRequest request, String forwardedUserId) {
        String effectiveUserId = forwardedUserId == null || forwardedUserId.isBlank() ? request.userId() : forwardedUserId;
        ValidateResponse validation = restaurantGrpcClient.validateItems(request.restaurantId(), request.items());
        if (!validation.getValid()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, validation.getMessage());
        }

        UUID orderId = UUID.randomUUID();
        MDC.put("orderId", orderId.toString());
        Order order = new Order();
        order.setId(orderId);
        order.setUserId(effectiveUserId);
        order.setRestaurantId(request.restaurantId());
        order.setAmount(BigDecimal.valueOf(validation.getTotalPrice()).setScale(2, RoundingMode.HALF_UP));
        order.setStatus(OrderStatus.PENDING);
        order.setAddress(request.address());
        order.setCreatedAt(OffsetDateTime.now());

        BigDecimal unitPrice = request.items().isEmpty()
                ? BigDecimal.ZERO
                : order.getAmount().divide(BigDecimal.valueOf(totalQuantity(request)), 2, RoundingMode.HALF_UP);
        request.items().forEach(itemRequest -> {
            OrderItem item = new OrderItem();
            item.setItemId(itemRequest.itemId());
            item.setQty(itemRequest.qty());
            item.setPrice(unitPrice.multiply(BigDecimal.valueOf(itemRequest.qty())));
            order.addItem(item);
        });

        orderRepository.save(order);
        writeOutbox(order, "order.created", Map.of(
                "orderId", order.getId(),
                "userId", order.getUserId(),
                "amount", order.getAmount(),
                "items", order.getItems().stream().map(i -> Map.of(
                        "itemId", i.getItemId(),
                        "qty", i.getQty(),
                        "price", i.getPrice()
                )).toList(),
                "address", order.getAddress(),
                "timestamp", OffsetDateTime.now().toString()
        ));
        // ACID point: order, order_items, and outbox are written in this one DB transaction.
        notificationPublisher.orderPlaced(order);
        log.info("Created pending order");
        return new CreateOrderResponse(order.getId(), order.getStatus().name());
    }

    @Transactional(readOnly = true)
    public OrderResponse getOrder(UUID id) {
        return toResponse(findOrder(id));
    }

    @Transactional
    public OrderResponse cancelPendingOrder(UUID id) {
        Order order = findOrder(id);
        MDC.put("orderId", id.toString());
        if (order.getStatus() != OrderStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only PENDING orders can be cancelled");
        }
        order.setStatus(OrderStatus.CANCELLED);
        writeOutbox(order, "order.cancelled", Map.of(
                "orderId", order.getId(),
                "reason", "Cancelled by user",
                "timestamp", OffsetDateTime.now().toString()
        ));
        notificationPublisher.paymentFailed(order, "Order cancelled by user");
        log.info("Cancelled pending order");
        return toResponse(order);
    }

    @Transactional
    public void handlePaymentCompleted(String eventId, UUID orderId, String paymentId, BigDecimal amount) {
        if (processedEventRepository.existsById(eventId)) {
            log.info("Skipping duplicate payment.completed event {}", eventId);
            return;
        }
        Order order = findOrder(orderId);
        MDC.put("orderId", orderId.toString());
        if (order.getStatus() == OrderStatus.PENDING) {
            order.setStatus(OrderStatus.CONFIRMED);
            writeOutbox(order, "order.confirmed", Map.of(
                    "orderId", order.getId(),
                    "userId", order.getUserId(),
                    "address", order.getAddress(),
                    "timestamp", OffsetDateTime.now().toString()
            ));
            notificationPublisher.orderConfirmed(order);
        }
        processedEventRepository.save(new ProcessedEvent(eventId, OffsetDateTime.now()));
        log.info("Handled payment.completed event");
    }

    @Transactional
    public void handlePaymentFailed(String eventId, UUID orderId, String reason) {
        if (processedEventRepository.existsById(eventId)) {
            log.info("Skipping duplicate payment.failed event {}", eventId);
            return;
        }
        Order order = findOrder(orderId);
        MDC.put("orderId", orderId.toString());
        if (order.getStatus() == OrderStatus.PENDING) {
            order.setStatus(OrderStatus.CANCELLED);
            writeOutbox(order, "order.cancelled", Map.of(
                    "orderId", order.getId(),
                    "reason", reason,
                    "timestamp", OffsetDateTime.now().toString()
            ));
            notificationPublisher.paymentFailed(order, reason);
        }
        processedEventRepository.save(new ProcessedEvent(eventId, OffsetDateTime.now()));
        log.info("Handled payment.failed event");
    }

    private Order findOrder(UUID id) {
        return orderRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));
    }

    private void writeOutbox(Order order, String eventType, Map<String, Object> payload) {
        try {
            OutboxEvent outbox = new OutboxEvent();
            outbox.setId(UUID.randomUUID());
            outbox.setAggregateId(order.getId());
            outbox.setEventType(eventType);
            outbox.setPayload(objectMapper.writeValueAsString(payload));
            outbox.setCreatedAt(OffsetDateTime.now());
            outboxRepository.save(outbox);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not serialize outbox payload", e);
        }
    }

    private OrderResponse toResponse(Order order) {
        List<OrderItemResponse> items = order.getItems().stream()
                .map(item -> new OrderItemResponse(item.getItemId(), item.getQty(), item.getPrice()))
                .toList();
        return new OrderResponse(order.getId(), order.getUserId(), order.getRestaurantId(),
                order.getAmount(), order.getStatus().name(), order.getAddress(), order.getCreatedAt(), items);
    }

    private int totalQuantity(CreateOrderRequest request) {
        return request.items().stream().mapToInt(item -> item.qty()).sum();
    }
}
