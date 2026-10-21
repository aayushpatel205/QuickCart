"""
main.py – FastAPI application entry-point.

Startup sequence:
  1. Configure structured JSON logging
  2. Run Alembic migrations (create tables if not exist)
  3. Start Kafka consumer background task
  4. Expose Prometheus /metrics endpoint via starlette middleware

Shutdown sequence:
  1. Stop Kafka consumer
  2. Stop Kafka producer
  3. Dispose SQLAlchemy engine
"""
import asyncio
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.config import settings
from app.database import Base, engine
from app.kafka_consumer import start_consumer, stop_consumer
from app.kafka_producer import stop_producer
from app.logging_config import get_logger, setup_logging
from app.metrics import http_request_duration_seconds, http_requests_total
from app.routers.payments import router as payments_router

# Read database URL from environment variable, defaulting to paymentdb
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://paymentuser:paymentpass@paymentdb:5432/paymentdb")
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
if "localhost" in DATABASE_URL or "127.0.0.1" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("localhost", "paymentdb").replace("127.0.0.1", "paymentdb")

setup_logging()
log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup and graceful shutdown."""
    safe_db_url = DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else DATABASE_URL
    log.info("Payment service starting up", extra={"env": settings.APP_ENV, "db_target": safe_db_url})

    # Create tables with retries to handle container startup timing
    max_retries = 10
    for attempt in range(1, max_retries + 1):
        try:
            log.info(f"Connecting to database at {safe_db_url}...", extra={"attempt": attempt, "max_retries": max_retries})
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            log.info("Database tables ready")
            break
        except Exception as exc:
            if attempt == max_retries:
                log.error("Failed to connect to database after maximum retries", extra={"error": str(exc)})
                raise
            log.warning(
                "Database not ready yet, retrying in 2 seconds...",
                extra={"attempt": attempt, "error": str(exc)},
            )
            await asyncio.sleep(2)

    # Start Kafka consumer background task
    start_consumer()
    log.info("Kafka consumer started")

    yield  # ── application is running ────────────────────────────────────────

    log.info("Payment service shutting down")
    await stop_consumer()
    await stop_producer()
    await engine.dispose()
    log.info("Cleanup complete")


app = FastAPI(
    title="QuickCart Payment Service",
    version="1.0.0",
    description="Handles payments for the QuickCart food ordering platform",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── Prometheus middleware ─────────────────────────────────────────────────────

@app.middleware("http")
async def prometheus_middleware(request: Request, call_next):
    start = time.perf_counter()
    response: Response = await call_next(request)
    latency = time.perf_counter() - start

    # Normalise path to avoid high cardinality (e.g. strip UUIDs)
    path = request.url.path
    http_requests_total.labels(
        method=request.method,
        endpoint=path,
        status_code=response.status_code,
    ).inc()
    http_request_duration_seconds.labels(
        method=request.method,
        endpoint=path,
    ).observe(latency)

    return response


# ── Metrics endpoint ──────────────────────────────────────────────────────────

@app.get("/metrics", include_in_schema=False)
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(payments_router, tags=["Payments"])
