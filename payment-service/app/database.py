"""
database.py – Async SQLAlchemy engine + session factory.
Uses asyncpg driver for non-blocking I/O inside FastAPI event loop.
"""
import os
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

DATABASE_URL = os.getenv("DATABASE_URL", getattr(settings, "DATABASE_URL", "postgresql+asyncpg://paymentuser:paymentpass@paymentdb:5432/paymentdb"))
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
if "localhost" in DATABASE_URL or "127.0.0.1" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("localhost", "paymentdb").replace("127.0.0.1", "paymentdb")

engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=False,
)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency – yields a DB session and always closes it."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
