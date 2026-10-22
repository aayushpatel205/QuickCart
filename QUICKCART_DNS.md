# QuickCart Shared Names and DNS

## Order service handoff

| Item | Name/value |
| ---- | ---------- |
| Docker image | `aayushp255/order-service:latest` |
| Deployment | `order-service` |
| Service | `order-service` |
| HTTP port | `8081` |
| Health check | `/health` |
| Metrics path | `/metrics` |
| Database StatefulSet | `order-db` |
| Database Service | `order-db:5432` |
| Kafka bootstrap | `kafka:9092` |
| Kafka Connect | `kafka-connect:8083` |
| RabbitMQ | `rabbitmq:5672` |
| Restaurant gRPC | `restaurant-service:50051` |

## Order service env vars

| Env var | Value |
| ------- | ----- |
| `SERVER_PORT` | `8081` |
| `DB_URL` | `jdbc:postgresql://order-db:5432/orderdb` |
| `DB_USER` | `orderuser` |
| `DB_PASSWORD` | from `order-service-secret`, placeholder `changeme` |
| `KAFKA_BOOTSTRAP_SERVERS` | `kafka:9092` |
| `RABBITMQ_HOST` | `rabbitmq` |
| `RABBITMQ_PORT` | `5672` |
| `RABBITMQ_USER` | `guest` |
| `RABBITMQ_PASSWORD` | from `order-service-secret`, placeholder `changeme` |
| `RESTAURANT_GRPC_HOST` | `restaurant-service` |
| `RESTAURANT_GRPC_PORT` | `50051` |

## Infra deploy order for Order

1. Apply Kafka KRaft resources from `infra/k8s/kafka-debezium.yaml`.
2. Run `infra/kafka/create-topics.sh` against `kafka:9092`.
3. Apply `k8s/order-service-secret.yaml`.
4. Apply `k8s/order-service-db.yaml` and wait for `order-db` to be ready.
5. Apply Kafka Connect from `infra/k8s/kafka-debezium.yaml` if it is not already running.
6. Register `infra/debezium/order-outbox-connector.json` with Kafka Connect.
7. Apply `k8s/order-service.yaml`.
