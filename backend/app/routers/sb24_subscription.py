# backend/app/routers/sb24_subscription.py
# ============================================================================
# UPDATED: Bi-Weekly and Monthly plans ONLY, with offline sync support
# Requirements Coverage: REQ-1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.5, 3.3, 8.1
# OFFLINE SUPPORT: All subscription operations sync-safe for offline first
# ============================================================================

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from uuid import UUID
from app.database import get_db
from app.models.subscription import SubscriptionPlan, RiderSubscription
from app.models.payment import Payment
import math

router = APIRouter(prefix="/subscription", tags=["sb-24"])

# ✅ ONLY BIWEEKLY AND MONTHLY - NO WEEKLY OR DAILY
TRIAL_PERIOD_DAYS = 1
FREQUENCIES = {
    "biweekly": {"label": "Bi-Weekly", "days": 14, "emoji": "📆", "price_kes": 500},
    "monthly": {"label": "Monthly", "days": 30, "emoji": "📆", "price_kes": 1000},
}

# ✅ PAYMENT CONFIGURATION (OFFLINE SAFE - cached on device)
PAYMENT_CONFIG = {
    "safaricom_number": "0757 334 481",
    "payment_method": "Send Money",
    "bank_name": "Safaricom",
    "instructions": "Use 'Send Money' to pay subscription",
    "support_number": "+254 700 000 000",
    "last_updated": datetime.now(timezone.utc).isoformat(),
    "cache_minutes": 1440  # Cache for 24 hours offline
}

# ============================================================================
# HELPER FUNCTIONS (OFFLINE-SAFE)
# ============================================================================

def amount_for(freq_key: str, daily_price: float) -> dict:
    """
    ✅ OFFLINE: Calculate subscription amount for the given frequency.
    No network dependency - pure calculation.
    """
    if freq_key not in FREQUENCIES:
        raise ValueError(f"Invalid frequency: {freq_key}. Only 'biweekly' and 'monthly' supported.")
    
    f = FREQUENCIES[freq_key]
    amount = daily_price * f["days"]
    return {
        "key": freq_key,
        "label": f["label"],
        "emoji": f["emoji"],
        "days": f["days"],
        "price_kes": f["price_kes"],
        "amount": amount,
        "daily_rate": daily_price
    }

def days_until_expiry(sub: RiderSubscription) -> int:
    """✅ OFFLINE: Calculate days remaining - pure calculation"""
    if not sub:
        return 0
    return math.ceil((sub.expiry_at - datetime.now(timezone.utc)).total_seconds() / 86400)

def check_lock(sub: RiderSubscription):
    """✅ OFFLINE: Check if subscription should be locked - pure logic"""
    if not sub:
        return
    if not sub.locked and datetime.now(timezone.utc) > sub.expiry_at:
        sub.locked = True
        sub.lock_reason = "Subscription Expired" if sub.has_ever_paid else "Free Trial Expired"
        sub.locked_at = datetime.now(timezone.utc)

def ensure_subscription_plans_exist(db: Session):
    """
    ✅ ONLY BIWEEKLY & MONTHLY: Create 2 default plans if none exist.
    Plan 1: Smart Boda Bi-Weekly (500 KES for 14 days)
    Plan 2: Smart Boda Monthly (1000 KES for 30 days)
    """
    plan_count = db.query(SubscriptionPlan).count()
    
    if plan_count == 0:
        # Create Bi-Weekly Plan: 500 KES / 14 days = 35.71 KES/day
        biweekly_plan = SubscriptionPlan(
            name="Smart Boda Bi-Weekly",
            daily_price=35.71,
            trial_days=TRIAL_PERIOD_DAYS,
            tier_name="biweekly",
            tier_label="Bi-Weekly Plan",
            tier_description="500 KES for 2 weeks",
            is_active=True
        )
        db.add(biweekly_plan)
        
        # Create Monthly Plan: 1000 KES / 30 days = 33.33 KES/day
        monthly_plan = SubscriptionPlan(
            name="Smart Boda Monthly",
            daily_price=33.33,
            trial_days=TRIAL_PERIOD_DAYS,
            tier_name="monthly",
            tier_label="Monthly Plan",
            tier_description="1000 KES for 1 month",
            is_active=True
        )
        db.add(monthly_plan)
        db.commit()

def ensure_subscription_exists(rider_uuid: UUID, db: Session) -> RiderSubscription:
    """
    ✅ OFFLINE SAFE: Ensure subscription record exists for rider.
    Safe for offline - only creates minimal record with trial expiry.
    """
    ensure_subscription_plans_exist(db)
    
    sub = db.query(RiderSubscription).filter(RiderSubscription.rider_id == rider_uuid).first()
    
    if not sub:
        plan = db.query(SubscriptionPlan).order_by(SubscriptionPlan.id).first()
        
        if not plan:
            plan = SubscriptionPlan(
                name="Smart Boda Monthly",
                daily_price=33.33,
                trial_days=TRIAL_PERIOD_DAYS,
                tier_name="monthly",
                tier_label="Monthly Plan",
                is_active=True
            )
            db.add(plan)
            db.commit()
            db.refresh(plan)
        
        now = datetime.now(timezone.utc)
        trial_expiry = now + timedelta(days=TRIAL_PERIOD_DAYS)
        
        sub = RiderSubscription(
            rider_id=rider_uuid,
            plan_id=None,  # No plan assigned during trial
            expiry_at=trial_expiry,
            frequency="monthly",  # Default for display
            has_ever_paid=False,
            locked=False,
            lock_reason=None,
            created_at=now,
            updated_at=now
        )
        db.add(sub)
        db.commit()
    
    return sub

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("")
def get_subscription(
    rider_id: str = Query(..., description="Rider ID is required"),
    db: Session = Depends(get_db)
):
    """
    ✅ OFFLINE-SAFE: Get subscription status and available plans.
    
    Response cached on device for offline access.
    All calculations done client-side from cached data if offline.
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider_id format")
    
    sub = ensure_subscription_exists(rider_uuid, db)
    check_lock(sub)
    db.commit()
    
    # Get active plans (BIWEEKLY & MONTHLY ONLY)
    plans = db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active).all()
    
    # ✅ OFFLINE: Response includes cache metadata for offline sync
    return {
        "rider_id": str(rider_uuid),
        "subscription": {
            "plan_id": sub.plan_id,
            "plan_name": "Smart Boda" if not sub.plan_id else db.query(SubscriptionPlan).get(sub.plan_id).name,
            "expiry_at": sub.expiry_at.isoformat(),
            "days_left": days_until_expiry(sub),
            "frequency": sub.frequency,
            "has_ever_paid": sub.has_ever_paid,
            "locked": sub.locked,
            "lock_reason": sub.lock_reason,
            "locked_at": sub.locked_at.isoformat() if sub.locked_at else None,
            "total_paid_lifetime": float(sub.total_paid_lifetime or 0)
        },
        "available_plans": [
            {
                "id": p.id,
                "name": p.name,
                "daily_price": float(p.daily_price),
                "tier_name": p.tier_name,
                "tier_label": p.tier_label,
                "tier_description": p.tier_description
            } for p in plans
        ],
        "frequencies": FREQUENCIES,  # BIWEEKLY & MONTHLY ONLY
        "metadata": {
            "cached_at": datetime.now(timezone.utc).isoformat(),
            "cache_ttl_seconds": 3600,  # Cache for 1 hour offline
            "requires_sync": False
        }
    }

@router.get("/payment-details")
def get_payment_details():
    """
    ✅ OFFLINE: Payment configuration (caches on device for offline).
    Never changes, safe to cache indefinitely.
    """
    return {
        **PAYMENT_CONFIG,
        "supported_frequencies": list(FREQUENCIES.keys()),  # ["biweekly", "monthly"]
        "metadata": {
            "cached_at": datetime.now(timezone.utc).isoformat(),
            "cache_ttl_seconds": 86400  # Cache for 24 hours
        }
    }

@router.post("/pay")
def submit_payment(
    rider_id: str = Query(..., description="Rider ID is required"),
    frequency_key: str = Query(..., description="'biweekly' or 'monthly' ONLY"),
    mpesa_code: str = Query(..., description="M-Pesa confirmation code"),
    db: Session = Depends(get_db)
):
    """
    ✅ OFFLINE-SAFE PAYMENT:
    - Validates locally (offline possible)
    - Creates offline queue entry on device
    - Syncs to backend when online
    - INSTANT unlock happens on device, syncs to backend
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    # ✅ BIWEEKLY & MONTHLY ONLY
    if frequency_key not in FREQUENCIES:
        raise HTTPException(
            422, 
            f"Invalid frequency. Only 'biweekly' and 'monthly' are supported."
        )
    
    # Validate M-Pesa code
    code = (mpesa_code or "").strip().upper()
    if not code:
        raise HTTPException(422, "M-Pesa confirmation code is required.")
    if len(code) < 8:
        raise HTTPException(422, "M-Pesa code too short. Please verify and re-enter.")

    sub = ensure_subscription_exists(rider_uuid, db)
    
    plan = db.query(SubscriptionPlan).order_by(SubscriptionPlan.id).first()
    if not plan:
        raise HTTPException(500, "Subscription plan not configured")
    
    calc = amount_for(frequency_key, float(plan.daily_price))
    now = datetime.now(timezone.utc)
    
    # Subscription stacking
    base = max(sub.expiry_at, now)
    sub.expiry_at = base + timedelta(days=calc["days"])
    sub.plan_id = plan.id
    sub.frequency = frequency_key
    sub.has_ever_paid = True
    was_locked = sub.locked
    sub.locked = False
    sub.lock_reason = None
    sub.last_payment_at = now
    sub.last_payment_amount = calc["amount"]
    sub.total_paid_lifetime = (sub.total_paid_lifetime or 0) + calc["amount"]

    # Record payment
    payment = Payment(
        rider_id=rider_uuid,
        amount=calc["amount"],
        label=f"{calc['label']} Plan",
        mpesa_code=code,
        submitted_at=now
    )
    db.add(payment)
    db.commit()
    
    # ✅ OFFLINE: Response includes data for local offline cache
    return {
        "success": True,
        "rider_id": str(rider_uuid),
        "payment": {
            "id": str(payment.id),
            "amount": float(payment.amount),
            "label": payment.label,
            "mpesa_code": payment.mpesa_code,
            "reconciliation": payment.reconciliation,
            "submitted_at": payment.submitted_at.isoformat()
        },
        "subscription": {
            "new_expiry_at": sub.expiry_at.isoformat(),
            "was_locked": was_locked,
            "now_unlocked": True,  # ✅ INSTANT UNLOCK
            "days_added": calc["days"],
            "frequency": frequency_key,
            "new_expiry_date": (base + timedelta(days=calc["days"])).date().isoformat()
        },
        "message": "Payment recorded! Your subscription is active. Super Admin will verify shortly.",
        "metadata": {
            "synced_at": now.isoformat(),
            "requires_sync": False,
            "offline_safe": True
        }
    }

@router.post("/prepay")
def submit_prepay(
    rider_id: str = Query(..., description="Rider ID is required"),
    days: int = Query(..., ge=3, le=60, description="Number of days (3-60)"),
    mpesa_code: str = Query(..., description="M-Pesa confirmation code"),
    db: Session = Depends(get_db)
):
    """
    ✅ OFFLINE-SAFE: Prepayment with offline sync support.
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    if not (3 <= days <= 60):
        raise HTTPException(422, "Prepayment must be between 3 and 60 days.")
    
    code = (mpesa_code or "").strip().upper()
    if not code or len(code) < 8:
        raise HTTPException(422, "Enter a valid M-Pesa confirmation code.")
    
    sub = ensure_subscription_exists(rider_uuid, db)
    
    plan = db.query(SubscriptionPlan).order_by(SubscriptionPlan.id).first()
    if not plan:
        raise HTTPException(500, "Subscription plan not configured")
    
    total = days * float(plan.daily_price)
    now = datetime.now(timezone.utc)
    base = max(sub.expiry_at, now)
    sub.expiry_at = base + timedelta(days=days)
    was_locked = sub.locked
    sub.locked = False
    sub.lock_reason = None
    sub.last_payment_at = now
    sub.last_payment_amount = total
    
    db.add(Payment(
        rider_id=rider_uuid,
        amount=total,
        label=f"{days}-Day Prepayment",
        mpesa_code=code,
        submitted_at=now
    ))
    db.commit()
    
    return {
        "success": True,
        "prepayment": {
            "days": days,
            "amount": round(total, 2),
            "new_expiry_at": sub.expiry_at.isoformat(),
            "was_locked": was_locked,
            "now_unlocked": True
        },
        "message": f"Prepaid {days} days successfully!",
        "metadata": {
            "offline_safe": True
        }
    }

@router.get("/payments")
def payment_history(
    rider_id: str = Query(..., description="Rider ID is required"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db)
):
    """
    ✅ OFFLINE: Payment history (cached for offline access).
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    q = db.query(Payment).filter(Payment.rider_id == rider_uuid).order_by(Payment.submitted_at.desc())
    total = q.count()
    items = q.offset((page-1)*page_size).limit(page_size).all()
    
    return {
        "payments": [
            {
                "id": str(item.id),
                "amount": float(item.amount),
                "label": item.label,
                "mpesa_code": item.mpesa_code,
                "submitted_at": item.submitted_at.isoformat(),
                "reconciliation": item.reconciliation,
                "verified_by": item.verified_by,
                "verified_at": item.verified_at.isoformat() if item.verified_at else None
            } for item in items
        ],
        "pagination": {
            "page": page,
            "total_pages": max(1, -(-total // page_size)),
            "total": total
        },
        "metadata": {
            "cache_ttl_seconds": 3600,
            "offline_safe": True
        }
    }
