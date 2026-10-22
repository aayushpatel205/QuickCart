# QuickCart — Restaurant Service & API Gateway (Kong)

[![Microservices](https://img.shields.io/badge/Architecture-Microservices-blue.svg)](#)
[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)](#)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey.svg)](#)
[![gRPC](https://img.shields.io/badge/gRPC-v1.10-blue.svg)](#)
[![MongoDB](https://img.shields.io/badge/Database-MongoDB_7.0-brightgreen.svg)](#)
[![Kong](https://img.shields.io/badge/Gateway-Kong_DB--less-black.svg)](#)
[![License](https://img.shields.io/badge/Assignment-College_MAP_Assignment_C-orange.svg)](#)

This repository contains the complete implementation of the **Restaurant Service** (Node.js/Express + gRPC + MongoDB) and the centralized **API Gateway** (Kong in DB-less declarative mode) for **QuickCart**, a polyglot microservices-based online food ordering platform.

---

## Table of Contents
1. [Architecture Overview & Shared Contract](#architecture-overview--shared-contract)
2. [Why MongoDB Suits Restaurant Menus (Document DB Rationalization)](#why-mongodb-suits-restaurant-menus)
3. [Service Discovery with Kubernetes DNS](#service-discovery-with-kubernetes-dns)
4. [Project Structure](#project-structure)
5. [Quick Start & Running Locally](#quick-start--running-locally)
   - [Running with Docker Compose](#running-with-docker-compose-recommended)
   - [Running Manually (Node.js + MongoDB)](#running-manually)
6. [Testing the gRPC MenuService](#testing-the-grpc-menuservice)
7. [API Gateway (Kong DB-less) & JWT Security Helper](#api-gateway-kong-db-less--jwt-security-helper)
8. [cURL Command Reference & Examples](#curl-command-reference--examples)
9. [Resilience (Opossum Circuit Breaker)](#resilience-opossum-circuit-breaker)
10. [Observability (Prometheus & Pino JSON Logs)](#observability-prometheus--pino-json-logs)
11. [Kubernetes Deployment & TLS Setup](#kubernetes-deployment--tls-setup)
12. [College Assignment Report Paragraph](#college-assignment-report-paragraph)

---

## Architecture Overview & Shared Contract

QuickCart is designed around independent, loosely coupled microservices operating under a polyglot persistence paradigm:

| Service | Technology Stack | Transport / Ports | Database | Role & Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **order-service** | Java 17 + Spring Boot | REST `8081` | PostgreSQL (`orderdb`) | Orchestrates orders, transactional outbox to Kafka |
| **restaurant-service** (This service) | Node.js + Express | REST `8082`, gRPC `50051` | MongoDB (`restaurantdb`) | Restaurant catalogs, menus, item availability, gRPC price validation |
| **payment-service** | Python + FastAPI | REST `8083` | PostgreSQL (`paymentdb`) | Payment processing via Kafka events |
| **delivery-service** | Go + Gin | REST `8084` | PostgreSQL (`deliverydb`) | Driver assignment & dispatch |
| **cart-notification** | C# .NET 8 Web API | REST `8085` | Redis | Cart management, RabbitMQ consumer, CQRS read model |
| **api-gateway** | Kong (DB-less mode) | HTTP `8080`, HTTPS `8443` | N/A (Declarative `kong.yml`) | Entry point, JWT termination, rate limiting, request tracing |

### Shared Interaction Flows
1. **Cart/Customer** initiates order via `order-service`.
2. **Order Service** issues a synchronous **gRPC call** (`MenuService.ValidateItems`) directly to `restaurant-service:50051` to verify items and obtain authoritative server-calculated prices from the database.
3. Once validated, `order-service` writes the order and outbox record atomically, beginning asynchronous choreography via Kafka and RabbitMQ.

---

## Why MongoDB Suits Restaurant Menus

In QuickCart, we intentionally select **MongoDB (Document Database)** for `restaurant-service` rather than a relational database (RDBMS):

1. **Hierarchical & Nested Data Modeling**: A restaurant menu naturally forms an aggregate root: a restaurant contains categories and menu items (`items: [{ itemId, name, price, available }]`). In a relational database, retrieving a restaurant's menu requires multi-table `JOIN` operations between `restaurants`, `categories`, `items`, and `modifiers`. In MongoDB, the entire restaurant and its menu items reside in a single document, enabling single-read (`O(1)` document lookup) retrieval with minimal I/O.
2. **Flexible & Evolving Schema**: Restaurants frequently introduce varying item attributes (e.g., dietary tags like `vegan`, allergens, nutritional facts, portion sizes, or customization addons). A schema-agnostic document model accommodates diverse menu structures without requiring costly, locking schema migrations (`ALTER TABLE`).
3. **Atomic Subdocument Updates**: Toggling availability (e.g., setting `available: false` when an ingredient runs out) is performed atomically using MongoDB operators (`items.$.available`) without affecting concurrent readers.
4. **Read-Heavy Query Performance**: Restaurant listings and menu browsing represent over 80% of customer traffic. MongoDB’s memory-mapped caching and embedded document design deliver low-latency reads under heavy load.

---

## Service Discovery with Kubernetes DNS

In distributed cloud architectures, services must not rely on hardcoded IP addresses that change as pods are scheduled, restarted, or auto-scaled. QuickCart leverages **Kubernetes CoreDNS Service Discovery**:

- Every service deployed into the `quickcart` namespace gets an immutable internal DNS record following the standard convention:
  $$\text{<service-name>}.\text{<namespace>}.\text{svc.cluster.local}$$
- For example, Kong Gateway routes upstream requests directly to:
  - `http://restaurant-service.quickcart.svc.cluster.local:8082`
  - `http://order-service.quickcart.svc.cluster.local:8081`
  - `http://payment-service.quickcart.svc.cluster.local:8083`
  - `http://delivery-service.quickcart.svc.cluster.local:8084`
  - `http://cart-notification.quickcart.svc.cluster.local:8085`
- The Kubernetes `kube-dns`/`coredns` resolver maps these names to the virtual ClusterIP of each service, and `kube-proxy` transparently load-balances connections across healthy pod endpoints without requiring a dedicated service discovery daemon like Eureka or Consul.

---

## Project Structure

```
Assignment_C/
├── proto/
│   └── menu.proto                   # Shared gRPC protobuf contract
├── gateway/
│   ├── kong.yml                     # Kubernetes DB-less Kong declarative config
│   ├── kong-docker.yml              # Local Docker Compose Kong declarative config
│   └── generate-jwt.js              # Team CLI & HTTP login JWT generator
├── k8s/                             # Complete Kubernetes manifests
│   ├── 00-namespace.yaml            # 'quickcart' namespace
│   ├── 01-restaurant-secret.yaml    # DB credentials & JWT secret
│   ├── 02-restaurant-configmap.yaml # Environment configs & circuit breaker params
│   ├── 03-restaurant-deployment.yaml# 2-container deployment (app + log sidecar)
│   ├── 04-restaurant-service.yaml   # Service exposing ports 8082 and 50051
│   ├── 05-kong-configmap.yaml       # ConfigMap mounting kong.yml into Kong
│   ├── 06-kong-deployment.yaml      # Kong DB-less deployment
│   ├── 07-kong-service.yaml         # External gateway service (8080/8443)
│   └── 08-kong-tls-secret.yaml      # TLS certificate & self-signed instructions
├── scripts/
│   ├── generate-token.js            # Standalone CLI token generator
│   └── test-grpc-client.js          # Full gRPC client test suite
├── src/
│   ├── config/index.js              # Environment variable configuration
│   ├── db/
│   │   ├── connection.js            # Mongoose connection & lifecycle
│   │   ├── models/Restaurant.js     # Schema for restaurants & nested items
│   │   └── seed.js                  # Database seed script (3 restaurants, 5 items each)
│   ├── grpc/
│   │   ├── circuitBreaker.js        # Opossum circuit breaker protecting MongoDB
│   │   └── server.js                # gRPC MenuService.ValidateItems implementation
│   ├── middleware/
│   │   ├── auth.js                  # Forwarded headers (X-User-Role) validation
│   │   ├── correlationId.js         # Distributed tracing (X-Correlation-Id)
│   │   └── metrics.js               # prom-client Prometheus counters & histograms
│   ├── routes/
│   │   ├── health.js                # GET /health liveness & readiness check
│   │   ├── metrics.js               # GET /metrics Prometheus metrics export
│   │   └── restaurants.js           # REST endpoints (/restaurants)
│   ├── utils/logger.js              # Structured Pino JSON logger
│   └── server.js                    # Express + gRPC bootstrap & graceful shutdown
├── test/
│   ├── service.test.js              # Unit tests for proto, models, tokens, calculation
│   └── routes.test.js               # Integration test for express routes & security
├── .dockerignore
├── .env.example
├── Dockerfile                       # Multi-stage build, non-root user (node:20-alpine)
├── docker-compose.yml               # Local stack: Mongo + Restaurant Service + Kong
├── package.json
└── README.md
```

---

## Quick Start & Running Locally

### Prerequisites
- Node.js `v18+` or `v20+`
- (Optional for containers) Docker and Docker Compose
- (Optional for Kubernetes) `kubectl` and Minikube / Kind

### Running with Docker Compose (Recommended)
You can start the entire stack (MongoDB, Restaurant Service, and Kong API Gateway) with a single command:
```bash
docker compose up --build -d
```
Then seed the database:
```bash
docker compose exec restaurant-service npm run seed
```

---

### Running Manually

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   *(Ensure MongoDB is running locally on port 27017, e.g. via `mongod`)*

3. **Seed MongoDB with Sample Restaurants & Menus**:
   ```bash
   npm run seed
   ```
   *Output:*
   ```json
   {"count":3,"ids":["rest-1","rest-2","rest-3"],"msg":"Database seeded successfully!"}
   ```

4. **Run Unit & Route Integration Tests**:
   ```bash
   npm test
   ```

5. **Start the Service**:
   ```bash
   npm start
   # Or for auto-reload during development:
   npm run dev
   ```
   The service will boot:
   - REST API on: `http://localhost:8082`
   - gRPC Server on: `0.0.0.0:50051`

---

## Testing the gRPC MenuService

The service exposes the gRPC contract specified in `proto/menu.proto`:
```protobuf
syntax = "proto3";
package quickcart;

service MenuService {
  rpc ValidateItems(ValidateRequest) returns (ValidateResponse);
}

message Item {
  string itemId = 1;
  int32 qty = 2;
}

message ValidateRequest {
  string restaurantId = 1;
  repeated Item items = 2;
}

message ValidateResponse {
  bool valid = 1;
  double totalPrice = 2;
  string message = 3;
}
```

### Run the Automated gRPC Test Client
Execute the test script:
```bash
npm run test-grpc
```
The test suite covers:
- **Valid Cart Calculation**: Validates `item-101` (qty: 2) and `item-102` (qty: 1) on `rest-1`. Verifies that the server calculates the price directly from the database ($\$12.99 \times 2 + \$16.50 = \$42.48$) and returns `valid = true`.
- **Unavailable Item Handling**: Requests `item-105` (Tiramisu, marked `available: false`). The service returns `valid = false` with `"Item 'Tiramisu Tradizionale' (item-105) is currently marked unavailable"`.
- **Non-existent Item / Restaurant**: Validates appropriate rejection handling.

---

## API Gateway (Kong DB-less) & JWT Security Helper

### Trust Boundary Architecture
1. **Edge Authentication**: Kong terminates the incoming HTTP request and validates the `Authorization: Bearer <JWT>` header using its `jwt` plugin.
2. **Upstream Header Forwarding**: Once Kong verifies the cryptographic signature, downstream services trust the headers forwarded:
   - `X-User-Id`: Extracted user identifier
   - `X-User-Role`: User role (`CUSTOMER` or `ADMIN`)
   - `X-Correlation-Id`: Injected by Kong's `correlation-id` plugin for distributed tracing
3. **Internal Authorization**: The Restaurant Service inspects `X-User-Role`. The `POST /restaurants` endpoint strictly enforces `X-User-Role: ADMIN`.

### Team Login / JWT Generator Helper
To facilitate testing across services, use the token generator:

#### Option A: CLI Generator
```bash
# Generate Customer Token
npm run token:customer

# Generate Admin Token
npm run token:admin
```

#### Option B: Standalone Auth Helper Server
Run the login helper as a lightweight HTTP server on port 8086:
```bash
node gateway/generate-jwt.js --server
```
Then fetch tokens via:
- Customer: `http://localhost:8086/token?role=CUSTOMER`
- Admin: `http://localhost:8086/token?role=ADMIN`

---

## cURL Command Reference & Examples

### 1. Health & Readiness Check
```bash
curl -i http://localhost:8082/health
```
**Response (200 OK):**
```json
{
  "status": "UP",
  "timestamp": "2026-10-12T06:50:00.000Z",
  "uptimeSeconds": 142.5,
  "service": "restaurant-service",
  "checks": {
    "database": {
      "status": "UP",
      "readyState": 1,
      "description": "Connected to MongoDB"
    },
    "grpc": {
      "status": "UP",
      "port": 50051
    }
  }
}
```

---

### 2. Prometheus Observability Metrics
```bash
curl -s http://localhost:8082/metrics
```
*Exports `quickcart_restaurant_*`, `http_requests_total`, `http_request_duration_seconds`, `grpc_requests_total`, and `circuit_breaker_state`.*

---

### 3. List Restaurants (Direct or Through Gateway)

#### Direct via Restaurant Service:
```bash
# All restaurants
curl -i http://localhost:8082/restaurants

# Filter by cuisine
curl -i "http://localhost:8082/restaurants?cuisine=Italian"
```

#### Through Kong API Gateway (Port 8080):
```bash
# Generate token first:
TOKEN=$(node -e "console.log(require('./gateway/generate-jwt').createToken('CUSTOMER').token)")

curl -i -X GET http://localhost:8080/restaurants \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-User-Id: customer-001" \
  -H "X-User-Role: CUSTOMER"
```

---

### 4. Get Menu for a Restaurant
```bash
curl -i http://localhost:8082/restaurants/rest-1/menu
```
**Response (200 OK):**
```json
{
  "success": true,
  "restaurantId": "rest-1",
  "restaurantName": "Bella Italia Trattoria",
  "cuisine": "Italian",
  "menu": [
    { "itemId": "item-101", "name": "Margherita Pizza", "price": 12.99, "available": true },
    { "itemId": "item-102", "name": "Truffle Mushroom Pasta", "price": 16.5, "available": true },
    { "itemId": "item-103", "name": "Classic Lasagna Bolognese", "price": 15, "available": true },
    { "itemId": "item-104", "name": "Crispy Bruschetta", "price": 8.5, "available": true },
    { "itemId": "item-105", "name": "Tiramisu Tradizionale", "price": 7, "available": false }
  ]
}
```

---

### 5. Toggle Item Availability
```bash
# Explicitly mark item-105 as available
curl -i -X PUT http://localhost:8082/restaurants/rest-1/items/item-105/availability \
  -H "Content-Type: application/json" \
  -d '{"available": true}'
```

---

### 6. Create Restaurant (Admin Only)

#### A. Attempt with CUSTOMER Role (Expected: 403 Forbidden):
```bash
curl -i -X POST http://localhost:8082/restaurants \
  -H "Content-Type: application/json" \
  -H "X-User-Id: cust-123" \
  -H "X-User-Role: CUSTOMER" \
  -d '{
    "name": "Unauthorized Bistro",
    "cuisine": "French",
    "address": "123 Rue de Paris"
  }'
```
**Response (403 Forbidden):**
```json
{
  "error": "Forbidden",
  "message": "Access denied: Admin role required via X-User-Role header",
  "receivedRole": "CUSTOMER"
}
```

#### B. Successful Creation with ADMIN Role (Expected: 201 Created):
```bash
ADMIN_TOKEN=$(node -e "console.log(require('./gateway/generate-jwt').createToken('ADMIN').token)")

curl -i -X POST http://localhost:8080/restaurants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-User-Id: admin-001" \
  -H "X-User-Role: ADMIN" \
  -d '{
    "name": "Kyoto Ramen Bar",
    "cuisine": "Japanese",
    "address": "500 Cherry Blossom Way",
    "rating": 4.9,
    "items": [
      { "itemId": "item-401", "name": "Tonkotsu Black Garlic", "price": 16.50, "available": true },
      { "itemId": "item-402", "name": "Takoyaki Octopus Balls", "price": 8.00, "available": true }
    ]
  }'
```

---

## Resilience (Opossum Circuit Breaker)

To prevent cascading failures across the QuickCart microservice mesh, gRPC database lookups are isolated behind an **Opossum Circuit Breaker** (`src/grpc/circuitBreaker.js`):

- **Timeout (`CB_TIMEOUT_MS = 3000ms`)**: If a MongoDB query exceeds 3 seconds, the breaker cancels the execution.
- **Error Threshold (`CB_ERROR_THRESHOLD = 50%`)**: If 50% of recent queries fail or time out, the circuit transitions from **CLOSED** to **OPEN**.
- **Fail-Fast Fallback**: When the circuit is OPEN, calls fail fast immediately without saturating MongoDB connections, returning a safe gRPC fallback response:
  ```json
  {
    "valid": false,
    "totalPrice": 0.0,
    "message": "Service temporarily unavailable: Menu validation fallback triggered (Circuit OPEN)"
  }
  ```
- **Reset Probe (`CB_RESET_TIMEOUT_MS = 5000ms`)**: After 5 seconds, the breaker enters **HALF-OPEN** to test database health with a single probe query. If successful, it automatically recovers to **CLOSED**.
- **Telemetry**: State transitions are tracked in Prometheus gauge `circuit_breaker_state` (0: Closed, 1: HalfOpen, 2: Open).

---

## Observability (Prometheus & Pino JSON Logs)

### 1. Pino Structured JSON Logging
Every HTTP and gRPC request logs structured JSON to `stdout` containing the correlation ID and order ID:
```json
{"level":"info","time":"2026-10-12T06:50:15.123Z","service":"restaurant-service","env":"production","correlationId":"3a8f7b56-0452-4ed5-9c7d-8103ccfc8b9a","orderId":"ord-9921","restaurantId":"rest-1","itemCount":2,"finalTotalPrice":42.48,"msg":"gRPC ValidateItems succeeded"}
```

### 2. Prometheus Metrics (`/metrics`)
- `quickcart_restaurant_*`: Process memory, heap usage, CPU, event loop lag.
- `http_requests_total{method, route, status_code}`: Request count counter.
- `http_request_duration_seconds{method, route, status_code}`: Latency histogram.
- `grpc_requests_total{method, status}`: gRPC validation counters.
- `circuit_breaker_state{breaker_name}`: Gauge for circuit health.

---

## Kubernetes Deployment & TLS Setup

All deployment manifests are in [`k8s/`](file:///d:/B.Tech%201st%20year/Sem-7/MAP/Assignment_C/k8s):

### 1. Deploy Stack to Namespace `quickcart`
```bash
# 1. Create Namespace
kubectl apply -f k8s/00-namespace.yaml

# 2. Apply Secrets and ConfigMaps
kubectl apply -f k8s/01-restaurant-secret.yaml
kubectl apply -f k8s/02-restaurant-configmap.yaml

# 3. Deploy Restaurant Service (2-container Pod: App + Observer Sidecar)
kubectl apply -f k8s/03-restaurant-deployment.yaml
kubectl apply -f k8s/04-restaurant-service.yaml

# 4. Deploy Kong API Gateway (DB-less mode)
kubectl apply -f k8s/05-kong-configmap.yaml
kubectl apply -f k8s/06-kong-deployment.yaml
kubectl apply -f k8s/07-kong-service.yaml
```

### 2. Pod Multi-Container Sidecar Pattern
The `restaurant-service` pod contains two containers:
1. `restaurant-service`: The primary Node.js application running the REST and gRPC servers.
2. `metrics-log-sidecar`: A dedicated sidecar container that monitors health status and collects metrics without imposing overhead on the primary runtime.

### 3. TLS / HTTPS Setup for Kong Gateway
To configure self-signed certificates for local HTTPS testing on port 8443:
```bash
# Generate private key and certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout tls.key -out tls.crt \
  -subj "/CN=api.quickcart.local/O=QuickCart"

# Create Kubernetes TLS Secret
kubectl create secret tls kong-tls-cert \
  --cert=tls.crt \
  --key=tls.key \
  -n quickcart
```

---

## College Assignment Report Paragraph

> *"In the QuickCart architecture, **Polyglot Persistence** is demonstrated by assigning each microservice a database tailored to its operational access pattern; while transactional order and payment services leverage relational PostgreSQL instances, the Restaurant Service adopts a document database (**MongoDB `restaurantdb`**) whose flexible, nested schema naturally matches menu hierarchies and supports atomic availability updates without multi-table joins. Inter-service synchronous validation is executed via high-performance binary **gRPC (`MenuService.ValidateItems` on port 50051)** using Protocol Buffers, ensuring sub-millisecond price verification calculated authoritatively from database records rather than untrusted client inputs. Resilience against downstream latency is guaranteed through the **Opossum Circuit Breaker**, which fails fast with fallback responses when MongoDB latency exceeds defined thresholds. At the system perimeter, an **API Gateway (Kong in declarative DB-less mode)** acts as the single entry point across Kubernetes cluster DNS addresses (`service.quickcart.svc.cluster.local`), offloading cross-cutting concerns by enforcing rate limiting (60 req/min), generating distributed `X-Correlation-Id` tracing headers, and terminating **JWT security** so internal microservices trust forwarded `X-User-Id` and `X-User-Role` headers within a secured zero-trust boundary."*
