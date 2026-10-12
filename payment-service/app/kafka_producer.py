"""
kafka_producer.py – Async Kafka producer (aiokafka).
Publishes payment.completed and payment.failed events.

Reliability note
----------------
We save the DB row FIRST, then publish to Kafka.
This is the "save-then-publish" approach and is simpler than the outbox pattern.

OUTBOX PATTERN (production improvement):
  Instead of publishing directly here, the payment row INSERT would also
  insert into an `outbox` table (same DB transaction → ACID). A separate
  Debezium connector (CDC) reads the outbox table via Postgres WAL and
  publishes to Kafka. This guarantees exactly-once delivery even if the
  service crashes between DB commit and Kafka publish.
  See: https://microservices.io/patterns/data/transactional-outbox.html
"""
import json
from datetime import datetime, timezone

from aiokafka import AIOKafkaProducer

from app.config import settings
from app.logging_config import get_logger

log = get_logger(__name__)

_producer: AIOKafkaProducer | None = None


async def get_producer() -> AIOKafkaProducer:
    global _producer
    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            acks="all",          # wait for all in-sync replicas
            enable_idempotence=True,  # producer-side deduplication
        )
        await _producer.start()
        log.info("Kafka producer started")
    return _producer


async def stop_producer() -> None:
    global _producer
    if _producer:
        await _producer.stop()
        _producer = None
        log.info("Kafka producer stopped")


async def publish_payment_completed(
    order_id: str, payment_id: str, amount: float, correlation_id: str = ""
) -> None:
    producer = await get_producer()
    message = {
        "orderId": order_id,
        "paymentId": payment_id,
        "amount": amount,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "correlationId": correlation_id,
    }
    await producer.send_and_wait(settings.KAFKA_TOPIC_PAYMENT_COMPLETED, message)
    log.info(
        "Published payment.completed",
        extra={"order_id": order_id, "correlation_id": correlation_id},
    )


async def publish_payment_failed(
    order_id: str, reason: str, correlation_id: str = ""
) -> None:
    producer = await get_producer()
    message = {
        "orderId": order_id,
        "reason": reason,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "correlationId": correlation_id,
    }
    await producer.send_and_wait(settings.KAFKA_TOPIC_PAYMENT_FAILED, message)
    log.info(
        "Published payment.failed",
        extra={"order_id": order_id, "reason": reason, "correlation_id": correlation_id},
    )
