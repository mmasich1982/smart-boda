# backend/app/main.py
# ============================================================================
# UPDATED: Subscription middleware and router integration
# Requirements: REQ-7.1, REQ-7.2
# ============================================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.base import BaseHTTPMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

# ✅ Import subscription modules
from app.middleware.subscription_lock_middleware import SubscriptionLockMiddleware
from app.routers import (
    sb24_subscription,
    admin_subscription,  # NEW
    # ... other routers ...
)

# Initialize FastAPI app
app = FastAPI(
    title="Smart Boda API",
    description="Smart Boda Backend API",
    version="1.0.0"
)

# ============================================================================
# CORS MIDDLEWARE (EXISTING)
# ============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# ✅ ADD SUBSCRIPTION LOCK MIDDLEWARE (NEW)
# ============================================================================
# This middleware runs on EVERY API call to check subscription lock status
# If rider is locked, blocks access to non-payment endpoints

app.add_middleware(SubscriptionLockMiddleware)

# ============================================================================
# ROUTER REGISTRATION
# ============================================================================

# ✅ BIWEEKLY & MONTHLY SUBSCRIPTION ROUTER
app.include_router(sb24_subscription.router)

# ✅ ADMIN SUBSCRIPTION MANAGEMENT ROUTER (NEW)
app.include_router(admin_subscription.router)

# ... existing routers ...

# ============================================================================
# HEALTH CHECK ENDPOINT
# ============================================================================

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Smart Boda API",
        "subscription_module": "active",
        "offline_support": "enabled"
    }

# ============================================================================
# STARTUP EVENT
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize subscription system on startup"""
    from app.database import SessionLocal
    from app.routers.sb24_subscription import ensure_subscription_plans_exist
    
    db = SessionLocal()
    try:
        # ✅ Create default subscription plans if they don't exist
        ensure_subscription_plans_exist(db)
        print("✅ Subscription plans initialized")
        print("   - Bi-Weekly Plan: 500 KES for 14 days")
        print("   - Monthly Plan: 1000 KES for 30 days")
    except Exception as e:
        print(f"⚠️ Error initializing subscription plans: {e}")
    finally:
        db.close()

# ============================================================================
# SHUTDOWN EVENT
# ============================================================================

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("🛑 Smart Boda API shutting down")

# ============================================================================
# REQUIRED ENVIRONMENT VARIABLES (For .env file)
# ============================================================================
"""
DATABASE_URL=postgresql://user:password@host:5432/smart_boda
MPESA_WEBHOOK_URL=https://your-domain.com/webhooks/mpesa
SAFARICOM_NUMBER=0757334481
ADMIN_EMAIL=admin@smartboda.com
DEBUG=False
"""

# ============================================================================
# MIDDLEWARE EXECUTION ORDER
# ============================================================================
"""
Request Flow:
1. CORSMiddleware - Handle cross-origin requests
2. SubscriptionLockMiddleware - Check subscription lock status
3. Route Handler - Process the request
4. Response - Return to client

If subscription is locked and endpoint is not in ALLOWED_WHEN_LOCKED:
- Returns 403 Forbidden
- Message: "Account Locked"
- Client receives lock_reason and instructions
"""
