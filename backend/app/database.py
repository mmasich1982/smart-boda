import os
from sqlalchemy import create_engine, pool
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required but not set")

# Production-grade engine configuration
# - pool_size: connections to keep in pool (default 5)
# - max_overflow: additional connections beyond pool_size (default 10)
# - pool_recycle: recycle connections after 3600s (prevents stale connections)
# - pool_pre_ping: verify connection alive before using (prevents "connection lost" errors)
# Note: Pool settings only apply to Postgres; SQLite uses different pooling strategy

# ✓ FIXED: SQLite doesn't support pool_size/max_overflow; only use for Postgres
is_postgres = DATABASE_URL.startswith("postgresql") or DATABASE_URL.startswith("postgres")

if is_postgres:
    engine = create_engine(
        DATABASE_URL,
        pool_size=20,
        max_overflow=40,
        pool_recycle=3600,
        pool_pre_ping=True,
        echo=os.getenv("SQL_ECHO", "false").lower() == "true",
    )
else:
    # SQLite for testing or development
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
        echo=os.getenv("SQL_ECHO", "false").lower() == "true",
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """
    Database session dependency for FastAPI.
    Provides a new session per request, guarantees cleanup.
    """
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as e:
        db.rollback()
        raise RuntimeError(f"Database error: {str(e)}") from e
    finally:
        db.close()


def init_db():
    """
    Initialize database (create all tables).
    Called once at application startup if tables don't exist.
    """
    Base.metadata.create_all(bind=engine)