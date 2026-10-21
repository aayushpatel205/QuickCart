"""
kafka_consumer.py – Consumes order.created events and triggers payment processing.

Idempotency (Kafka-level)
-------------------------
Before processing, we check the processed_events table for the event_id
(built from partition + offset).  If already present, we skip processing.
This protects against Kafka at-least-once redelivery / consumer restarts.

The DB write of the processed_events row happens INSIDE the same transaction
as the payment row, giving us atomic "mark-as-processed + save-payment".
"""
import asyncio
import json
import uuid

from aiokafka import AIOKafkaConsumer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.logging_config import get_logger
from app.models import ProcessedEvent
from app.payment_service import process_payment

log = get_logger(__name__)

_consumer_task: asyncio.Task | None = None


async def _consume_loop() -> None:
    consumer = None
    max_retries = 15
    for attempt in range(1, max_retries + 1):
        try:
            consumer = AIOKafkaConsumer(
                settings.KAFKA_TOPIC_ORDER_CREATED,
                bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
                group_id=settings.KAFKA_CONSUMER_GROUP,
                auto_offset_reset="earliest",
                enable_auto_commit=False,   # manual commit after successful processing
                value_deserializer=lambda b: json.loads(b.decode("utf-8")),
            )
            await consumer.start()
            log.info("Kafka consumer started", extra={"topic": settings.KAFKA_TOPIC_ORDER_CREATED})
            break
        except asyncio.CancelledError:
            log.info("Kafka consumer task cancelled during startup")
            return
        except Exception as exc:
            if attempt == max_retries:
                log.error("Kafka consumer failed to start after maximum retries", extra={"error": str(exc)})
                return
            log.warning(
                "Kafka broker not ready yet, retrying in 3 seconds...",
                extra={"attempt": attempt, "error": str(exc)},
            )
            await asyncio.sleep(3)

    if not consumer:
        return

    try:
        async for msg in consumer:
            event_id = f"{msg.partition}:{msg.offset}"
            data = msg.value
            order_id = data.get("orderId", "")
            correlation_id = data.get("correlationId", "")
            amount = float(data.get("amount", 0))

            log.info(
                "Received order.created event",
                extra={"event_id": event_id, "order_id": order_id, "correlation_id": correlation_id},
            )

            async with AsyncSessionLocal() as db:
                try:
                    # ── Idempotency check ──────────────────────────────────────
                    existing_event = await db.get(ProcessedEvent, event_id)
                    if existing_event:
                        log.info(
                            "Skipping duplicate Kafka event",
                            extra={"event_id": event_id, "order_id": order_id},
                        )
                        await consumer.commit()
                        continue

                    # ── Process payment (ACID: one transaction) ───────────────
                    idempotency_key = data.get(
                        "idempotencyKey", f"kafka-{order_id}-{event_id}"
                    )
                    payment = await process_payment(
                        db=db,
                        order_id=order_id,
                        amount=amount,
                        method=data.get("method", "CARD"),
                        idempotency_key=idempotency_key,
                        correlation_id=correlation_id,
                    )

                    # ── Mark event as processed (same transaction) ────────────
                    db.add(ProcessedEvent(event_id=event_id))
                    await db.commit()

                    log.info(
                        "Kafka event processed successfully",
                        extra={
                            "event_id": event_id,
                            "order_id": order_id,
                            "payment_status": payment.status.value,
                        },
                    )
                except Exception as exc:
                    await db.rollback()
                    log.error(
                        "Error processing Kafka event – will not commit offset",
                        extra={"event_id": event_id, "order_id": order_id, "error": str(exc)},
                    )
                    continue  # do NOT commit → Kafka will redeliver

            await consumer.commit()

    except asyncio.CancelledError:
        log.info("Kafka consumer task cancelled")
    finally:
        await consumer.stop()
        log.info("Kafka consumer stopped")


def start_consumer() -> None:
    global _consumer_task
    loop = asyncio.get_event_loop()
    _consumer_task = loop.create_task(_consume_loop())
    log.info("Kafka consumer task created")


async def stop_consumer() -> None:
    global _consumer_task
    if _consumer_task and not _consumer_task.done():
        _consumer_task.cancel()
        try:
            await _consumer_task
        except asyncio.CancelledError:
            pass
    _consumer_task = None
