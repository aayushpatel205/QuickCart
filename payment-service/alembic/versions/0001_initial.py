"""Initial migration – create payments and processed_events tables."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # payments table
    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("order_id", sa.String(64), nullable=False, unique=True),
        sa.Column("amount", sa.Float, nullable=False),
        sa.Column(
            "status",
            sa.Enum("COMPLETED", "FAILED", "REFUNDED", "PENDING", name="payment_status_enum"),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("method", sa.String(32), nullable=False, server_default="CARD"),
        sa.Column("idempotency_key", sa.String(128), nullable=False, unique=True),
        sa.Column("failure_reason", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_payments_order_id", "payments", ["order_id"])
    op.create_index("ix_payments_idempotency_key", "payments", ["idempotency_key"])

    # processed_events table (Kafka deduplication)
    op.create_table(
        "processed_events",
        sa.Column("event_id", sa.String(256), primary_key=True),
        sa.Column(
            "processed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("processed_events")
    op.drop_table("payments")
    op.execute("DROP TYPE IF EXISTS payment_status_enum")
