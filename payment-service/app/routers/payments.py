"""
routers/payments.py – REST endpoints for the payment service.

Endpoints
---------
POST /payments/pay           – manual/test payment trigger
GET  /payments/{orderId}     – fetch payment status
POST /payments/{orderId}/refund – initiate refund
GET  /health                 – liveness + readiness probe
GET  /metrics                – Prometheus metrics (handled by middleware in main.py)
"""
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.logging_config import get_logger
from app.models import Payment
from app.payment_service import process_payment, process_refund
from app.schemas import HealthResponse, PaymentResponse, PayRequest, RefundRequest

log = get_logger(__name__)
router = APIRouter()

# ── Helpers ───────────────────────────────────────────────────────────────────

def _correlation_id(request: Request) -> str:
    return request.headers.get("X-Correlation-Id", "")


def _to_response(p: Payment) -> PaymentResponse:
    return PaymentResponse(
        id=p.id,
        orderId=p.order_id,
        amount=p.amount,
        status=p.status.value,
        method=p.method,
        idempotencyKey=p.idempotency_key,
        failureReason=p.failure_reason,
        createdAt=p.created_at,
        updatedAt=p.updated_at,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/payments/pay", response_model=PaymentResponse, status_code=201)
async def pay(
    body: PayRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Manually trigger a payment (for testing or manual/admin use).
    Idempotent: repeating with the same idempotencyKey returns the same result.
    Forwarded header X-User-Id is logged but not used for auth (JWT done at gateway).
    """
    correlation_id = _correlation_id(request)
    user_id = request.headers.get("X-User-Id", "anonymous")
    log.info(
        "POST /payments/pay",
        extra={"order_id": body.orderId, "user_id": user_id, "correlation_id": correlation_id},
    )

    payment = await process_payment(
        db=db,
        order_id=body.orderId,
        amount=body.amount,
        method=body.method,
        idempotency_key=body.idempotencyKey,
        correlation_id=correlation_id,
    )
    return _to_response(payment)


@router.get("/payments/{order_id}", response_model=PaymentResponse)
async def get_payment(
    order_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Return payment status for a given orderId."""
    correlation_id = _correlation_id(request)
    result = await db.execute(select(Payment).where(Payment.order_id == order_id))
    payment = result.scalar_one_or_none()

    if payment is None:
        log.warning(
            "Payment not found",
            extra={"order_id": order_id, "correlation_id": correlation_id},
        )
        raise HTTPException(status_code=404, detail=f"Payment for order {order_id} not found")

    return _to_response(payment)


@router.post("/payments/{order_id}/refund", response_model=PaymentResponse)
async def refund(
    order_id: str,
    body: RefundRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Refund a completed payment. Idempotent – repeated calls return the same row."""
    correlation_id = _correlation_id(request)
    log.info(
        "POST /payments/refund",
        extra={"order_id": order_id, "correlation_id": correlation_id},
    )

    try:
        payment = await process_refund(
            db=db,
            order_id=order_id,
            reason=body.reason,
            correlation_id=correlation_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return _to_response(payment)


@router.get("/health", response_model=HealthResponse)
async def health(db: AsyncSession = Depends(get_db)):
    """Kubernetes liveness + readiness probe."""
    db_status = "ok"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        db_status = f"error: {exc}"

    # Kafka liveness is checked by whether the consumer task is running
    from app.kafka_consumer import _consumer_task
    kafka_status = "ok" if (_consumer_task and not _consumer_task.done()) else "not running"

    overall = "ok" if db_status == "ok" else "degraded"
    return HealthResponse(status=overall, db=db_status, kafka=kafka_status)
