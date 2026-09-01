from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import SQLAlchemyError, ProgrammingError
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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


def init_db():
    """
    Initialize database (create all tables).
    Called once at application startup if tables don't exist.
    
    ✅ IMPROVED: Handles existing tables/indexes gracefully
    ✅ Prevents "duplicate index" errors
    ✅ Logs all operations for debugging
    
    Usage in main.py:
        from database import init_db
        init_db()
    """
    try:
        logger.info("Starting database initialization...")
        
        # Get database inspector to check existing objects
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
        
        logger.info(f"Found {len(existing_tables)} existing tables")
        
        # Create all tables (SQLAlchemy will skip existing ones)
        logger.info("Creating tables from metadata...")
        Base.metadata.create_all(bind=engine)
        
        logger.info("Database initialization completed successfully!")
        return True
        
    except ProgrammingError as e:
        if "already exists" in str(e) or "DuplicateTable" in str(e):
            logger.warning(f"Index or table already exists (expected on redeployment): {str(e)}")
            logger.info("This is normal if the database was already initialized.")
            
            # Try alternative approach: create only missing tables
            try:
                _create_missing_tables_only()
                logger.info("Successfully created missing tables using fallback method")
                return True
            except Exception as fallback_error:
                logger.error(f"Fallback method also failed: {str(fallback_error)}")
                raise
        else:
            logger.error(f"Database initialization failed: {str(e)}")
            raise
            
    except SQLAlchemyError as e:
        logger.error(f"SQLAlchemy error during initialization: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during database initialization: {str(e)}")
        raise


def _create_missing_tables_only():
    """
    Create only tables that don't exist yet.
    Useful as a fallback when there are index conflicts.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    
    with engine.connect() as connection:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                logger.info(f"Creating table: {table.name}")
                Base.metadata.create_all(bind=connection, tables=[table])
            else:
                logger.info(f"Table already exists, skipping: {table.name}")
        
        connection.commit()


def drop_all_tables():
    """
    ⚠️ DANGER: Drop all tables - USE ONLY IN DEVELOPMENT/TESTING
    
    This should NEVER be used in production.
    """
    logger.warning("⚠️ DROPPING ALL TABLES - THIS SHOULD ONLY BE USED IN DEVELOPMENT!")
    Base.metadata.drop_all(bind=engine)
    logger.info("All tables dropped successfully")


def reset_database():
    """
    ⚠️ DANGER: Drop and recreate all tables - USE ONLY IN DEVELOPMENT/TESTING
    
    This is useful for complete reset during development.
    """
    logger.warning("⚠️ RESETTING DATABASE - THIS SHOULD ONLY BE USED IN DEVELOPMENT!")
    try:
        drop_all_tables()
        init_db()
        logger.info("Database reset completed successfully")
        return True
    except Exception as e:
        logger.error(f"Database reset failed: {str(e)}")
        raise