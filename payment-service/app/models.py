"""
models.py – SQLAlchemy ORM models for the payment service.

Tables
------
payments       – one row per payment attempt (idempotency enforced by UNIQUE constraints)
processed_events – Kafka deduplication table; stores consumed event IDs
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    Float,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.database import Base


class PaymentStatus(str, enum.Enum):
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"
    PENDING = "PENDING"


class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(String(64), unique=True, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    status = Column(
        Enum(PaymentStatus, name="payment_status_enum"),
        nullable=False,
        default=PaymentStatus.PENDING,
    )
    method = Column(String(32), nullable=False, default="CARD")
    idempotency_key = Column(String(128), unique=True, nullable=False, index=True)
    failure_reason = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class ProcessedEvent(Base):
    """
    Idempotency table for Kafka consumer.
    event_id = Kafka partition:offset  (or a business-level UUID from the message)
    """
    __tablename__ = "processed_events"

    event_id = Column(String(256), primary_key=True)
    processed_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
