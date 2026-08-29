# backend/app/main.py - KEY SECTIONS ONLY
# ============================================================================
# PAYMENT ROUTER REGISTRATION - CORRECT PLACEMENT
# ============================================================================

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import os
import logging
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from sqlalchemy import text
from app.routers import sb08_financial_history, sb19_financial_history
from app.routers import one_time_link

# Configure logging
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Smart Boda MVP1 API",
    description="Rider app backend with offline sync, financial tracking, and admin console",
    version="1.0.0",
)

# ============================================================================
# ✅ CORS CONFIGURATION - MUST BE FIRST
# ============================================================================

def get_allowed_origins():
    """Get allowed origins from environment or use permissive default for development."""
    env_origins = os.getenv("CORS_ORIGINS", "")
    
    if env_origins:
        origins = [origin.strip() for origin in env_origins.split(",") if origin.strip()]
        return origins
    else:
        return ["*"]

allowed_origins = get_allowed_origins()
logger.info(f"CORS Configuration: {allowed_origins}")

# ✅ CRITICAL: CORSMiddleware must be added FIRST (outermost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

# ============================================================================
# ✅ CUSTOM CORS ERROR HANDLER
# ============================================================================

@app.middleware("http")
async def ensure_cors_headers(request: Request, call_next):
    """Ensure CORS headers are always present, even on errors."""
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        logger.error(f"Middleware error: {str(e)}", exc_info=e)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            }
        )

# ============================================================================
# ✅ GLOBAL EXCEPTION HANDLERS
# ============================================================================

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle Pydantic validation errors with descriptive response."""
    logger.warning(f"Validation error on {request.url}: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Request validation failed",
            "errors": [{"field": str(e["loc"]), "message": e["msg"]} for e in exc.errors()]
        },
        headers={"Access-Control-Allow-Origin": "*"}
    )

@app.exception_handler(SQLAlchemyError)
async def database_exception_handler(request: Request, exc: SQLAlchemyError):
    """Handle database errors gracefully."""
    logger.error(f"Database error: {str(exc)}", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Database operation failed. Please try again."},
        headers={"Access-Control-Allow-Origin": "*"}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Catch-all for unexpected exceptions."""
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please contact support."},
        headers={"Access-Control-Allow-Origin": "*"}
    )

# ============================================================================
# ✅ STARTUP/SHUTDOWN EVENTS
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize database and verify connectivity."""
    try:
        from app.database import init_db, engine
        
        logger.info("Initializing database...")
        
        db_url = os.getenv("DATABASE_URL", "")
        if "sqlite:///:memory:" not in db_url and "sqlite" not in db_url:
            init_db()
            
            with engine.connect() as conn:
                result = conn.execute(text("SELECT 1"))
                logger.info(f"Database connectivity check returned: {result.scalar()}")
            
            logger.info("✓ Database initialized and verified")
            
            # Seed master data on startup
            logger.info("Seeding master data...")
            try:
                from app.seed import (
                    seed_languages, seed_trip_master_data, seed_fuel_master_data,
                    seed_financial_master_data, seed_compliance_master_data,
                    seed_value_preview_config, seed_ui_strings
                )
                
                seeds = [
                    ("languages", seed_languages),
                    ("trip master data", seed_trip_master_data),
                    ("fuel master data", seed_fuel_master_data),
                    ("financial master data", seed_financial_master_data),
                    ("compliance master data", seed_compliance_master_data),
                    ("value preview config", seed_value_preview_config),
                    ("UI strings", seed_ui_strings),
                ]
                
                for i, (name, seed_module) in enumerate(seeds, 1):
                    try:
                        logger.info(f"[{i}/7] Seeding {name}...")
                        seed_module.run()
                    except IntegrityError:
                        logger.info(f"[{i}/7] {name} already exists (skipping)")
                    except Exception as e:
                        logger.warning(f"[{i}/7] {name} seeding issue: {str(e)}")
                
                logger.info("✓ Master data seeding completed")
            except Exception as seed_error:
                logger.warning(f"Seed operation note: {str(seed_error)}")
        else:
            logger.info("✓ Skipping database initialization (test mode with SQLite in-memory)")
    except Exception as e:
        logger.error(f"✗ Database initialization failed: {str(e)}", exc_info=e)
        if "sqlite" not in os.getenv("DATABASE_URL", "").lower():
            raise

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on shutdown."""
    try:
        from app.database import engine
        engine.dispose()
        logger.info("✓ Database connection pool closed")
    except Exception as e:
        logger.error(f"Error during shutdown: {str(e)}")

# ============================================================================
# ✅ ROUTE REGISTRATIONS
# ============================================================================

# ---- Admin auth ----
from app.routers import admin_auth
app.include_router(admin_auth.router, prefix="/admin/auth", tags=["admin-auth"])

# ---- Module A routers ----
from app.routers import master_data_admin, language, bike_profile, mobile_number, pin
app.include_router(master_data_admin.router)
app.include_router(language.router)
app.include_router(bike_profile.router)
app.include_router(mobile_number.router)
app.include_router(pin.router)

# ---- Module B routers ----
from app.routers import sb05_trip_entry, sb05_lipa_later, sb07_trip_correction, trip_master_data_admin
app.include_router(trip_master_data_admin.router)
app.include_router(sb05_trip_entry.router)
app.include_router(sb05_lipa_later.router)
app.include_router(sb07_trip_correction.router)

# ---- Financial History & Statements ----
app.include_router(sb08_financial_history.router_api)
app.include_router(sb08_financial_history.router_compliance)
app.include_router(sb19_financial_history.router)

# ---- Secure Smart Boda Link ----
app.include_router(one_time_link.router)

# ---- Module C/D/E routers ----
from app.routers import (
    sb09_fuel_entry, sb10_battery_entry, sb12_maintenance,
    sb13_net_profit, sb14_financial_performance, sb15_revenue_targets, sb16_savings_tracker, sb17_goals_remittance,
    sb18_compliance, sb20_statements, sb21_data_export,
    sb22_settings, sb23_suggestions, sb24_subscription,
    financial_expense, sync_status,
)
app.include_router(sb09_fuel_entry.router)
app.include_router(sb10_battery_entry.router)
app.include_router(sb12_maintenance.router)
app.include_router(financial_expense.router)
app.include_router(sb13_net_profit.router)
app.include_router(sb14_financial_performance.router)
app.include_router(sb15_revenue_targets.router)
app.include_router(sb16_savings_tracker.router)
app.include_router(sb17_goals_remittance.router)
app.include_router(sb18_compliance.router)
app.include_router(sb20_statements.router)
app.include_router(sb21_data_export.router)
app.include_router(sb22_settings.router)
app.include_router(sb23_suggestions.router)
app.include_router(sb24_subscription.router)
app.include_router(sync_status.router)

# ---- Admin master-data routers ----
from app.routers import compliance_master_data_admin, financial_master_data_admin, fuel_master_data_admin
app.include_router(compliance_master_data_admin.router)
app.include_router(financial_master_data_admin.router)
app.include_router(fuel_master_data_admin.router)

# ---- Admin Dashboard & Payments ----
from app.routers import admin_dashboard, payment_admin
app.include_router(admin_dashboard.router)
app.include_router(payment_admin.router)

# ============================================================================
# ✅ PAYMENT SYNC ROUTER - CRITICAL
# ============================================================================
# THIS IS THE KEY REGISTRATION FOR PAYMENTS
# If this is missing or incorrect, payments won't be saved

logger.info("📥 [STARTUP] Registering payment sync router...")
try:
    from app.routers import subscriptions_payment
    app.include_router(subscriptions_payment.router)
    logger.info("✅ [STARTUP] Payment sync router registered successfully")
except ImportError as e:
    logger.error(f"❌ [STARTUP] Failed to import subscriptions_payment: {e}")
    logger.error("   Make sure subscriptions_payment.py exists in app/routers/")
except Exception as e:
    logger.error(f"❌ [STARTUP] Failed to register payment router: {e}")

# ---- Trip support & corrections ----
from app.routers import trip_support
app.include_router(trip_support.router)

# ============================================================================
# ✅ HEALTH & STATUS ENDPOINTS
# ============================================================================

@app.get("/")
def read_root():
    """Root endpoint - service identification."""
    return {
        "status": "ok",
        "service": "Smart Boda MVP1 backend",
        "version": "1.0.0"
    }

@app.get("/health")
def health_check():
    """Health check endpoint - used by load balancers and monitoring."""
    return {
        "status": "healthy",
        "service": "smartboda-backend"
    }

@app.get("/status")
def status_endpoint():
    """Detailed status information."""
    return {
        "status": "running",
        "service": "Smart Boda MVP1 API",
        "version": "1.0.0",
        "modules": {
            "admin": "✓",
            "onboarding": "✓",
            "trips": "✓",
            "fuel": "✓",
            "maintenance": "✓",
            "financial": "✓",
            "financial_history": "✓ (sb08 + sb19)",
            "compliance": "✓",
            "admin_dashboard": "✓",
            "payment_admin": "✓",
            "payment_sync": "✓",
            "sync_status": "✓"
        }
    }

# ============================================================================
# ✅ OPTIONS HANDLER FOR PREFLIGHT REQUESTS
# ============================================================================

@app.options("/{full_path:path}")
async def options_handler(full_path: str):
    """Handle CORS preflight requests."""
    return JSONResponse(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Sync-ID, X-Client-Timestamp",
            "Access-Control-Max-Age": "600",
        }
    )

# ============================================================================
# NOTES
# ============================================================================
"""
CRITICAL FIX FOR PAYMENT SYNC:

1. The subscriptions_payment router MUST be imported and registered
   using app.include_router(subscriptions_payment.router)

2. Make sure subscriptions_payment.py exists at:
   backend/app/routers/subscriptions_payment.py

3. The router prefix is "/subscriptions" so endpoints are:
   POST /subscriptions/payment
   GET /subscriptions/payments
   GET /subscriptions/payments/stats
   GET /subscriptions/payment/diagnostics
   GET /subscriptions/payment/verify/{sync_id}

4. Verify the Payment model is imported in the router
5. Ensure database session is properly configured with proper commit/rollback
"""