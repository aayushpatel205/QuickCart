"""
metrics.py – Prometheus custom metrics for the payment service.

Exposed at GET /metrics via prometheus_client (ASGI middleware).

Custom metrics:
  payments_total{status}       – Counter: number of payments by final status
  payment_latency_seconds      – Histogram: end-to-end latency of payment processing
  http_requests_total          – Counter: per endpoint / method / status_code
  http_request_duration_seconds – Histogram: HTTP request latency
"""
from prometheus_client import Counter, Histogram, CollectorRegistry, REGISTRY

# ── Payment-specific metrics ──────────────────────────────────────────────────

payments_total = Counter(
    "payments_total",
    "Total number of payment attempts by final status",
    ["status"],          # COMPLETED | FAILED | REFUNDED
    registry=REGISTRY,
)

payment_latency_seconds = Histogram(
    "payment_latency_seconds",
    "End-to-end payment processing latency in seconds",
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
    registry=REGISTRY,
)

# ── Generic HTTP metrics (populated by middleware in main.py) ─────────────────

http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
    registry=REGISTRY,
)

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
    registry=REGISTRY,
)
