# backend/app/middleware/subscription_lock_middleware.py
# ============================================================================
# GLOBAL SUBSCRIPTION LOCK CHECKING MIDDLEWARE
# Requirements Coverage: REQ-7.1, REQ-7.2
# ============================================================================

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.subscription import RiderSubscription
from datetime import datetime, timezone
from uuid import UUID
import logging

logger = logging.getLogger(__name__)

class SubscriptionLockMiddleware(BaseHTTPMiddleware):
    """
    ✅ REQ-7.1, REQ-7.2: Global middleware to check subscription lock status on every API call.
    
    Behavior:
    - Checks if rider's subscription is locked
    - If locked AND requesting a non-payment endpoint: return 403 "Account Locked"
    - Allowed endpoints when locked:
      * POST /subscription/pay
      * POST /subscription/prepay
      * GET /subscription
      * POST /subscription/payments (view history)
    
    This ensures riders cannot access other features while their subscription is expired/locked.
    """
    
    # Endpoints that are allowed even when account is locked
    ALLOWED_WHEN_LOCKED = [
        "/subscription/pay",
        "/subscription/prepay",
        "/subscription",  # View subscription status
        "/subscription/payments",  # View payment history
        "/subscription/payment-details",  # View payment instructions
        "/auth/logout",  # Allow logout
        "/admin",  # Admin endpoints
    ]
    
    async def dispatch(self, request: Request, call_next):
        try:
            # Extract rider_id from query params or token
            rider_id = request.query_params.get("rider_id")
            
            # Skip check if no rider_id or if this is an allowed endpoint
            if not rider_id or self._is_allowed_endpoint(request.url.path):
                return await call_next(request)
            
            # Validate rider_id format
            try:
                rider_uuid = UUID(rider_id)
            except (ValueError, AttributeError):
                return await call_next(request)
            
            # Get database session
            db = next(get_db())
            
            try:
                # Query subscription
                sub = db.query(RiderSubscription).filter(
                    RiderSubscription.rider_id == rider_uuid
                ).first()
                
                if not sub:
                    # No subscription record yet - allow access
                    return await call_next(request)
                
                # Check if subscription expired
                self._check_lock(sub, db)
                
                # If locked and this is NOT a payment endpoint, return 403
                if sub.locked and not self._is_payment_endpoint(request.url.path):
                    return JSONResponse(
                        status_code=403,
                        content={
                            "detail": "Account Locked",
                            "lock_reason": sub.lock_reason,
                            "locked_at": sub.locked_at.isoformat() if sub.locked_at else None,
                            "message": "Your subscription has expired. Please renew your subscription to continue using Smart Boda.",
                            "action": "Navigate to subscription payment screen"
                        }
                    )
                
                db.close()
            except Exception as e:
                logger.error(f"Error checking subscription lock: {str(e)}")
                db.close()
            
            # Proceed with request
            return await call_next(request)
        
        except Exception as e:
            logger.error(f"Subscription lock middleware error: {str(e)}")
            return await call_next(request)
    
    def _check_lock(self, sub: RiderSubscription, db: Session):
        """Check if subscription should be locked based on expiry"""
        if not sub.locked and datetime.now(timezone.utc) > sub.expiry_at:
            sub.locked = True
            sub.lock_reason = "Subscription Expired" if sub.has_ever_paid else "Free Trial Expired"
            sub.locked_at = datetime.now(timezone.utc)
            db.commit()
    
    def _is_payment_endpoint(self, path: str) -> bool:
        """Check if this is a payment-related endpoint"""
        payment_endpoints = [
            "/subscription/pay",
            "/subscription/prepay",
            "/subscription/payments",  # History viewing is allowed
        ]
        return any(path.startswith(ep) for ep in payment_endpoints)
    
    def _is_allowed_endpoint(self, path: str) -> bool:
        """Check if this endpoint is allowed regardless of lock status"""
        return any(path.startswith(allowed) for allowed in self.ALLOWED_WHEN_LOCKED)


# ============================================================================
# USAGE IN main.py:
# ============================================================================
# 
# from app.middleware.subscription_lock_middleware import SubscriptionLockMiddleware
# 
# app = FastAPI()
# app.add_middleware(SubscriptionLockMiddleware)
#
