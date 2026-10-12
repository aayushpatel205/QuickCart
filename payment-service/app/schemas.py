"""
schemas.py – Pydantic request/response models.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Requests ──────────────────────────────────────────────────────────────────

class PayRequest(BaseModel):
    orderId: str = Field(..., description="Unique order identifier")
    amount: float = Field(..., gt=0, description="Amount in INR")
    method: str = Field("CARD", description="Payment method: CARD | UPI | WALLET")
    idempotencyKey: str = Field(..., description="Client-generated idempotency key")


class RefundRequest(BaseModel):
    reason: Optional[str] = Field(None, description="Reason for refund")


# ── Responses ─────────────────────────────────────────────────────────────────

class PaymentResponse(BaseModel):
    id: uuid.UUID
    orderId: str
    amount: float
    status: str
    method: str
    idempotencyKey: str
    failureReason: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True


class HealthResponse(BaseModel):
    status: str
    db: str
    kafka: str
