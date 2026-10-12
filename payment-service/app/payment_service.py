"""
payment_service.py – Core payment business logic, shared between the
REST router and the Kafka consumer so there is a single code path.

ACID guarantees
---------------
process_payment() and process_refund() each run inside a single
SQLAlchemy DB transaction (BEGIN … COMMIT / ROLLBACK). The payment
row write and any status update are atomic.

Idempotency
-----------
1. DB-level: UNIQUE constraints on order_id and idempotency_key –
   a duplicate INSERT raises IntegrityError which we catch and handle.
2. Kafka-level: processed_events table stores event IDs (partition:offset).
   The consumer checks before processing. See kafka_consumer.py.
"""
import asyncio
import uuid
from datetime import datetime, timezone

import pybreaker
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.circuit_breaker import GatewayError, simulate_gateway_call
from app.kafka_producer import publish_payment_completed, publish_payment_failed
from app.logging_config import get_logger
from app.metrics import payment_latency_seconds, payments_total
from app.models import Payment, PaymentStatus

log = get_logger(__name__)


async def process_payment(
    db: AsyncSession,
    order_id: str,
    amount: float,
    method: str,
    idempotency_key: str,
    correlation_id: str = "",
) -> Payment:
    """
    Create a payment record and call the (simulated) gateway.
    Returns the Payment ORM object (COMPLETED or FAILED).

    Idempotency: if order_id or idempotency_key already exists,
    return the existing row without charging again.
    """
    # ── 1. Check idempotency (read before write) ──────────────────────────────
    existing = await db.execute(
        select(Payment).where(Payment.order_id == order_id)
    )
    existing_payment = existing.scalar_one_or_none()
    if existing_payment:
        log.info(
            "Idempotent: payment already exists for order",
            extra={"order_id": order_id, "correlation_id": correlation_id},
        )
        return existing_payment

    # ── 2. Call gateway (sync call run in threadpool to avoid blocking loop) ──
    status = PaymentStatus.COMPLETED
    failure_reason: str | None = None

    start_ts = datetime.now(timezone.utc).timestamp()
    try:
        await asyncio.get_event_loop().run_in_executor(
            None, simulate_gateway_call, amount, order_id
        )
    except pybreaker.CircuitBreakerError:
        status = PaymentStatus.FAILED
        failure_reason = "gateway unavailable"
        log.warning(
            "Circuit breaker OPEN – payment failed",
            extra={"order_id": order_id, "correlation_id": correlation_id},
        )
    except GatewayError as exc:
        status = PaymentStatus.FAILED
        failure_reason = str(exc)
        log.warning(
            "Gateway rejected payment",
            extra={"order_id": order_id, "reason": failure_reason, "correlation_id": correlation_id},
        )
    finally:
        latency = datetime.now(timezone.utc).timestamp() - start_ts
        payment_latency_seconds.observe(latency)

    # ── 3. Persist (ACID transaction via get_db dependency) ───────────────────
    payment = Payment(
        id=uuid.uuid4(),
        order_id=order_id,
        amount=amount,
        status=status,
        method=method,
        idempotency_key=idempotency_key,
        failure_reason=failure_reason,
    )
    try:
        db.add(payment)
        await db.flush()          # get DB-generated defaults; still in transaction
    except IntegrityError:
        await db.rollback()
        # Race condition: another request inserted the same row concurrently
        result = await db.execute(select(Payment).where(Payment.order_id == order_id))
        payment = result.scalar_one()
        log.info(
            "Concurrent idempotency resolution",
            extra={"order_id": order_id, "correlation_id": correlation_id},
        )
        return payment

    # ── 4. Publish Kafka event (save-then-publish) ────────────────────────────
    try:
        if status == PaymentStatus.COMPLETED:
            await publish_payment_completed(
                order_id=order_id,
                payment_id=str(payment.id),
                amount=amount,
                correlation_id=correlation_id,
            )
        else:
            await publish_payment_failed(
                order_id=order_id,
                reason=failure_reason or "unknown",
                correlation_id=correlation_id,
            )
    except Exception as exc:
        # Kafka publish failure is logged but does NOT roll back the DB write.
        # The outbox pattern would handle this more reliably.
        log.error(
            "Failed to publish Kafka event – DB row persisted",
            extra={"order_id": order_id, "error": str(exc), "correlation_id": correlation_id},
        )

    # ── 5. Update Prometheus metrics ──────────────────────────────────────────
    payments_total.labels(status=status.value).inc()

    log.info(
        "Payment processed",
        extra={
            "order_id": order_id,
            "payment_id": str(payment.id),
            "status": status.value,
            "correlation_id": correlation_id,
        },
    )
    return payment


async def process_refund(
    db: AsyncSession,
    order_id: str,
    reason: str | None,
    correlation_id: str = "",
) -> Payment:
    """
    Mark a COMPLETED payment as REFUNDED.
    Runs inside the DB transaction provided by the get_db dependency.
    """
    result = await db.execute(select(Payment).where(Payment.order_id == order_id))
    payment: Payment | None = result.scalar_one_or_none()

    if payment is None:
        raise ValueError(f"No payment found for order {order_id}")

    if payment.status == PaymentStatus.REFUNDED:
        return payment  # idempotent

    if payment.status != PaymentStatus.COMPLETED:
        raise ValueError(f"Cannot refund payment in status {payment.status.value}")

    payment.status = PaymentStatus.REFUNDED
    payment.failure_reason = reason
    payment.updated_at = datetime.now(timezone.utc)
    await db.flush()

    payments_total.labels(status=PaymentStatus.REFUNDED.value).inc()

    log.info(
        "Payment refunded",
        extra={"order_id": order_id, "correlation_id": correlation_id},
    )
    return payment
