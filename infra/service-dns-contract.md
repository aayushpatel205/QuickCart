# QuickCart service DNS contract

Use these Kubernetes DNS names inside the `quickcart` namespace. The API names and ports match the existing Kong routes and Prometheus scrape targets. Broker names match existing Kubernetes configuration in the repository.

| Service | DNS name | Port |
| --- | --- | ---: |
| Order API | `order-service` | 8081 |
| Restaurant API | `restaurant-service` | 8082 (HTTP), 50051 (gRPC) |
| Payment API | `payment-service` | 8083 |
| Delivery API | `delivery-service` | 8084 |
| Cart notification API | `cart-notification` | 8085 |
| Kafka | `kafka` | 9092 |
| RabbitMQ | `rabbitmq-service` | 5672 |
| Redis | `redis-service` | 6379 |
| Loki | `loki` | 3100 |
| Delivery PostgreSQL | `delivery-db` | 5432 |

Environment variable names vary by service. Delivery uses `DATABASE_URL=postgres://postgres:changeme@delivery-db:5432/deliverydb?sslmode=disable`, `KAFKA_BROKERS=kafka:9092`, and `RABBITMQ_URL=amqp://guest:changeme@rabbitmq-service:5672/`. Cart notification currently uses `Kafka__BootstrapServers=kafka-service:9092`, `RabbitMQ__Host=rabbitmq-service`, and `Redis__ConnectionString=redis-service:6379`.
