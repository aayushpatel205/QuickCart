"""
config.py – All configuration comes from environment variables.
Kubernetes ConfigMap provides non-secret values; Secrets provide DB_PASSWORD etc.
"""
from typing import Optional
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────────────────
    # Supports reading DATABASE_URL directly from environment (e.g., Docker Compose / K8s)
    raw_database_url: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_URL", "database_url"),
    )

    DB_HOST: str = "paymentdb"
    DB_PORT: int = 5432
    DB_NAME: str = "paymentdb"
    DB_USER: str = "paymentuser"
    DB_PASSWORD: str = "paymentpass"

    @property
    def DATABASE_URL(self) -> str:  # async driver for SQLAlchemy AsyncEngine
        raw = self.raw_database_url
        if not raw or not raw.strip():
            return (
                f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}"
                f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
            )
        # Normalize driver prefix for asyncpg
        if raw.startswith("postgres://"):
            return "postgresql+asyncpg://" + raw[len("postgres://"):]
        if raw.startswith("postgresql://"):
            return "postgresql+asyncpg://" + raw[len("postgresql://"):]
        if raw.startswith("postgresql+psycopg2://"):
            return "postgresql+asyncpg://" + raw[len("postgresql+psycopg2://"):]
        return raw

    @property
    def ASYNC_DATABASE_URL(self) -> str:  # alias for async driver
        return self.DATABASE_URL

    @property
    def SYNC_DATABASE_URL(self) -> str:  # sync driver for Alembic
        raw = self.raw_database_url
        if not raw or not raw.strip():
            return (
                f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}"
                f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
            )
        # Normalize driver prefix for psycopg2
        if raw.startswith("postgres://"):
            return "postgresql+psycopg2://" + raw[len("postgres://"):]
        if raw.startswith("postgresql://"):
            return "postgresql+psycopg2://" + raw[len("postgresql://"):]
        if raw.startswith("postgresql+asyncpg://"):
            return "postgresql+psycopg2://" + raw[len("postgresql+asyncpg://"):]
        return raw

    # ── Kafka ─────────────────────────────────────────────────────────────────
    KAFKA_BOOTSTRAP_SERVERS: str = "kafka:9092"
    KAFKA_CONSUMER_GROUP: str = "payment-service"
    KAFKA_TOPIC_ORDER_CREATED: str = "order.created"
    KAFKA_TOPIC_PAYMENT_COMPLETED: str = "payment.completed"
    KAFKA_TOPIC_PAYMENT_FAILED: str = "payment.failed"

    # ── Payment-gateway simulation ────────────────────────────────────────────
    PAYMENT_SUCCESS_THRESHOLD_AMOUNT: float = 5000.0  # fail if amount >= this
    PAYMENT_RANDOM_FAIL_PERCENT: int = 10             # 10 % random failures

    # ── Circuit-breaker (pybreaker) ───────────────────────────────────────────
    CB_FAIL_MAX: int = 5       # open after 5 consecutive failures
    CB_RESET_TIMEOUT: int = 60 # seconds before half-open

    # ── App ───────────────────────────────────────────────────────────────────
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
