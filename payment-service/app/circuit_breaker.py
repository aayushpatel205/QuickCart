"""
circuit_breaker.py – pybreaker circuit-breaker wrapping the simulated
payment gateway call, plus tenacity retry with exponential back-off.

Architecture
------------
  simulate_gateway_call()
    └─ tenacity retry (3 attempts, exponential backoff 0.5 → 4 s)
        └─ _gateway_stub()           ← wrapped by pybreaker
            └─ random success/fail logic (replaces real HTTP call to gateway)

When the circuit is OPEN (> CB_FAIL_MAX consecutive failures),
pybreaker raises CircuitBreakerError immediately without calling the stub.
The caller (Kafka consumer or REST handler) catches this and publishes
payment.failed with reason "gateway unavailable".
"""
import random
import time

import pybreaker
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from app.config import settings
from app.logging_config import get_logger

log = get_logger(__name__)

# ── Circuit-breaker instance (module-level singleton) ─────────────────────────
payment_circuit_breaker = pybreaker.CircuitBreaker(
    fail_max=settings.CB_FAIL_MAX,
    reset_timeout=settings.CB_RESET_TIMEOUT,
    name="payment-gateway",
)


class GatewayError(Exception):
    """Raised by the stub to simulate a transient gateway error."""


@payment_circuit_breaker
def _gateway_stub(amount: float) -> dict:
    """
    Simulates an external payment-gateway HTTP call.

    Success conditions (configurable via env vars):
      - amount < PAYMENT_SUCCESS_THRESHOLD_AMOUNT
      - random() > PAYMENT_RANDOM_FAIL_PERCENT / 100

    In a real implementation this would be:
        response = httpx.post(GATEWAY_URL, json={...}, timeout=5)
        response.raise_for_status()
        return response.json()
    """
    fail_pct = settings.PAYMENT_RANDOM_FAIL_PERCENT / 100.0
    threshold = settings.PAYMENT_SUCCESS_THRESHOLD_AMOUNT

    # Simulate network latency
    time.sleep(0.05)

    if amount >= threshold:
        raise GatewayError(f"Amount {amount} exceeds gateway limit {threshold}")

    if random.random() < fail_pct:
        raise GatewayError("Random gateway failure (simulated)")

    return {"gateway_ref": f"GW-{random.randint(100000, 999999)}", "status": "approved"}


@retry(
    retry=retry_if_exception_type(GatewayError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
    reraise=True,
)
def simulate_gateway_call(amount: float, order_id: str) -> dict:
    """
    Entry point called by the payment logic.
    Wraps _gateway_stub with tenacity retry (up to 3 attempts).
    pybreaker.CircuitBreakerError is NOT retried – it propagates immediately.
    """
    log.info("Calling payment gateway", extra={"order_id": order_id, "amount": amount})
    return _gateway_stub(amount)
