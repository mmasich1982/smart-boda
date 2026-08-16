# backend/app/routers/sb24_subscription_enhanced.py
# Enhanced Subscription Router for Riders
# Extends sb24_subscription.py with improved error handling, validation,
# and integration with SubscriptionService

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timezone
from uuid import UUID
from decimal import Decimal
from typing import Optional

from app.database import get_db
from app.models.subscription_enhanced import (
    RiderSubscription,
    SubscriptionPlan,
    PendingPriceChange,
    SubscriptionTrial
)
from app.models.payment import Payment
from app.services.subscription_service import SubscriptionService

router = APIRouter(prefix="/subscription", tags=["sb-24"])


# ============================================================================
# GET: SUBSCRIPTION STATUS & PRICING
# ============================================================================

@router.get("")
def get_subscription(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """
    Get rider's complete subscription status and pricing info.
    
    Returns:
    - Current plan name and daily rate
    - Subscription frequency (biweekly/monthly)
    - Trial or paid status
    - Days remaining (or lock reason)
    - Pending price change (if any)
    - All available frequencies with prices
    
    Called by app on: Home screen, Subscription screen, Payment flow
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format. Must be a valid UUID.")
    
    try:
        status = SubscriptionService.get_subscription_status(db, rider_uuid)
        
        # Add frequency metadata
        frequencies = {}
        plan = db.query(SubscriptionPlan).get(status["plan_id"])
        for freq_key, freq_info in SubscriptionService.FREQUENCIES.items():
            if plan:
                calc = SubscriptionService.calculate_subscription_amount(
                    freq_key,
                    plan.daily_price
                )
                frequencies[freq_key] = calc
        
        status["available_frequencies"] = frequencies
        
        return status
    
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/status")
def get_subscription_status_simple(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """
    Simplified status endpoint - just the essentials for quick checks.
    Returns: locked status, days left, expiry date.
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    sub = db.query(RiderSubscription).filter(
        RiderSubscription.rider_id == rider_uuid
    ).first()
    
    if not sub:
        raise HTTPException(404, "Subscription not found")
    
    # Check for expiry and auto-lock
    SubscriptionService.check_and_lock_if_expired(db, sub)
    
    return {
        "locked": sub.locked,
        "lock_reason": sub.lock_reason,
        "expiry_at": sub.expiry_at,
        "days_left": SubscriptionService.days_until_expiry(sub.expiry_at),
        "has_ever_paid": sub.has_ever_paid
    }


# ============================================================================
# POST: PAYMENT PROCESSING
# ============================================================================

@router.post("/pay")
def submit_payment(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    frequency_key: str = Query(..., description="biweekly or monthly"),
    mpesa_code: str = Query(..., description="M-Pesa confirmation code"),
    db: Session = Depends(get_db)
):
    """
    Submit subscription payment via M-Pesa code.
    
    Flow:
    1. Validate frequency and M-Pesa code format
    2. Calculate subscription amount
    3. Extend subscription expiry
    4. Record payment as "Pending Super Admin Review"
    5. Unlock account if locked
    6. Return confirmation details
    
    Note: Payment is recorded immediately with pending status.
    Super Admin must verify against M-Pesa messages within reconciliation period.
    
    Expected M-Pesa codes:
    - Biweekly (KES 500): ~8-10 characters
    - Monthly (KES 1000): ~8-10 characters
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    # Validate inputs
    if frequency_key not in SubscriptionService.FREQUENCIES:
        freqs = ", ".join(SubscriptionService.FREQUENCIES.keys())
        raise HTTPException(422, f"Invalid frequency. Choose from: {freqs}")
    
    code = (mpesa_code or "").strip().upper()
    if not code:
        raise HTTPException(422, "M-Pesa confirmation code is required.")
    if len(code) < 8:
        raise HTTPException(422, "That code looks too short — please check the M-Pesa message and re-enter it.")
    
    try:
        result = SubscriptionService.process_subscription_payment(
            db=db,
            rider_id=rider_uuid,
            frequency=frequency_key,
            mpesa_code=code
        )
        return result
    
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Payment processing error: {str(e)}")


@router.post("/prepay")
def submit_prepayment(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    days: int = Query(..., ge=3, le=60, description="Number of days to prepay (3-60)"),
    mpesa_code: str = Query(..., description="M-Pesa confirmation code"),
    db: Session = Depends(get_db)
):
    """
    Submit prepayment for custom number of days.
    Allows riders flexibility to prepay 3-60 days at daily rate.
    
    Example:
    - 7 days @ KES 35/day = KES 245
    - 30 days @ KES 33.33/day = KES 1000
    - 60 days = KES 2000 (max)
    
    Same verification flow as /pay endpoint.
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
        raise HTTPException(422, "Enter a valid M-Pesa confirmation code (min 8 characters).")
    
    try:
        result = SubscriptionService.process_prepayment(
            db=db,
            rider_id=rider_uuid,
            days=days,
            mpesa_code=code
        )
        return result
    
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Prepayment processing error: {str(e)}")


# ============================================================================
# GET: PAYMENT HISTORY & RECEIPTS
# ============================================================================

@router.get("/payments")
def get_payment_history(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db)
):
    """
    Get rider's payment history (read-only).
    Never editable by rider — pure ledger of all payments made.
    
    Includes:
    - Amount and date
    - Subscription plan/label
    - M-Pesa code used
    - Reconciliation status (Pending or Verified)
    
    Super Admin marks payments as Verified after checking M-Pesa messages.
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    query = db.query(Payment).filter(
        Payment.rider_id == rider_uuid
    ).order_by(desc(Payment.submitted_at))
    
    total = query.count()
    items = query.offset((page-1)*page_size).limit(page_size).all()
    
    return {
        "payments": [
            {
                "id": str(p.id),
                "amount": float(p.amount),
                "label": p.label,
                "mpesa_code": p.mpesa_code,
                "submitted_at": p.submitted_at,
                "reconciliation": p.reconciliation,
                "reconciled_at": p.reconciled_at
            }
            for p in items
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max(1, (total + page_size - 1) // page_size)
    }


# ============================================================================
# GET: PRICE CHANGE NOTIFICATIONS
# ============================================================================

@router.get("/pending-price-change")
def get_pending_price_change(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """
    Check if there's a pending price change riders should know about.
    Displayed as banner on Subscription, Choose Frequency, Confirm screens.
    
    Example banner:
    "📢 Price update coming: the daily rate is changing to KSh 40/day
     on 2025-01-15 (in about 48h). Your current price is unaffected until then."
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    sub = db.query(RiderSubscription).filter(
        RiderSubscription.rider_id == rider_uuid
    ).first()
    
    if not sub:
        raise HTTPException(404, "Subscription not found")
    
    pending = db.query(PendingPriceChange).filter(
        PendingPriceChange.plan_id == sub.plan_id
    ).first()
    
    if not pending:
        return {"pending_change": None}
    
    return {
        "pending_change": {
            "daily_price_new": float(pending.daily_price),
            "effective_at": pending.effective_at,
            "hours_until_effective": pending.hours_until_effective,
            "announced_at": pending.announced_at,
            "banner_message": (
                f"📢 Price update coming: the daily rate is changing to "
                f"KSh {pending.daily_price:.0f}/day on "
                f"{pending.effective_at.strftime('%Y-%m-%d at %H:%M')} "
                f"(in about {int(pending.hours_until_effective)}h). "
                f"Your current price is unaffected until then."
            )
        }
    }


# ============================================================================
# NOTIFICATIONS & TRIAL STATUS
# ============================================================================

@router.get("/trial-status")
def get_trial_status(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """
    Get trial period information (for trial users only).
    Returns: trial status, days remaining, conversion option.
    
    Used by app to show:
    - Trial countdown
    - "Last day of trial" banner
    - Nudge to subscribe
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    trial = db.query(SubscriptionTrial).filter(
        SubscriptionTrial.rider_id == rider_uuid,
        SubscriptionTrial.converted_to_paid == False
    ).first()
    
    if not trial:
        return {"is_trial_user": False}
    
    days_left = SubscriptionService.days_until_expiry(trial.started_at + (
        # This is approximate; for exact expiry, query RiderSubscription
        datetime.now(timezone.utc) - trial.started_at
    ))
    
    return {
        "is_trial_user": True,
        "trial_started_at": trial.started_at,
        "days_left": max(0, days_left),
        "notification_sent": trial.notification_sent_at is not None,
        "message": (
            "🎉 Today is the last day of your free trial! Subscribe now for as little as "
            "KSh 33/day to keep every tool running — we'd love to keep you with us 💛"
            if days_left <= 1 else None
        )
    }


# ============================================================================
# FREQUENCY INFO (for UI)
# ============================================================================

@router.get("/frequencies")
def get_all_frequencies(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """
    Get all available subscription frequencies with current pricing.
    Used by app to display plan options.
    
    Returns prices for:
    - Biweekly (14 days)
    - Monthly (30 days)
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    # Get active plan
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.is_active == True
    ).first()
    
    if not plan:
        raise HTTPException(500, "No active subscription plan configured")
    
    frequencies = {}
    for freq_key, freq_info in SubscriptionService.FREQUENCIES.items():
        calc = SubscriptionService.calculate_subscription_amount(
            freq_key,
            plan.daily_price
        )
        frequencies[freq_key] = calc
    
    return {"frequencies": frequencies}


# ============================================================================
# HEALTH CHECK
# ============================================================================

@router.get("/health")
def subscription_health_check(db: Session = Depends(get_db)):
    """Health check endpoint for load balancers and monitoring"""
    try:
        # Quick DB check
        db.query(SubscriptionPlan).first()
        return {"status": "healthy", "timestamp": datetime.now(timezone.utc)}
    except Exception as e:
        return {"status": "error", "error": str(e)}, 500