# backend/app/routers/sb24_subscription.py
# ✅ FIXED: Auto-create subscription record for new riders instead of returning 404
# This resolves the issue where the subscription endpoint returned 404 when accessed
# by riders who didn't have a subscription record yet.

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from uuid import UUID
from app.database import get_db
from app.models.subscription import SubscriptionPlan, RiderSubscription
from app.models.payment import Payment

router = APIRouter(prefix="/subscription", tags=["sb-24"])

FREQUENCIES = {  # Configurable frequency options
    "weekly":   {"label": "Weekly",   "days": 7,  "emoji": "📆"},
    "biweekly": {"label": "Biweekly", "days": 14, "emoji": "📆"},
    "monthly":  {"label": "Monthly",  "days": 30, "emoji": "📆"},
}

TRIAL_PERIOD_DAYS = 1  # Free trial duration in days

def amount_for(freq_key: str, daily_price: float) -> dict:
    """Calculate subscription amount for the given frequency"""
    if freq_key not in FREQUENCIES:
        raise ValueError(f"Invalid frequency: {freq_key}")
    
    f = FREQUENCIES[freq_key]
    amount = daily_price * f["days"]
    return {
        **f,
        "key": freq_key,
        "amount": amount,
        "days": f["days"]
    }

def days_until_expiry(sub: RiderSubscription) -> int:
    """Calculate days remaining until subscription expiry"""
    import math
    if not sub:
        return 0
    return math.ceil((sub.expiry_at - datetime.now(timezone.utc)).total_seconds() / 86400)

def check_lock(sub: RiderSubscription):
    """Check if subscription should be locked and update status"""
    if not sub:
        return
    if not sub.locked and datetime.now(timezone.utc) > sub.expiry_at:
        sub.locked = True
        sub.lock_reason = "Subscription Expired" if sub.has_ever_paid else "Free Trial Expired"
        sub.locked_at = datetime.now(timezone.utc)

def ensure_subscription_exists(rider_uuid: UUID, db: Session) -> RiderSubscription:
    """
    ✅ FIXED: Ensure a subscription record exists for the rider.
    If not, create one with a free trial expiry.
    Also ensures a default subscription plan exists.
    This prevents 404 errors when accessing subscription endpoint.
    """
    sub = db.query(RiderSubscription).filter(RiderSubscription.rider_id == rider_uuid).first()
    
    if not sub:
        # First, ensure a subscription plan exists
        plan = db.query(SubscriptionPlan).order_by(SubscriptionPlan.id).first()
        
        if not plan:
            # Create a default plan if none exists
            plan = SubscriptionPlan(
                name="Smart Boda Standard",
                daily_price=35.0,
                trial_days=TRIAL_PERIOD_DAYS,
                tier_name="standard",
                tier_label="Standard Plan",
                is_active=True
            )
            db.add(plan)
            db.commit()
            db.refresh(plan)
        
        # Create a new subscription with free trial
        now = datetime.now(timezone.utc)
        trial_expiry = now + timedelta(days=TRIAL_PERIOD_DAYS)
        
        sub = RiderSubscription(
            rider_id=rider_uuid,
            plan_id=plan.id,  # Use existing or newly created plan
            expiry_at=trial_expiry,
            frequency="monthly",
            has_ever_paid=False,
            locked=False,
            lock_reason=None,
            created_at=now,
            updated_at=now
        )
        db.add(sub)
        db.commit()
    
    return sub

@router.get("")
def get_subscription(
    rider_id: str = Query(..., description="Rider ID is required"),
    db: Session = Depends(get_db)
):
    """
    Get rider's current subscription status and plan pricing.
    Returns plan configuration, current subscription status, and days remaining.
    
    ✅ FIXED: Now automatically creates a subscription record if one doesn't exist,
    instead of returning 404.
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    # ✅ FIXED: Validate and convert rider_id to UUID
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider_id format. Must be a valid UUID.")
    
    # ✅ FIXED: Ensure subscription exists (creates if needed)
    sub = ensure_subscription_exists(rider_uuid, db)
    
    plan = db.query(SubscriptionPlan).get(1)
    check_lock(sub)
    db.commit()
    
    return {
        "plan_name": plan.name if plan else "Smart Boda Standard",
        "daily_price": float(plan.daily_price) if plan else 0,
        "frequency": sub.frequency or "weekly",
        "has_ever_paid": sub.has_ever_paid,
        "locked": sub.locked,
        "lock_reason": sub.lock_reason,
        "locked_at": sub.locked_at,
        "expiry_at": sub.expiry_at,
        "days_left": days_until_expiry(sub),
        "frequencies": FREQUENCIES
    }

@router.post("/pay")
def submit_payment(
    rider_id: str = Query(..., description="Rider ID is required"),
    frequency_key: str = Query(..., description="Subscription frequency (weekly/biweekly/monthly)"),
    mpesa_code: str = Query(..., description="M-Pesa confirmation code"),
    db: Session = Depends(get_db)
):
    """
    Submit subscription payment via M-Pesa (manual/offline mode).
    - M-Pesa code is validated for format (required, min 8 characters)
    - Payment is recorded as "Pending Super Admin Review"
    - Subscription is unlocked immediately upon submission
    - Super Admin manually reconciles against M-Pesa messages
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    # ✅ FIXED: Validate and convert rider_id to UUID
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider_id format. Must be a valid UUID.")
    
    if frequency_key not in FREQUENCIES:
        raise HTTPException(422, f"Invalid frequency. Choose from: {', '.join(FREQUENCIES.keys())}")
    
    code = (mpesa_code or "").strip().upper()
    if not code:
        raise HTTPException(422, "M-Pesa confirmation code is required.")
    if len(code) < 8:
        raise HTTPException(422, "That code looks too short — please check the M-Pesa message and re-enter it.")

    # ✅ FIXED: Ensure subscription exists first
    sub = ensure_subscription_exists(rider_uuid, db)
    
    plan = db.query(SubscriptionPlan).get(1)
    if not plan:
        raise HTTPException(500, "Subscription plan not configured")
    
    calc = amount_for(frequency_key, float(plan.daily_price))
    now = datetime.now(timezone.utc)
    
    # Extend from the later of (now, current expiry) — stacks time on remaining
    base = max(sub.expiry_at, now)
    sub.expiry_at = base + timedelta(days=calc["days"])
    sub.frequency = frequency_key
    sub.has_ever_paid = True
    was_locked = sub.locked
    sub.locked = False  # Unlock immediately
    sub.lock_reason = None

    payment = Payment(
        rider_id=rider_uuid,
        amount=calc["amount"],
        label=f"{calc['label']} Plan",
        mpesa_code=code,
        submitted_at=now
        # reconciliation defaults to "Pending Super Admin Review"
    )
    db.add(payment)
    db.commit()
    
    return {
        "new_expiry_at": sub.expiry_at,
        "was_locked": was_locked,
        "days_added": calc["days"],
        "status": "Payment recorded - awaiting Super Admin verification"
    }

@router.post("/prepay")
def submit_prepay(
    rider_id: str = Query(..., description="Rider ID is required"),
    days: int = Query(..., ge=3, le=60, description="Number of days to prepay (3-60)"),
    mpesa_code: str = Query(..., description="M-Pesa confirmation code"),
    db: Session = Depends(get_db)
):
    """
    Submit multi-day prepayment via M-Pesa.
    Allows riders to prepay 3-60 days at daily rate.
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    # ✅ FIXED: Validate and convert rider_id to UUID
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider_id format. Must be a valid UUID.")
    
    if not (3 <= days <= 60):
        raise HTTPException(422, "Prepayment must be between 3 and 60 days.")
    
    code = (mpesa_code or "").strip().upper()
    if not code or len(code) < 8:
        raise HTTPException(422, "Enter a valid M-Pesa confirmation code.")
    
    # ✅ FIXED: Ensure subscription exists first
    sub = ensure_subscription_exists(rider_uuid, db)
    
    plan = db.query(SubscriptionPlan).get(1)
    if not plan:
        raise HTTPException(500, "Subscription plan not configured")
    
    total = days * float(plan.daily_price)
    now = datetime.now(timezone.utc)
    base = max(sub.expiry_at, now)
    sub.expiry_at = base + timedelta(days=days)
    was_locked = sub.locked
    sub.locked = False
    sub.lock_reason = None
    
    db.add(Payment(
        rider_id=rider_uuid,
        amount=total,
        label=f"{days}-Day Prepayment",
        mpesa_code=code,
        submitted_at=now
    ))
    db.commit()
    
    return {
        "new_expiry_at": sub.expiry_at,
        "was_locked": was_locked,
        "days_added": days,
        "status": "Prepayment recorded - awaiting Super Admin verification"
    }

@router.get("/payments")
def payment_history(
    rider_id: str = Query(..., description="Rider ID is required"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db)
):
    """
    Retrieve a rider's payment history (read-only).
    Never editable by the rider — pure read-only ledger.
    Includes reconciliation status (Pending Super Admin Review or Verified).
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    # ✅ FIXED: Validate and convert rider_id to UUID
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider_id format. Must be a valid UUID.")
    
    q = db.query(Payment).filter(Payment.rider_id == rider_uuid).order_by(Payment.submitted_at.desc())
    total = q.count()
    items = q.offset((page-1)*page_size).limit(page_size).all()
    
    return {
        "items": items,
        "page": page,
        "total_pages": max(1, -(-total // page_size)),
        "total": total
    }
