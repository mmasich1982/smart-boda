from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import SQLAlchemyError
import os

# Get database URL and schema from environment
DATABASE_URL = os.getenv("DATABASE_URL")
DB_SCHEMA = os.getenv("DB_SCHEMA", "smart_boda")  # Default to smart_boda

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required but not set")

# Add schema parameter to connection if PostgreSQL
if "postgresql" in DATABASE_URL:
    DATABASE_URL = f"{DATABASE_URL}?options=-c%20search_path%3D{DB_SCHEMA}"

# Create engine with production settings
# - pool_size: connections to keep in pool (default 5)
# - max_overflow: additional connections beyond pool_size (default 10)
# - pool_recycle: recycle connections after 3600s (prevents stale connections)
# - pool_pre_ping: verify connection alive before using (prevents "connection lost" errors)
engine = create_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=40,
    pool_recycle=3600,
    pool_pre_ping=True,
)

# Session management
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# FastAPI dependency for database access
def get_db():
    """
    Database session dependency for FastAPI.
    Provides a new session per request, guarantees cleanup.
    
    Usage in routes:
        @app.get("/rides")
        def get_rides(db: Session = Depends(get_db)):
            rides = db.query(Ride).all()
            return rides
    """
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as e:
        db.rollback()
        raise RuntimeError(f"Database error: {str(e)}") from e
    finally:
        db.close()

# Optional: Initialize database (create all tables)
def init_db():
    """
    Initialize database (create all tables).
    Called once at application startup if tables don't exist.
    
    Usage in main.py:
        from database import init_db
        init_db()
    """
    Base.metadata.create_all(bind=engine)