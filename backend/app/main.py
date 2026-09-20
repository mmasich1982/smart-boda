from fastapi import FastAPI, Request, Query, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import os
import logging
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from sqlalchemy import text, and_, or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.routers import sb08_financial_history, sb19_financial_history

# Configure logging
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Smart Boda MVP1 API",
    description="Rider app backend with offline sync, financial tracking, and admin console",
    version="1.0.0",
)

# ============================================================================
# CORS CONFIGURATION
# ============================================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def ensure_cors_headers(request: Request, call_next):
    """Ensure CORS headers are always present, even on errors."""
    try:
        response = await call_next(request)
        # CORS middleware already added headers, just pass through
        return response
    except Exception as e:
        logger.error(f"Middleware error: {str(e)}", exc_info=e)
        # Return error response with CORS headers
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
# ERROR HANDLERS
# ============================================================================

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )

@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error(f"Database error: {str(exc)}", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Database error occurred"},
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

# ============================================================================
# STARTUP & SHUTDOWN EVENTS
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize database and seed data on startup."""
    try:
        from app.database import init_db, engine
        logger.info("🚀 Starting up Smart Boda MVP1 backend...")
        
        # Initialize database
        init_db(engine)
        logger.info("✓ Database initialized")
        
        # Seed master data
        from app.seed.seed_master_data import seed_all
        seed_all()
        logger.info("✓ Master data seeding completed")
        
    except Exception as e:
        logger.error(f"❌ Startup error: {str(e)}", exc_info=e)
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    try:
        from app.database import engine
        logger.info("Shutting down...")
        
        # Close database connections
        engine.dispose()
        logger.info("✓ Database connection pool closed")
        
    except Exception as e:
        logger.error(f"Shutdown error: {str(e)}", exc_info=e)

# ============================================================================
# ✅ ROUTER REGISTRATION (Module A - Onboarding & Auth)
# ============================================================================

# ---- Admin Auth Router ----
from app.routers import admin_auth
app.include_router(admin_auth.router, prefix="/admin/auth", tags=["admin-auth"])

# ---- Module A routers ----
from app.routers import master_data_admin, location_master_data_admin, language, bike_profile, mobile_number, pin
app.include_router(master_data_admin.router)
app.include_router(location_master_data_admin.router)
app.include_router(language.router)
app.include_router(bike_profile.router)
app.include_router(mobile_number.router)
app.include_router(pin.router)

# ---- Trip Routers (Module B - Trip Management) ----
from app.routers import trip_master_data_admin, sb05_trip_entry, sb05_lipa_later, sb07_trip_correction
app.include_router(trip_master_data_admin.router)
app.include_router(sb05_trip_entry.router)
app.include_router(sb05_lipa_later.router)
app.include_router(sb07_trip_correction.router)

# ---- Financial History Routers (Module C - Financial Tracking) ----
app.include_router(sb08_financial_history.router_api)
app.include_router(sb08_financial_history.router_compliance)
app.include_router(sb19_financial_history.router)  # ✅ NEW: Fixed financial history router

# ---- Core Entry Routers (Modules D-H) ----
from app.routers import (
    sb09_fuel_entry,
    sb10_battery_entry,
    sb12_maintenance,
    financial_expense,
    sb13_net_profit,
)
app.include_router(sb09_fuel_entry.router)
app.include_router(sb10_battery_entry.router)
app.include_router(sb12_maintenance.router)
app.include_router(financial_expense.router)
app.include_router(sb13_net_profit.router)

# ---- Admin Routers (Admin Console) ----
from app.routers import compliance_master_data_admin, financial_master_data_admin, fuel_master_data_admin
app.include_router(compliance_master_data_admin.router)
app.include_router(financial_master_data_admin.router)
app.include_router(fuel_master_data_admin.router)

# ---- Admin Dashboard ----
from app.routers import admin_dashboard
app.include_router(admin_dashboard.router)

# ---- Payment Admin ----
from app.routers import payment_admin
app.include_router(payment_admin.router)

# ---- Subscriptions Payment Router Registration ----
from app.routers import subscriptions_payment
app.include_router(subscriptions_payment.router)

# ---- Correction window related ----
from app.routers import trip_support
app.include_router(trip_support.router)


# ============================================================================
# ✅ LOCATION DATA ENDPOINTS (Direct - No Router Needed)
# ============================================================================
# These endpoints are defined directly to ensure they work regardless of router registration issues

@app.get("/location-data/counties")
async def get_counties_direct(
    search: str = Query(None, description="Search by county name"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """Fetch all active counties - PUBLIC ENDPOINT."""
    try:
        from app.models.location_models import County
        query = db.query(County).filter(County.is_active == True)
        
        if search:
            search_term = f"%{search.lower()}%"
            query = query.filter(
                or_(
                    County.county_name.ilike(search_term),
                    County.county_code.ilike(search_term)
                )
            )
        
        counties = query.order_by(County.county_name).offset(skip).limit(limit).all()
        logger.info(f"✅ Fetched {len(counties)} counties")
        
        return {
            "status": "success",
            "data": [
                {"id": c.id, "name": c.county_name, "code": c.county_code}
                for c in counties
            ],
            "count": len(counties)
        }
    except Exception as e:
        logger.error(f"❌ Error fetching counties: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/location-data/sub-counties")
async def get_sub_counties_direct(
    county_id: int = Query(..., description="County ID"),
    search: str = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """Fetch sub-counties for a county - PUBLIC ENDPOINT."""
    try:
        from app.models.location_models import SubCounty
        query = db.query(SubCounty).filter(
            and_(SubCounty.county_id == county_id, SubCounty.is_active == True)
        )
        
        if search:
            search_term = f"%{search.lower()}%"
            query = query.filter(
                or_(
                    SubCounty.sub_county_name.ilike(search_term),
                    SubCounty.sub_county_code.ilike(search_term)
                )
            )
        
        sub_counties = query.order_by(SubCounty.sub_county_name).offset(skip).limit(limit).all()
        logger.info(f"✅ Fetched {len(sub_counties)} sub-counties for county {county_id}")
        
        return {
            "status": "success",
            "data": [
                {"id": sc.id, "name": sc.sub_county_name, "code": sc.sub_county_code, "county_id": sc.county_id}
                for sc in sub_counties
            ],
            "count": len(sub_counties)
        }
    except Exception as e:
        logger.error(f"❌ Error fetching sub-counties: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/location-data/wards")
async def get_wards_direct(
    sub_county_id: int = Query(None),
    county_id: int = Query(None),
    search: str = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """Fetch wards with optional filtering - PUBLIC ENDPOINT."""
    try:
        from app.models.location_models import Ward
        query = db.query(Ward).filter(Ward.is_active == True)
        
        if sub_county_id:
            query = query.filter(Ward.sub_county_id == sub_county_id)
        elif county_id:
            query = query.filter(Ward.county_id == county_id)
        else:
            raise HTTPException(status_code=400, detail="sub_county_id or county_id required")
        
        if search:
            search_term = f"%{search.lower()}%"
            query = query.filter(
                or_(
                    Ward.ward_name.ilike(search_term),
                    Ward.ward_code.ilike(search_term)
                )
            )
        
        wards = query.order_by(Ward.ward_name).offset(skip).limit(limit).all()
        logger.info(f"✅ Fetched {len(wards)} wards")
        
        return {
            "status": "success",
            "data": [
                {"id": w.id, "name": w.ward_name, "code": w.ward_code, "sub_county_id": w.sub_county_id, "county_id": w.county_id}
                for w in wards
            ],
            "count": len(wards)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error fetching wards: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
    """Health check endpoint for load balancers."""
    return {
        "status": "healthy",
        "service": "smart-boda-api",
    }

@app.get("/status")
async def status_check(db: Session = Depends(get_db)):
    """Detailed status check including database connectivity."""
    try:
        # Test database connection
        db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "service": "smart-boda-api",
            "database": "connected",
            "timestamp": os.getenv("DEPLOYMENT_TIME", "unknown")
        }
    except Exception as e:
        logger.error(f"Status check failed: {str(e)}")
        return {
            "status": "degraded",
            "service": "smart-boda-api",
            "database": "disconnected",
            "error": str(e)
        }

@app.options("/{full_path:path}")
async def options_handler(full_path: str):
    """Handle CORS preflight requests."""
    return JSONResponse(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
            "Access-Control-Max-Age": "600",
        }
    )