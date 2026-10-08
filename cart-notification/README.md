# QuickCart – Cart & Notification Service
This service is part of the QuickCart microservice architecture, built with C# (.NET 8).

## Endpoints

- `POST /cart/{userId}/items` : Add item to cart
- `GET /cart/{userId}` : View cart
- `DELETE /cart/{userId}/items/{itemId}` : Remove item
- `POST /cart/{userId}/checkout` : Checkout cart (calls order-service)
- `GET /orders/{orderId}/tracking` : Order tracking (CQRS view)
- `GET /notifications/{userId}` : Get user notifications
- `GET /health` : Liveness/Readiness probe
- `GET /metrics` : Prometheus metrics

## Run Steps (Local)

1. Run the entire stack via Docker Compose from the root directory:
   ```bash
   docker compose up --build -d
   ```
2. For Kubernetes deployment, simply run the provided deploy script:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

## Example cURL Commands

```bash
# Add to cart
curl -X POST http://localhost:8085/cart/user-123/items \
  -H 'Content-Type: application/json' \
  -d '{"RestaurantId":"R1","ItemId":"I1","Name":"Pizza","Price":15.0,"Qty":1}'

# Checkout
curl -X POST http://localhost:8085/cart/user-123/checkout \
  -H 'Content-Type: application/json' \
  -d '{"Address":"123 Main St"}'
```

## Report Justifications (Why C# / Redis?)

- **CQRS**: Kafka events update `orderview:{orderId}` in Redis, shielding the Order DB from heavy tracking requests.
- **BASE Consistency**: Perfect for shopping carts, where eventual consistency and TTL evictions are acceptable. Redis ensures fast, in-memory KV lookups.
- **Async Messaging**: Event-driven architecture uses Kafka for broad domain events and RabbitMQ for direct notification queueing.
- **DLQ**: Implemented in RabbitMQ (`notification.dlq`) to capture failed notifications after 3 Polly retries, ensuring no messages are silently ignored.
- **Network Policies**: Kubernetes isolates the services. Cart can talk to Redis, Kong can route to Cart, but Cart cannot touch Order's PostgreSQL.
- **Kubernetes Orchestration**: Features a promtail sidecar container, auto-scaling (HPA), ResourceQuotas, and secret injection.
