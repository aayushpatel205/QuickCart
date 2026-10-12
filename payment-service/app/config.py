"""
config.py – All configuration comes from environment variables.
Kubernetes ConfigMap provides non-secret values; Secrets provide DB_PASSWORD etc.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────────────────
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "paymentdb"
    DB_USER: str = "payment_user"
    DB_PASSWORD: str = "payment_pass"

    @property
    def DATABASE_URL(self) -> str:  # async driver
        return (
            f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def SYNC_DATABASE_URL(self) -> str:  # for Alembic
        return (
            f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

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
