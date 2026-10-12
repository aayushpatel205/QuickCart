# QuickCart – Payment Service

**Python 3.12 · FastAPI · PostgreSQL · Kafka · Prometheus**

The payment service handles all payment processing for the QuickCart food ordering platform.  
It runs on port **8083** and is reachable via the Kong API Gateway at `/payments`.

---

## Project Structure

```
payment-service/
├── app/
│   ├── main.py              # FastAPI app, lifespan, Prometheus middleware
│   ├── config.py            # All config from env vars (12-factor)
│   ├── database.py          # Async SQLAlchemy engine + session factory
│   ├── models.py            # ORM models: payments, processed_events
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── payment_service.py   # Core business logic (shared by REST + Kafka)
│   ├── kafka_consumer.py    # Consumes order.created events
│   ├── kafka_producer.py    # Publishes payment.completed / payment.failed
│   ├── circuit_breaker.py   # pybreaker + tenacity resilience
│   ├── metrics.py           # Custom Prometheus metrics
│   ├── logging_config.py    # Structured JSON logging
│   └── routers/
│       └── payments.py      # REST endpoints
├── alembic/                 # Database migrations
│   ├── env.py
│   └── versions/
│       └── 0001_initial.py
├── k8s/
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── deployment.yaml      # App + Fluent Bit sidecar
│   └── service.yaml
├── alembic.ini
├── Dockerfile               # Multi-stage, non-root
├── requirements.txt
└── README.md
```

---

## REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/payments/pay` | Initiate a payment (manual/test) |
| `GET` | `/payments/{orderId}` | Get payment status by order ID |
| `POST` | `/payments/{orderId}/refund` | Refund a completed payment |
| `GET` | `/health` | Liveness + readiness probe |
| `GET` | `/metrics` | Prometheus metrics |

---

## Quick Start (Local / Docker Compose)

### Prerequisites
- Docker & Docker Compose
- Python 3.12+ (for local dev without Docker)

### 1. Clone and set up environment

```bash
# Copy env template
cp .env.example .env
# Edit .env with your local PostgreSQL and Kafka settings
```

### 2. Run with Docker Compose (recommended for local testing)

```bash
# From the project root (where docker-compose.yml lives)
docker compose up payment-service payment-postgres kafka
```

### 3. Run locally (no Docker)

```bash
cd payment-service
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run DB migrations
alembic upgrade head

# Start the service
uvicorn app.main:app --host 0.0.0.0 --port 8083 --reload
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `paymentdb` | Database name |
| `DB_USER` | `payment_user` | DB username |
| `DB_PASSWORD` | `payment_pass` | DB password (from K8s Secret) |
| `KAFKA_BOOTSTRAP_SERVERS` | `kafka:9092` | Kafka brokers |
| `KAFKA_CONSUMER_GROUP` | `payment-service` | Consumer group ID |
| `PAYMENT_SUCCESS_THRESHOLD_AMOUNT` | `5000` | Fail if amount ≥ this value |
| `PAYMENT_RANDOM_FAIL_PERCENT` | `10` | % of random gateway failures |
| `CB_FAIL_MAX` | `5` | Circuit breaker: open after N failures |
| `CB_RESET_TIMEOUT` | `60` | Circuit breaker: reset timeout (seconds) |
| `LOG_LEVEL` | `INFO` | Logging level |

---

## Example curl Commands

### 1. Make a Payment

```bash
curl -X POST http://localhost:8083/payments/pay \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: corr-abc-123" \
  -H "X-User-Id: user-42" \
  -d '{
    "orderId": "order-101",
    "amount": 349.99,
    "method": "UPI",
    "idempotencyKey": "idem-key-001"
  }'
```

**Success response (201):**
```json
{
  "id": "3f2a1b4c-...",
  "orderId": "order-101",
  "amount": 349.99,
  "status": "COMPLETED",
  "method": "UPI",
  "idempotencyKey": "idem-key-001",
  "failureReason": null,
  "createdAt": "2026-10-07T15:00:00Z",
  "updatedAt": "2026-10-07T15:00:00Z"
}
```

**Simulated failure (amount ≥ 5000):**
```bash
curl -X POST http://localhost:8083/payments/pay \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order-102",
    "amount": 9999.00,
    "method": "CARD",
    "idempotencyKey": "idem-key-002"
  }'
# Returns status: "FAILED"
```

### 2. Get Payment Status

```bash
curl http://localhost:8083/payments/order-101 \
  -H "X-Correlation-Id: corr-abc-123"
```

### 3. Refund a Payment

```bash
curl -X POST http://localhost:8083/payments/order-101/refund \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: corr-abc-123" \
  -d '{"reason": "Customer requested cancellation"}'
```

### 4. Health Check

```bash
curl http://localhost:8083/health
# {"status":"ok","db":"ok","kafka":"ok"}
```

### 5. Prometheus Metrics

```bash
curl http://localhost:8083/metrics
# payments_total{status="COMPLETED"} 42.0
# payments_total{status="FAILED"} 5.0
# payment_latency_seconds_bucket{le="0.1"} 38.0
# ...
```

---

## Kafka Events

### Consumed: `order.created`

```json
{
  "orderId": "order-101",
  "userId": "user-42",
  "amount": 349.99,
  "items": [{"itemId": "item-1", "qty": 2, "price": 174.99}],
  "address": "123 Main St",
  "timestamp": "2026-10-07T15:00:00Z",
  "correlationId": "corr-abc-123"
}
```

### Published: `payment.completed`

```json
{
  "orderId": "order-101",
  "paymentId": "3f2a1b4c-...",
  "amount": 349.99,
  "timestamp": "2026-10-07T15:00:01Z",
  "correlationId": "corr-abc-123"
}
```

### Published: `payment.failed`

```json
{
  "orderId": "order-102",
  "reason": "Amount 9999.0 exceeds gateway limit 5000.0",
  "timestamp": "2026-10-07T15:00:02Z",
  "correlationId": "corr-abc-123"
}
```

---

## Kubernetes Deployment

```bash
# Apply all resources in order
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Verify pods are running
kubectl get pods -n quickcart -l app=payment-service

# Check logs
kubectl logs -n quickcart -l app=payment-service -c payment-service -f

# Port-forward for local testing
kubectl port-forward -n quickcart svc/payment-service 8083:8083
```

---

## Monitoring Deployment

```bash
# Deploy Prometheus
kubectl apply -f monitoring/prometheus-deployment.yaml

# Deploy Grafana
kubectl apply -f monitoring/grafana-deployment.yaml

# Access Grafana (port-forward)
kubectl port-forward -n quickcart svc/grafana 3000:3000
# Open http://localhost:3000  (admin / quickcart123)

# Access Prometheus
kubectl port-forward -n quickcart svc/prometheus 9090:9090
# Open http://localhost:9090
```

---

## Database Migrations

```bash
# Run all pending migrations
alembic upgrade head

# Create a new migration after model changes
alembic revision --autogenerate -m "add_column_x"

# Rollback one step
alembic downgrade -1
```

---

## Architecture Notes

### ACID Guarantees
Payment writes and refund updates are wrapped in SQLAlchemy DB transactions.  
The `process_payment()` and `process_refund()` functions each execute a `BEGIN … COMMIT` cycle.  
If the Kafka publish fails after the DB commit, the row is still persisted (save-then-publish approach).

### Idempotency
- **REST layer**: `idempotency_key` UNIQUE constraint – duplicate `POST /payments/pay` with the same key returns the existing row without charging again.
- **Kafka consumer**: `processed_events` table stores `partition:offset` event IDs. Duplicates are detected before processing and skipped. The event row is written atomically in the same transaction as the payment row.

### Circuit Breaker & Retry
- `pybreaker` opens the circuit after 5 consecutive gateway failures (configurable via `CB_FAIL_MAX`).
- `tenacity` retries up to 3 times with exponential backoff (0.5 s → 4 s) for transient `GatewayError`.
- When the circuit is OPEN, `CircuitBreakerError` is raised immediately and `payment.failed` is published with reason `"gateway unavailable"`.

### Event-Driven Communication
The service is a Kafka consumer (`order.created` → `payment-service` group) and producer (`payment.completed` / `payment.failed`).  
Events carry `orderId`, `timestamp`, and `correlationId` for distributed tracing.

### Monitoring
- **Custom Prometheus metrics**: `payments_total{status}` (counter) and `payment_latency_seconds` (histogram) at `/metrics`.
- **Grafana dashboard**: pre-provisioned panels for RPS, error rate, P95 latency, payment completed vs failed, and Kafka consumer lag.
- **Alert rules**: ServiceDown, HighErrorRate, PaymentFailureSpike, HighLatencyP95.
