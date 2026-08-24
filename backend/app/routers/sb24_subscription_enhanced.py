# backend/app/routers/sb24_subscription_enhanced.py
# ============================================================================
# ENHANCED SUBSCRIPTION ROUTER FOR RIDERS
# ✅ Complete rider-facing endpoints with offline support
# Requirements: REQ-1.1 to REQ-6.4, REQ-9.1
# ============================================================================

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from uuid import UUID
from typing import Optional

from app.database import get_db
from app.models.subscription_enhanced import (
    SubscriptionPlan,
    RiderSubscription,
    Payment,
    PendingPriceChange
)
from app.services.subscription_service import SubscriptionService

router = APIRouter(prefix="/subscription", tags=["sb-24"])


# ============================================================================
# SUBSCRIPTION STATUS & DETAILS
# ============================================================================

@router.get("")
def get_subscription(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """
    Get complete subscription status for rider
    ✅ REQ-1.1: Returns subscription state with pricing
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    try:
        status = SubscriptionService.get_subscription_status(db, rider_uuid)
        
        # Add frequency metadata
        frequencies = {}
        for freq_key in SubscriptionService.FREQUENCIES.keys():
            plan = db.query(SubscriptionPlan).filter(
                SubscriptionPlan.tier_name == freq_key,
                SubscriptionPlan.is_active == True
            ).first()
            
            if plan:
                calc = SubscriptionService.calculate_subscription_amount(
                    freq_key,
                    float(plan.daily_price)
                )
                frequencies[freq_key] = calc
        
        status["available_frequencies"] = frequencies
        
        # Add pending price change if exists
        sub = SubscriptionService.ensure_subscription_exists(db, rider_uuid)
        pending = db.query(PendingPriceChange).filter(
            PendingPriceChange.plan_id == sub.plan_id
        ).first() if sub.plan_id else None
        
        if pending:
            now = datetime.now(timezone.utc)
            hours_until = int((pending.effective_at - now).total_seconds() / 3600)
            status["pending_price_change"] = {
                "daily_price": float(pending.daily_price),
                "effective_at": pending.effective_at.isoformat(),
                "hours_until_effective": hours_until
            }
        
        return status
    
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/status")
def get_subscription_status_simple(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """
    Simplified status endpoint for quick checks
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    status = SubscriptionService.get_subscription_status(db, rider_uuid)
    
    return {
        "locked": status["locked"],
        "lock_reason": status["lock_reason"],
        "expiry_at": status["expiry_at"],
        "days_left": status["days_left"],
        "has_ever_paid": status["has_ever_paid"]
    }


# ============================================================================
# PAYMENT PROCESSING
# ============================================================================

@router.post("/pay")
def submit_subscription_payment(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    frequency_key: str = Query(..., description="'biweekly' or 'monthly'"),
    mpesa_code: str = Query(..., description="M-Pesa confirmation code"),
    db: Session = Depends(get_db)
):
    """
    ✅ REQ-2.1-2.5: Process subscription payment
    - Immediate unlock after payment
    - Payment stacking support
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    if frequency_key not in SubscriptionService.FREQUENCIES:
        raise HTTPException(422, "Invalid frequency. Choose: biweekly, monthly")
    
    try:
        mpesa_code_validated = SubscriptionService.validate_mpesa_code(mpesa_code)
    except ValueError as e:
        raise HTTPException(422, str(e))
    
    try:
        result = SubscriptionService.process_subscription_payment(
            db=db,
            rider_id=rider_uuid,
            frequency=frequency_key,
            mpesa_code=mpesa_code_validated
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/prepay")
def submit_prepayment(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    days: int = Query(..., ge=3, le=60, description="Days to prepay (3-60)"),
    mpesa_code: str = Query(..., description="M-Pesa confirmation code"),
    db: Session = Depends(get_db)
):
    """
    ✅ REQ-9.1: Process prepayment for flexible days
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    if not (3 <= days <= 60):
        raise HTTPException(422, "Prepayment must be between 3 and 60 days")
    
    try:
        mpesa_code_validated = SubscriptionService.validate_mpesa_code(mpesa_code)
    except ValueError as e:
        raise HTTPException(422, str(e))
    
    try:
        result = SubscriptionService.process_prepayment(
            db=db,
            rider_id=rider_uuid,
            days=days,
            mpesa_code=mpesa_code_validated
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


# ============================================================================
# PAYMENT HISTORY
# ============================================================================

@router.get("/payments")
def get_payment_history(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db)
):
    """
    ✅ REQ-6.4: Get payment history (read-only)
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    query = db.query(Payment).filter(
        Payment.rider_id == rider_uuid
    ).order_by(Payment.submitted_at.desc())
    
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    
    return {
        "payments": [
            {
                "id": p.id,
                "amount": float(p.amount),
                "label": p.label,
                "mpesa_code": p.mpesa_code,
                "channel": p.channel,
                "submitted_at": p.submitted_at.isoformat(),
                "reconciliation": p.reconciliation,
                "verified_by": p.verified_by,
                "verified_at": p.verified_at.isoformat() if p.verified_at else None
            }
            for p in items
        ],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": max(1, (total + page_size - 1) // page_size)
        }
    }


# ============================================================================
# FREQUENCY & PRICING INFO
# ============================================================================

@router.get("/frequencies")
def get_subscription_frequencies(
    rider_id: str = Query(..., description="Rider ID"),
    db: Session = Depends(get_db)
):
    """
    Get all available frequencies with pricing
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    frequencies = {}
    for freq_key, freq_info in SubscriptionService.FREQUENCIES.items():
        plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.tier_name == freq_key,
            SubscriptionPlan.is_active == True
        ).first()
        
        if plan:
            calc = SubscriptionService.calculate_subscription_amount(
                freq_key,
                float(plan.daily_price)
            )
            frequencies[freq_key] = calc
    
    return {"frequencies": frequencies}


@router.get("/payment-details")
def get_payment_details():
    """
    Get payment configuration (Safaricom number, etc.)
    """
    return {
        "safaricom_number": "0757 334 481",
        "payment_method": "Send Money",
        "bank_name": "Safaricom",
        "instructions": "Use 'Send Money' to pay subscription",
        "support_number": "+254 700 000 000",
        "supported_frequencies": ["biweekly", "monthly"],
        "metadata": {
            "cached_at": datetime.now(timezone.utc).isoformat(),
            "cache_ttl_seconds": 86400
        }
    }


# ============================================================================
# NOTIFICATIONS & ALERTS
# ============================================================================

@router.get("/pending-price-change")
def get_pending_price_change(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """
    Check for pending price changes
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    sub = SubscriptionService.ensure_subscription_exists(db, rider_uuid)
    
    if not sub.plan_id:
        return {"pending_change": None}
    
    pending = db.query(PendingPriceChange).filter(
        PendingPriceChange.plan_id == sub.plan_id
    ).first()
    
    if not pending:
        return {"pending_change": None}
    
    now = datetime.now(timezone.utc)
    hours_until = int((pending.effective_at - now).total_seconds() / 3600)
    
    return {
        "pending_change": {
            "daily_price_new": float(pending.daily_price),
            "effective_at": pending.effective_at.isoformat(),
            "hours_until_effective": hours_until,
            "announced_at": pending.announced_at.isoformat()
        }
    }


@router.get("/trial-status")
def get_trial_status(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """
    Get trial status for trial users
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    sub = SubscriptionService.ensure_subscription_exists(db, rider_uuid)
    
    if sub.has_ever_paid:
        return {"is_trial_user": False}
    
    days_left = SubscriptionService.days_until_expiry(sub.expiry_at)
    
    return {
        "is_trial_user": True,
        "days_left": max(0, days_left),
        "expiry_at": sub.expiry_at.isoformat()
    }


# ============================================================================
# HEALTH CHECK
# ============================================================================

@router.get("/health")
def subscription_health_check(db: Session = Depends(get_db)):
    """Health check endpoint"""
    try:
        db.query(SubscriptionPlan).first()
        return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        return {"status": "error", "error": str(e)}, 500