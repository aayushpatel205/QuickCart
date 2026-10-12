# QuickCart — Delivery Service

> Go (Gin) microservice that manages delivery assignment and tracking, with centralized logging via Loki + Promtail.

---

## Architecture

```
                       ┌─────────────────┐
  order.confirmed ───> │ delivery-service │ ───> delivery.assigned (Kafka)
       (Kafka)         │   Go + Gin       │ ───> DRIVER_ASSIGNED  (RabbitMQ)
                       │   PostgreSQL     │
                       └────────┬────────┘
                                │
                    ┌───────────┴───────────┐
                    │  Promtail sidecar     │ ──> Loki ──> Grafana
                    └───────────────────────┘
```

## Tech Stack

| Component       | Technology                          |
|-----------------|-------------------------------------|
| Language        | Go 1.21                             |
| HTTP Framework  | Gin                                 |
| Database        | PostgreSQL (pgx driver)             |
| Message Broker  | Apache Kafka (segmentio/kafka-go)   |
| Notifications   | RabbitMQ (amqp091-go)               |
| Circuit Breaker | sony/gobreaker                      |
| Logging         | zerolog (structured JSON)           |
| Metrics         | prometheus/client_golang            |
| Centralized Log | Loki + Promtail + Grafana           |

---

## REST Endpoints

| Method | Path                          | Description                          | Auth        |
|--------|-------------------------------|--------------------------------------|-------------|
| GET    | `/health`                     | Liveness/readiness probe             | None        |
| GET    | `/metrics`                    | Prometheus metrics                   | None        |
| GET    | `/deliveries/{orderId}`       | Delivery status and driver info      | Any         |
| PUT    | `/deliveries/{orderId}/status`| Update status (PICKED_UP/ON_THE_WAY/DELIVERED) | DRIVER role |
| GET    | `/drivers`                    | List all drivers with availability   | Any         |

---

## Database Schema

```sql
drivers         (id SERIAL PK, name, phone, available BOOL)
deliveries      (id UUID PK, order_id UNIQUE, driver_id FK, status, address, assigned_at, updated_at)
processed_events(event_id TEXT PK)   -- idempotency table
```

5 drivers are seeded on first startup.

---

## Event Flow

1. **Consume** `order.confirmed` from Kafka (consumer group: `delivery-service`)
2. **Assign** an available driver using `SELECT ... FOR UPDATE SKIP LOCKED` (concurrency safe)
3. **Publish** `delivery.assigned` to Kafka
4. **Publish** `DRIVER_ASSIGNED` notification to RabbitMQ exchange `quickcart.notifications`
5. **Status updates** via REST (`PICKED_UP → ON_THE_WAY → DELIVERED`) also publish to RabbitMQ
6. When `DELIVERED`, the driver is released back to the available pool

---

## Running Locally

### Prerequisites

- Docker & Docker Compose
- PostgreSQL, Kafka, RabbitMQ running (or use the project's docker-compose)

### Environment Variables

```bash
export PORT=8084
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_PASSWORD=postgres
export DB_NAME=deliverydb
export KAFKA_BROKERS=localhost:9092
export RABBITMQ_URL=amqp://guest:guest@localhost:5672/
export SERVICE_NAME=delivery-service
```

### Build & Run

```bash
# With Go installed
go mod download
go run ./cmd/server

# With Docker Compose (starts PostgreSQL + Delivery Service)
docker compose up -d

# With Docker
docker build --platform linux/amd64 -t quickcartteam/delivery-service:v1 .
docker run -p 8084:8084 \
  -e DB_HOST=host.docker.internal \
  -e KAFKA_BROKERS=host.docker.internal:9092 \
  -e RABBITMQ_URL=amqp://guest:guest@host.docker.internal:5672/ \
  quickcartteam/delivery-service:v1
```

---

## Example curl Commands

### Health Check
```bash
curl http://localhost:8084/health
# {"status":"UP","db":"ok"}
```

### List Drivers
```bash
curl http://localhost:8084/drivers
# [{"id":1,"name":"Rahul Sharma","phone":"+91-9876543210","available":true}, ...]
```

### Get Delivery Status
```bash
curl http://localhost:8084/deliveries/ORD-001
# {"id":"...","orderId":"ORD-001","driverId":1,"driverName":"Rahul Sharma","driverPhone":"+91-9876543210",
#  "status":"ASSIGNED","address":"123 Main St","assignedAt":"...","updatedAt":"..."}
```

### Update Delivery Status (requires DRIVER role)
```bash
curl -X PUT http://localhost:8084/deliveries/ORD-001/status \
  -H "Content-Type: application/json" \
  -H "X-User-Role: DRIVER" \
  -H "X-User-Id: driver-1" \
  -H "X-Correlation-Id: abc-123" \
  -d '{"status":"PICKED_UP"}'
# {"message":"status updated","status":"PICKED_UP"}

curl -X PUT http://localhost:8084/deliveries/ORD-001/status \
  -H "Content-Type: application/json" \
  -H "X-User-Role: DRIVER" \
  -H "X-User-Id: driver-1" \
  -d '{"status":"DELIVERED"}'
# {"message":"status updated","status":"DELIVERED"}
```

### Prometheus Metrics
```bash
curl http://localhost:8084/metrics
# HELP http_requests_total Total number of HTTP requests processed.
# TYPE http_requests_total counter
# ...
```

---

## Kubernetes Deployment

```bash
# Apply the namespace and delivery service resources
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/delivery-secret.yaml
kubectl apply -f k8s/delivery-db.yaml
kubectl apply -f k8s/delivery.yaml

# Logging stack (Person 4 handoff)
kubectl apply -f infra/loki/configmap.yaml
kubectl apply -f infra/loki/deployment.yaml
kubectl apply -f infra/loki/service.yaml
kubectl apply -f infra/loki/daemonset.yaml
kubectl apply -f infra/loki/loki-datasource.yaml
```

The deployment includes a **Promtail sidecar** that ships app logs to Loki, plus a **Promtail DaemonSet** that collects stdout from all pods in the `quickcart` namespace.

---

## LogQL Queries (Grafana → Explore → Loki)

### 1. All errors across the entire system
```logql
{namespace="quickcart"} | json | level="error"
```

### 2. All logs for a specific order
```logql
{namespace="quickcart"} | json | orderId="ORD-001"
```

### 3. Logs from a specific service
```logql
{namespace="quickcart", app="delivery-service"} | json
```

---

## Report: Where Each Concept Is Implemented

### Polyglot Programming
The delivery-service is written in **Go (Gin)**, while other QuickCart services use Java (order-service), Node.js (restaurant-service), Python (payment-service), and C# (cart-notification). All communicate via language-agnostic protocols: REST, Kafka, RabbitMQ, and gRPC — demonstrating that microservices can choose the best language per domain without coupling.

### Event-Driven Design
The service **consumes** `order.confirmed` events from Kafka to trigger driver assignment, and **produces** `delivery.assigned` events that downstream consumers (e.g., cart-notification) react to. No synchronous call chain exists between order → delivery — the decoupled event flow allows each service to scale, deploy, and fail independently.

### Async Messaging
RabbitMQ is used to push **real-time notifications** (DRIVER_ASSIGNED, status updates) to the cart-notification service. The `quickcart.notifications` exchange with a dead-letter queue ensures reliable message delivery, while a **sony/gobreaker circuit breaker** prevents cascading failures when RabbitMQ is temporarily unavailable.

### Centralized Logging
All services emit **structured JSON logs** (zerolog) to stdout with fields: `timestamp`, `level`, `service`, `orderId`, `correlationId`. **Promtail** (deployed as a Kubernetes DaemonSet and as a pod sidecar) collects logs from all pods in the `quickcart` namespace and ships them to **Loki**. **Grafana** provides a unified query interface using **LogQL** to search, filter, and correlate logs across all five polyglot services.

### Concurrency Control
Driver assignment uses PostgreSQL's `SELECT ... FOR UPDATE SKIP LOCKED` within a single transaction. This pessimistic locking strategy ensures that even when multiple `order.confirmed` events arrive simultaneously, **two orders can never be assigned the same driver**. The `SKIP LOCKED` hint prevents blocking — concurrent transactions simply pick the next available driver, enabling high throughput without deadlocks. An idempotency table (`processed_events`) prevents duplicate Kafka messages from creating duplicate assignments.
