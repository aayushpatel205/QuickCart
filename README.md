# QuickCart Order Service

Small Spring Boot 3 order-service for the QuickCart microservices assignment.

## What It Provides

- REST on port `8081`
- PostgreSQL database `orderdb`
- gRPC client call to restaurant-service `MenuService.ValidateItems`
- Transactional outbox table for `order.created`, `order.confirmed`, and `order.cancelled`
- Kafka consumers for `payment.completed` and `payment.failed`
- RabbitMQ notification producer
- Actuator health and Prometheus metrics

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/orders` | Create a pending order |
| `GET` | `/orders/{id}` | Get order details |
| `PUT` | `/orders/{id}/cancel` | Cancel a pending order |
| `GET` | `/health` | Health alias |
| `GET` | `/metrics` | Prometheus metrics alias |
| `GET` | `/actuator/prometheus` | Prometheus metrics |

## Run Locally

Start infrastructure:

```bash
docker compose up -d order-postgres kafka kafka-connect rabbitmq
```

Create Kafka topics from inside a Kafka container or any environment with `kafka-topics.sh`:

```bash
KAFKA_BOOTSTRAP_SERVERS=localhost:9092 sh infra/kafka/create-topics.sh
```

Register the Debezium connector:

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d @infra/debezium/order-outbox-connector.json
```

If you use the included `docker-compose.yml`, Kafka Connect is mapped to host port `8086` to avoid clashing with the payment-service port, so use:

```bash
curl -X POST http://localhost:8086/connectors \
  -H "Content-Type: application/json" \
  -d @infra/debezium/order-outbox-connector.json
```

Run the service:

```bash
mvn spring-boot:run
```

The restaurant-service gRPC endpoint must be reachable at `RESTAURANT_GRPC_HOST:RESTAURANT_GRPC_PORT`.

## Example Requests

Create an order:

```bash
curl -X POST http://localhost:8081/orders \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: demo-123" \
  -H "X-User-Id: user-1" \
  -d '{
    "userId": "user-1",
    "restaurantId": "rest-1",
    "items": [{"itemId": "burger", "qty": 2}],
    "address": "Hostel Block A"
  }'
```

Get an order:

```bash
curl http://localhost:8081/orders/<order-id>
```

Cancel a pending order:

```bash
curl -X PUT http://localhost:8081/orders/<order-id>/cancel
```

## Kafka and Debezium

The application never publishes order lifecycle events to Kafka directly from the order creation or payment handling code path. It writes rows to `outbox` in the same PostgreSQL transaction as the order state change. Debezium watches `public.outbox`, uses the Outbox Event Router SMT, and routes events to Kafka topics named by `event_type`:

- `order.created`
- `order.confirmed`
- `order.cancelled`

All Kafka contract topics are created by `infra/kafka/create-topics.sh`:

- `order.created`
- `payment.completed`
- `payment.failed`
- `order.confirmed`
- `order.cancelled`
- `delivery.assigned`

The order PostgreSQL deployment and compose service enable logical decoding with `wal_level=logical`.

## Saga State Machine

The order-service owns the order saga state:

```text
PENDING -> CONFIRMED
PENDING -> CANCELLED
```

`POST /orders` creates a `PENDING` order. When `payment.completed` arrives, the service confirms the order and emits `order.confirmed` through the outbox. When `payment.failed` arrives, it cancels the order and emits `order.cancelled` through the outbox. Duplicate Kafka deliveries are skipped using the `processed_events` table.

## Report Paragraph

Saga is implemented in `OrderService`, where the order-service owns the state machine `PENDING -> CONFIRMED | CANCELLED` and reacts to payment Kafka events. The Transactional Outbox and ACID behavior are implemented in the `@Transactional` methods that save the order/order items and an `outbox` row in one PostgreSQL transaction. CDC is handled by Debezium with the Outbox Event Router SMT in `infra/debezium/order-outbox-connector.json`, which routes outbox rows to Kafka topics by `event_type`. Circuit Breaker and Retry are implemented in `RestaurantGrpcClient` with Resilience4j around the gRPC item validation call, returning HTTP 503 when the restaurant-service is unavailable.

## Kubernetes

Apply the namespace, database, Kafka/Debezium, then app manifests:

```bash
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/order-postgres.yaml
kubectl apply -f infra/k8s/kafka-debezium.yaml
kubectl apply -f infra/k8s/order-service.yaml
```
