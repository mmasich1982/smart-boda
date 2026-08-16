# backend/app/routers/admin_subscription_management.py
# EM-10: Super Admin Subscription Management
# Endpoints for pricing configuration, price change scheduling, payment reconciliation,
# account lock/unlock, and subscription analytics

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID
from typing import Optional
import json

from app.database import get_db
from app.models.subscription_enhanced import (
    SubscriptionPlan,
    RiderSubscription,
    PricingChangeLog,
    PendingPriceChange,
    AccountLockHistory
)
from app.models.payment import Payment
from app.models.rider import Rider
from app.services.subscription_service import SubscriptionService

router = APIRouter(prefix="/admin/subscription", tags=["em-10-admin"])


# ============================================================================
# SUBSCRIPTION PLANS - Configuration & Management
# ============================================================================

@router.get("/plans")
def get_all_plans(db: Session = Depends(get_db)):
    """
    Get all subscription plan configurations (active and inactive).
    Super Admin uses this to view current pricing structure.
    """
    plans = db.query(SubscriptionPlan).all()
    return {
        "plans": [
            {
                "id": p.id,
                "name": p.name,
                "tier_name": p.tier_name,
                "tier_label": p.tier_label,
                "daily_price": float(p.daily_price),
                "trial_days": p.trial_days,
                "is_active": p.is_active,
                "version": p.version,
                "last_modified_at": p.last_modified_at,
                "modified_by_admin": p.modified_by_admin
            }
            for p in plans
        ]
    }


@router.get("/plans/{plan_id}")
def get_plan_details(plan_id: int, db: Session = Depends(get_db)):
    """Get detailed information for a specific plan"""
    plan = db.query(SubscriptionPlan).get(plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    
    return {
        "id": plan.id,
        "name": plan.name,
        "tier_name": plan.tier_name,
        "tier_label": plan.tier_label,
        "tier_description": plan.tier_description,
        "daily_price": float(plan.daily_price),
        "trial_days": plan.trial_days,
        "is_active": plan.is_active,
        "version": plan.version,
        "created_at": plan.created_at,
        "last_modified_at": plan.last_modified_at,
        "modified_by_admin": plan.modified_by_admin
    }


@router.put("/plans/{plan_id}")
def update_plan(
    plan_id: int,
    daily_price: Optional[float] = Query(None),
    trial_days: Optional[int] = Query(None),
    tier_label: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    admin_email: str = Query(..., description="Admin email for audit"),
    db: Session = Depends(get_db)
):
    """
    Update plan configuration (name, trial days, active status).
    ⚠️ NOTE: Use /schedule-price-change for daily_price changes to ensure rider notification.
    
    Direct price changes here do NOT notify riders and should only be used
    for administrative corrections, not commercial price updates.
    """
    plan = db.query(SubscriptionPlan).get(plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    
    if daily_price is not None:
        plan.daily_price = Decimal(str(daily_price))
    if trial_days is not None:
        plan.trial_days = trial_days
    if tier_label is not None:
        plan.tier_label = tier_label
    if is_active is not None:
        plan.is_active = is_active
    
    plan.version += 1
    plan.last_modified_at = datetime.now(timezone.utc)
    plan.modified_by_admin = admin_email
    
    db.commit()
    
    return {
        "status": "Plan updated",
        "plan_id": plan.id,
        "new_version": plan.version,
        "message": "⚠️ Note: If you changed daily_price, use /schedule-price-change for rider notifications"
    }


# ============================================================================
# PRICING CHANGES - Scheduled Price Updates with Rider Notification
# ============================================================================

@router.post("/schedule-price-change")
def schedule_price_change(
    plan_id: int = Query(...),
    new_daily_price: float = Query(..., ge=0),
    notice_hours: int = Query(48, ge=24, le=336, description="Hours of advance notice (24-336)"),
    admin_email: str = Query(...),
    reason: Optional[str] = Query(None, description="Reason for price change"),
    db: Session = Depends(get_db)
):
    """
    Schedule a price change with advance notice to riders.
    
    Flow:
    1. Change is recorded as PENDING (not yet applied)
    2. Riders see "Price change coming on [date]" banner on subscription screens
    3. On effective_at, change is auto-applied and plan.daily_price updates
    4. All changes are audit-logged
    
    Minimum notice: 24 hours (ensures riders have time to decide)
    
    Example:
    - POST /admin/subscription/schedule-price-change
    - new_daily_price=40
    - notice_hours=48
    - Result: Price changes in 48 hours, riders notified immediately
    """
    plan = db.query(SubscriptionPlan).get(plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    
    try:
        result = SubscriptionService.schedule_price_change(
            db=db,
            plan_id=plan_id,
            new_daily_price=Decimal(str(new_daily_price)),
            notice_hours=notice_hours,
            admin_email=admin_email
        )
        
        # Add reason to result
        result["reason"] = reason
        
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/price-changes/pending")
def get_pending_price_changes(db: Session = Depends(get_db)):
    """
    Get all pending price changes (scheduled but not yet applied).
    Super Admin uses this to monitor upcoming changes.
    """
    pending = db.query(PendingPriceChange).all()
    
    return {
        "pending_changes": [
            {
                "id": p.id,
                "plan_id": p.plan_id,
                "plan_name": db.query(SubscriptionPlan).get(p.plan_id).tier_label,
                "daily_price_new": float(p.daily_price),
                "announced_at": p.announced_at,
                "effective_at": p.effective_at,
                "hours_until_effective": p.hours_until_effective,
                "version": p.version
            }
            for p in pending
        ]
    }


@router.delete("/price-changes/{change_id}")
def cancel_price_change(
    change_id: int,
    admin_email: str = Query(...),
    reason: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Cancel a pending price change before it takes effect.
    Riders will no longer see the price change banner.
    """
    pending = db.query(PendingPriceChange).get(change_id)
    if not pending:
        raise HTTPException(404, "Price change not found")
    
    try:
        return SubscriptionService.cancel_pending_price_change(
            db=db,
            plan_id=pending.plan_id,
            admin_email=admin_email,
            reason=reason
        )
    except Exception as e:
        raise HTTPException(400, str(e))


@router.post("/apply-pending-changes")
def apply_pending_changes_now(
    admin_email: str = Query(...),
    db: Session = Depends(get_db)
):
    """
    Manually apply all pending price changes that are ready.
    Normally runs automatically, but can be triggered manually.
    """
    applied = SubscriptionService.apply_pending_price_changes(db)
    
    return {
        "status": f"Applied {len(applied)} pending price changes",
        "applied": applied,
        "triggered_by": admin_email
    }


@router.get("/price-changes/history")
def get_price_change_history(
    plan_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    skip: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Get audit trail of all applied price changes.
    Provides transparency: when prices changed, who changed them, why.
    """
    query = db.query(PricingChangeLog).filter(
        PricingChangeLog.cancelled_at == None  # Only show applied changes
    )
    
    if plan_id is not None:
        query = query.filter(PricingChangeLog.plan_id == plan_id)
    
    total = query.count()
    history = query.order_by(desc(PricingChangeLog.applied_at)).offset(skip).limit(limit).all()
    
    return {
        "history": [
            {
                "id": h.id,
                "plan_id": h.plan_id,
                "version": h.version,
                "daily_price_old": float(h.daily_price_old),
                "daily_price_new": float(h.daily_price_new),
                "announced_at": h.announced_at,
                "effective_at": h.effective_at,
                "applied_at": h.applied_at,
                "created_by_admin": h.created_by_admin
            }
            for h in history
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }


# ============================================================================
# ACCOUNT LOCK / UNLOCK Management
# ============================================================================

@router.post("/riders/{rider_id}/unlock")
def unlock_rider_account(
    rider_id: str,
    admin_email: str = Query(...),
    note: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Manually unlock a rider's account (override automatic lock).
    Used when rider has paid but account is still locked (reconciliation delay).
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    try:
        return SubscriptionService.admin_unlock_account(
            db=db,
            rider_id=rider_uuid,
            admin_email=admin_email,
            note=note
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/riders/{rider_id}/lock")
def lock_rider_account(
    rider_id: str,
    admin_email: str = Query(...),
    reason: str = Query(..., description="Reason for manual lock"),
    db: Session = Depends(get_db)
):
    """
    Manually lock a rider's account (override default behavior).
    Use sparingly - this is a severe action.
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    try:
        return SubscriptionService.admin_lock_account(
            db=db,
            rider_id=rider_uuid,
            admin_email=admin_email,
            reason=reason
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/riders/{rider_id}/lock-history")
def get_rider_lock_history(
    rider_id: str,
    db: Session = Depends(get_db)
):
    """Get audit trail of all lock/unlock events for a rider"""
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    history = db.query(AccountLockHistory).filter(
        AccountLockHistory.rider_id == rider_uuid
    ).order_by(desc(AccountLockHistory.triggered_at)).all()
    
    return {
        "rider_id": str(rider_uuid),
        "history": [
            {
                "id": h.id,
                "action": h.action,
                "reason": h.reason,
                "triggered_by": h.triggered_by,
                "triggered_at": h.triggered_at,
                "admin_email": h.admin_email,
                "admin_note": h.admin_note
            }
            for h in history
        ]
    }


# ============================================================================
# PAYMENT VERIFICATION & RECONCILIATION
# ============================================================================

@router.get("/payments/pending-review")
def get_pending_payments(
    limit: int = Query(50, ge=1, le=500),
    skip: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Get all payments awaiting Super Admin verification.
    Admin compares M-Pesa code against operator messages and marks as Verified.
    """
    query = db.query(Payment).filter(
        Payment.reconciliation == "Pending Super Admin Review"
    ).order_by(desc(Payment.submitted_at))
    
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    
    return {
        "payments": [
            {
                "id": str(p.id),
                "rider_id": str(p.rider_id),
                "amount": float(p.amount),
                "label": p.label,
                "mpesa_code": p.mpesa_code,
                "submitted_at": p.submitted_at,
                "status": p.status
            }
            for p in items
        ],
        "total_pending": total,
        "skip": skip,
        "limit": limit
    }


@router.post("/payments/{payment_id}/verify")
def verify_payment(
    payment_id: str,
    verified: bool = Query(True, description="True=Verified, False=Rejected"),
    admin_email: str = Query(...),
    note: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Mark a payment as Verified or Rejected after manual M-Pesa reconciliation.
    Verified payments update the subscription record immediately.
    """
    try:
        p_uuid = UUID(payment_id)
    except ValueError:
        raise HTTPException(400, "Invalid payment_id format")
    
    payment = db.query(Payment).get(p_uuid)
    if not payment:
        raise HTTPException(404, "Payment not found")
    
    if verified:
        payment.reconciliation = "Verified"
    else:
        payment.reconciliation = "Rejected"
    
    payment.reconciled_at = datetime.now(timezone.utc)
    payment.reconciled_by_admin = admin_email
    
    db.commit()
    
    return {
        "payment_id": str(payment.id),
        "status": payment.reconciliation,
        "verified_by": admin_email,
        "note": note
    }


# ============================================================================
# REPORTING & ANALYTICS
# ============================================================================

@router.get("/statistics")
def get_subscription_statistics(db: Session = Depends(get_db)):
    """Get overall subscription metrics for admin dashboard"""
    stats = SubscriptionService.get_subscription_statistics(db)
    return stats


@router.get("/riders/subscription-status")
def get_all_riders_subscription_status(
    status_filter: Optional[str] = Query(None, description="free_trial, paid, or expired"),
    limit: int = Query(100, ge=1, le=1000),
    skip: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Get subscription status for all riders (paginated).
    Useful for admin dashboard and reporting.
    """
    query = db.query(RiderSubscription, Rider).join(
        Rider, RiderSubscription.rider_id == Rider.id
    )
    
    # Apply status filter
    now = datetime.now(timezone.utc)
    if status_filter == "expired":
        query = query.filter(RiderSubscription.locked == True)
    elif status_filter == "free_trial":
        query = query.filter(
            and_(
                RiderSubscription.has_ever_paid == False,
                RiderSubscription.locked == False
            )
        )
    elif status_filter == "paid":
        query = query.filter(
            and_(
                RiderSubscription.has_ever_paid == True,
                RiderSubscription.locked == False
            )
        )
    
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    
    result_items = []
    for sub, rider in items:
        if sub.locked:
            status = "expired"
        elif sub.has_ever_paid:
            status = "paid"
        else:
            status = "free_trial"
        
        result_items.append({
            "rider_id": str(sub.rider_id),
            "full_name": rider.full_name if rider else "Unknown",
            "mobile_number": rider.mobile_number if rider else "Unknown",
            "status": status,
            "expiry_at": sub.expiry_at,
            "days_left": SubscriptionService.days_until_expiry(sub.expiry_at) if not sub.locked else 0,
            "locked": sub.locked,
            "lock_reason": sub.lock_reason
        })
    
    return {
        "items": result_items,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/riders/{rider_id}/detailed-status")
def get_rider_detailed_subscription(
    rider_id: str,
    db: Session = Depends(get_db)
):
    """Get complete subscription details for a single rider"""
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    try:
        return SubscriptionService.get_subscription_status(db, rider_uuid)
    except ValueError as e:
        raise HTTPException(404, str(e))