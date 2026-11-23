# backend/app/main.py
# ============================================================================
# CRITICAL FIX: CORS Configuration for credentials with specific origins
# ============================================================================
# ISSUE: Browser blocks requests with "withCredentials: true" when server 
# returns "Access-Control-Allow-Origin: *"
# SOLUTION: Use specific origins instead of wildcard when allow_credentials=True

from fastapi import FastAPI, Request, Query, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
import os
import logging
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from sqlalchemy import text, and_, or_
from sqlalchemy.orm import Session
from app.database import get_db, SessionLocal
from app.routers import sb08_financial_history, sb19_financial_history
from app.routers import admin_groups
from app.routers import chama_treasurer, chama_member
from app.routers import chama_mgr
from app.routers import rider_groups

# Configure logging
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Smart Boda MVP1 API",
    description="Rider app backend with offline sync, financial tracking, and admin console",
    version="1.0.0",
)

# ============================================================================
# CORS CONFIGURATION - FIXED
# ============================================================================
# Parse allowed origins from environment variable
def get_cors_origins():
    """
    Parse CORS origins from environment variable.
    
    CORRECTED: Uses specific origins instead of wildcard when allow_credentials=True.
    This fixes the browser error:
    "The value of the 'Access-Control-Allow-Origin' header in the response 
     must not be the wildcard '*' when the request's credentials mode is 'include'."
    
    Expected format in .env:
    CORS_ORIGINS=https://smart-boda-admin.onrender.com,https://smart-boda-api.onrender.com,http://localhost:3000,http://localhost:5173
    """
    cors_env = os.getenv("CORS_ORIGINS", "")
    
    if not cors_env:
        logger.warning(
            "⚠️  CORS_ORIGINS environment variable not set. Defaulting to localhost for development.\n"
            "For production, set CORS_ORIGINS in .env or deployment config."
        )
        return [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:8000",
            "https://smart-boda-admin.onrender.com",
        ]
    
    # Split by comma and strip whitespace
    origins = [origin.strip() for origin in cors_env.split(",") if origin.strip()]
    logger.info(f"✓ CORS origins configured: {origins}")
    return origins

allow_origins = get_cors_origins()

# Add CORS middleware with specific origins (not wildcard)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,           # Specific origins, not "*"
    allow_credentials=True,                 # Enable credentials (cookies, auth headers)
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "X-Business-Id", "X-Device-Id"],   # X-Device-Id: which phone a token refresh comes from (one active session per user)   # X-Business-Id: which of an Owner's businesses a request is for
    expose_headers=["Content-Length", "Content-Range"],
    max_age=600,                            # Preflight cache 10 minutes
)

# ============================================================================
# SMART APPS: ONE ACTIVE SESSION PER USER, enforced on EVERY request that carries a session token.
# The app sends its token with every call, so a phone whose session was replaced (login on another phone), ended (logout) or reset (PIN)
# is refused here with 401 {"code": "session_replaced" | "session_ended"} -- including on the older Smart Boda routes that never check a token themselves.
# This is defined BEFORE ensure_cors_headers so that the 401 still gets its CORS headers (the web app could not read it otherwise).
# REQUIRE_SESSION_ON_RIDER_ROUTES=true additionally refuses calls that carry NO token on those routes (turn on once every phone runs the new app).
# ============================================================================
from jose import jwt as _jwt, JWTError as _JWTError
from fastapi import HTTPException as _HTTPException
from starlette.concurrency import run_in_threadpool as _run_in_threadpool
from app.auth import SECRET_KEY as _SECRET_KEY, ALGORITHM as _ALGORITHM
from app.services import session_service as _session_service

_SESSION_GUARD_EXEMPT = ("/auth/", "/onboarding/", "/admin/", "/docs", "/redoc", "/openapi.json", "/health", "/legal", "/location-data", "/static", "/webhooks") + tuple(
    p.strip() for p in os.getenv("SESSION_GUARD_EXEMPT_PREFIXES", "").split(",") if p.strip())


def _check_session_sync(payload, kind):
    db = SessionLocal()
    try:
        _session_service.guard_payload(db, payload, kind)
        return None
    except _HTTPException as e:
        return e
    finally:
        db.close()


@app.middleware("http")
async def session_guard(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS":
        return await call_next(request)
    auth = request.headers.get("authorization", "")
    scheme, _, value = auth.partition(" ")
    has_bearer = scheme.lower() == "bearer" and bool(value.strip())
    if has_bearer and not path.startswith(("/auth/", "/onboarding/pin/login")):
        try:
            payload = _jwt.decode(value.strip(), _SECRET_KEY, algorithms=[_ALGORITHM])
        except _JWTError:
            payload = None                        # expired or invalid: the route itself decides
        if payload and payload.get("sid"):
            kind = "admin" if payload.get("typ") == "admin_app" else "rider"
            err = await _run_in_threadpool(_check_session_sync, payload, kind)
            if err is not None:
                return JSONResponse(status_code=err.status_code, content={"detail": err.detail})
    elif not has_bearer and _session_service.REQUIRE_SESSION_ON_RIDER_ROUTES and not path.startswith(_SESSION_GUARD_EXEMPT):
        return JSONResponse(status_code=401, content={"detail": _session_service.error_for(None) | {"code": "session_required"}})
    return await call_next(request)

@app.middleware("http")
async def ensure_cors_headers(request: Request, call_next):
    """Ensure CORS headers are always present, even on errors."""
    try:
        response = await call_next(request)
        
        # Ensure CORS headers are set on all responses
        origin = request.headers.get("origin")
        if origin in allow_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        
        return response
    except Exception as e:
        logger.error(f"Middleware error: {str(e)}", exc_info=e)
        origin = request.headers.get("origin")
        headers = {
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Business-Id, X-Device-Id",
        }
        if origin in allow_origins:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
        
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
            headers=headers
        )

# ============================================================================
# ERROR HANDLERS
# ============================================================================

# SMART CABZ: error and warning messages the server sends to the app are written for the signed-in person (a car driver reads "Smart Cabz Administrator").
from fastapi.exception_handlers import http_exception_handler as _default_http_handler
from starlette.exceptions import HTTPException as _StarletteHTTPException
from app.services import vehicle_words as _vw, audience_service as _audience_service


def _audience_for_request(auth_header: str) -> str:
    scheme, _, value = (auth_header or "").partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return _vw.RIDER
    try:
        payload = _jwt.decode(value.strip(), _SECRET_KEY, algorithms=[_ALGORITHM])
    except _JWTError:
        return _vw.RIDER
    if payload.get("typ") == "admin_app" or not payload.get("sub"):
        return _vw.RIDER
    db = SessionLocal()
    try:
        return _audience_service.audience_of_rider(db, payload["sub"])
    finally:
        db.close()


@app.exception_handler(_StarletteHTTPException)
async def audience_http_exception_handler(request: Request, exc: _StarletteHTTPException):
    if isinstance(exc.detail, (str, list, dict)):
        audience = await _run_in_threadpool(_audience_for_request, request.headers.get("authorization", ""))
        if audience != _vw.RIDER:
            exc.detail = _vw.convert_detail(exc.detail, audience)
    return await _default_http_handler(request, exc)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # With pydantic v2 a validator's `raise ValueError(...)` puts the exception object inside
    # exc.errors() (ctx.error). json.dumps cannot encode that, so the plain version of this handler
    # turned every such 422 (bad phone, bad amount...) into a 500.
    # jsonable_encoder with a custom encoder keeps the message and returns a proper 422.
    return JSONResponse(
        status_code=422,
        content={"detail": jsonable_encoder(exc.errors(), custom_encoder={Exception: str})},
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
    """
    Initialize database and seed data on startup.
    
    CORRECTED: This function now:
    1. Initializes database tables (critical - must succeed)
    2. Attempts to seed master data (non-critical - continues even if it fails)
    3. Handles seeding errors gracefully without crashing the application
    
    The key fix: Seeding errors are now caught and logged as warnings rather than 
    crashing the app with sys.exit(1). This allows deployments to succeed even if 
    duplicate data already exists (common on redeployment).
    """
    try:
        from app.database import init_db
        logger.info("🚀 Starting up Smart Boda MVP1 backend...")
        logger.info(f"🔓 CORS Origins: {allow_origins}")
        
        # Initialize database - CRITICAL (must succeed)
        init_db()
        logger.info("✓ Database initialized")
        
        # Seed master data - NON-CRITICAL (will not crash app if it fails)
        # This is idempotent and safe to run multiple times
        try:
            from app.seed.seed_all_data import run_all_seeds
            seeding_success = run_all_seeds()
            if seeding_success:
                logger.info("✓ Master data seeding completed")
            else:
                logger.warning("⚠ Master data seeding completed with warnings (see logs above)")
        except Exception as seeding_error:
            logger.warning(f"⚠ Seeding encountered an error but continuing startup: {str(seeding_error)}")
            logger.debug("Full seeding error:", exc_info=True)
        
    except Exception as e:
        logger.error(f"❌ Critical startup error: {str(e)}", exc_info=e)
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
from app.routers import master_data_admin, language, bike_profile, mobile_number, pin, setup_profile
app.include_router(master_data_admin.router)
app.include_router(language.router)
app.include_router(bike_profile.router)
app.include_router(setup_profile.router)
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
app.include_router(sb19_financial_history.router)

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

# ---- Manage Groups ----
app.include_router(admin_groups.router)
app.include_router(rider_groups.router)
app.include_router(rider_groups.notif_router)
app.include_router(chama_treasurer.router)
app.include_router(chama_member.router)
app.include_router(chama_mgr.router)

# ---- Individual riders: admin pre-registers a rider with no Treasurer / group ----
from app.routers import admin_individual_riders
app.include_router(admin_individual_riders.router)     # admin: /admin/individual-riders

# ---- Smart Bizna: business users onboard through Setup My Profile ----
from app.routers import admin_businesses, admin_business_types, business_types
app.include_router(admin_businesses.router)            # admin: /admin/businesses
app.include_router(admin_business_types.router)        # admin: /admin/business-types (master data)
app.include_router(business_types.router)              # public: GET /onboarding/business-types
from app.routers import business_ops, business_lipa_later, admin_business_statements
app.include_router(business_ops.router)               # Smart Bizna user app: /business/...
app.include_router(business_lipa_later.router)        # Smart Bizna Lipa Later (business tables): /business/lipa-later/...
from app.routers import admin_settings
app.include_router(admin_settings.router)             # /admin/settings/statement-fees (configurable)
app.include_router(admin_business_statements.router)  # admin: /admin/business-statements (requests + check a code)

# ---- Admin App: an Administrator signs in to the mobile app with mobile number + PIN ----
from app.routers import admin_app_auth
app.include_router(admin_app_auth.router)              # /admin/app/... (setup, PIN, login, dashboard, console access list)

# ---- Smart Apps: mobile number + PIN login, one active session per user, "set up my account on this phone" ----
from app.routers import auth_login, restore
app.include_router(auth_login.router)                  # /auth/login, /auth/logout, /auth/session
app.include_router(restore.router)                     # /restore/rider/trips

# ---- Smart Cabz: a Super Admin changes a vehicle type; notifications and error messages follow the person's kind ----
from app.routers import admin_vehicle_type
from app.services import notification_words                # noqa: F401  (registers the hook that words each notification for its recipient)
app.include_router(admin_vehicle_type.router)             # PATCH /admin/riders/{id}/vehicle-type

# ---- Subscriptions Payment Router Registration ----
from app.routers import subscriptions_payment
app.include_router(subscriptions_payment.router)

# ---- Correction window related ----
from app.routers import trip_support
app.include_router(trip_support.router)

# ✅ FIX (405 Method Not Allowed on POST /compliance/statements):
# sb20_statements.py fully implements GET/POST /compliance/statements but was
# never registered here, so no route existed for it. The catch-all
# `@app.options("/{full_path:path}")` handler further down this file matches
# *any* path for OPTIONS only, which is why OPTIONS returned 200 while POST
# returned 405 (Starlette sees a path match for the wrong method, rather than
# no match at all -> 405 instead of 404). Registering the router fixes this.
# sb18_compliance.py (/compliance/documents, expiry tracking) was found in
# the same audit - also fully implemented, also never registered - so it's
# included here too.
from app.routers import sb18_compliance, sb20_statements
app.include_router(sb18_compliance.router)
app.include_router(sb20_statements.router)


# ============================================================================
# ✅ LOCATION DATA ENDPOINTS (Direct - No Router Needed)
# ============================================================================

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
async def options_handler(full_path: str, request: Request):
    """Handle CORS preflight requests."""
    origin = request.headers.get("origin")
    headers = {
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Max-Age": "600",
    }
    
    if origin in allow_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    
    return JSONResponse(status_code=200, headers=headers)