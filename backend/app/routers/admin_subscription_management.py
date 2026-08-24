# backend/app/routers/admin_subscription_management.py
# ============================================================================
# ADMIN SUBSCRIPTION MANAGEMENT ROUTER
# ✅ Super Admin endpoints for pricing control, scheduling, and account management
# Requirements: REQ-3.1, EM-10, REQ-7.1, REQ-7.2, REQ-6.1
# ============================================================================

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from uuid import UUID
from decimal import Decimal
from typing import List, Optional

from app.database import get_db
from app.models.subscription_enhanced import (
    SubscriptionPlan,
    RiderSubscription,
    PricingChangeLog,
    PendingPriceChange,
    Payment,
    AccountLockHistory
)
from app.services.subscription_service import SubscriptionService

router = APIRouter(prefix="/admin/subscription", tags=["admin-subscription"])

# ============================================================================
# SUBSCRIPTION PLANS MANAGEMENT
# ============================================================================

@router.get("/plans")
def get_all_subscription_plans(db: Session = Depends(get_db)):
    """
    Get all subscription plans with their current and historical pricing
    """
    plans = db.query(SubscriptionPlan).all()

    return {
        "plans": [
            {
                "id": p.id,
                "name": p.name,
                "daily_price": float(p.daily_price),
                "tier_name": p.tier_name,
                "tier_label": p.tier_label,
                "tier_description": p.tier_description,
                "trial_days": p.trial_days,
                "version": p.version,
                "is_active": p.is_active,
                "last_modified_at": p.last_modified_at.isoformat() if p.last_modified_at else None,
                "modified_by_admin": p.modified_by_admin,
                "created_at": p.created_at.isoformat() if p.created_at else None
            }
            for p in plans
        ],
        "total_plans": len(plans)
    }


@router.get("/plans/{plan_id}")
def get_subscription_plan(plan_id: int, db: Session = Depends(get_db)):
    """
    Get specific plan details with full history
    """
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.id == plan_id
    ).first()

    if not plan:
        raise HTTPException(404, "Plan not found")

    # Get pricing history
    history = db.query(PricingChangeLog).filter(
        PricingChangeLog.plan_id == plan_id
    ).order_by(PricingChangeLog.created_at.desc()).all()

    return {
        "plan": {
            "id": plan.id,
            "name": plan.name,
            "daily_price": float(plan.daily_price),
            "tier_name": plan.tier_name,
            "tier_label": plan.tier_label,
            "tier_description": plan.tier_description,
            "trial_days": plan.trial_days,
            "version": plan.version,
            "is_active": plan.is_active,
            "created_at": plan.created_at.isoformat() if plan.created_at else None,
            "last_modified_at": plan.last_modified_at.isoformat() if plan.last_modified_at else None
        },
        "pricing_history": [
            {
                "version": h.version,
                "daily_price_old": float(h.daily_price_old) if h.daily_price_old else None,
                "daily_price_new": float(h.daily_price_new),
                "announced_at": h.announced_at.isoformat() if h.announced_at else None,
                "effective_at": h.effective_at.isoformat() if h.effective_at else None,
                "applied_at": h.applied_at.isoformat() if h.applied_at else None,
                "cancelled_at": h.cancelled_at.isoformat() if h.cancelled_at else None,
                "cancelled_by_admin": h.cancelled_by_admin,
                "created_by_admin": h.created_by_admin
            }
            for h in history
        ]
    }


# ============================================================================
# PRICE CHANGE SCHEDULING & MANAGEMENT
# ============================================================================

@router.post("/schedule-price-change")
def schedule_price_change(
    plan_id: int = Query(..., description="Plan ID to modify"),
    new_daily_price: Decimal = Query(..., description="New daily price"),
    hours_advance_notice: int = Query(24, description="Hours advance notice (min 24)"),
    admin_email: str = Query(..., description="Admin email for audit"),
    db: Session = Depends(get_db)
):
    """
    ✅ REQ-EM-10: Schedule a price change with advance notice
    Minimum 24 hours notice required
    """
    if hours_advance_notice < 24:
        raise HTTPException(
            422,
            "Minimum 24 hours advance notice required for rider protection"
        )

    try:
        result = SubscriptionService.schedule_price_change(
            db=db,
            plan_id=plan_id,
            new_daily_price=new_daily_price,
            admin_email=admin_email,
            hours_advance_notice=hours_advance_notice
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/price-changes/pending")
def get_pending_price_changes(db: Session = Depends(get_db)):
    """
    Get all pending price changes awaiting application
    """
    pendings = db.query(PendingPriceChange).all()

    now = datetime.now(timezone.utc)

    return {
        "pending_changes": [
            {
                "id": p.id,
                "plan_id": p.plan_id,
                "plan_name": p.plan.name,
                "daily_price_new": float(p.daily_price),
                "version": p.version,
                "announced_at": p.announced_at.isoformat(),
                "effective_at": p.effective_at.isoformat(),
                "hours_until_effective": int(
                    (p.effective_at - now).total_seconds() / 3600
                ),
                "will_auto_apply": True
            }
            for p in pendings
        ],
        "total_pending": len(pendings)
    }


@router.delete("/price-changes/{plan_id}")
def cancel_price_change(
    plan_id: int,
    admin_email: str = Query(..., description="Admin email for audit"),
    db: Session = Depends(get_db)
):
    """
    ✅ REQ-EM-10: Cancel a pending price change
    """
    try:
        result = SubscriptionService.cancel_pending_price_change(
            db=db,
            plan_id=plan_id,
            admin_email=admin_email
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/apply-pending-price-changes")
def apply_pending_price_changes(db: Session = Depends(get_db)):
    """
    ✅ REQ-EM-10: Apply pending price changes that have reached effective time
    Can be called by scheduled job or manually
    """
    applied = SubscriptionService.apply_pending_price_changes(db)

    return {
        "applied": applied,
        "total_applied": len(applied),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/price-changes/history")
def get_pricing_change_history(
    plan_id: Optional[int] = Query(None, description="Filter by plan ID"),
    days: int = Query(90, description="Days of history to show"),
    db: Session = Depends(get_db)
):
    """
    Get pricing change audit trail
    """
    query = db.query(PricingChangeLog)

    if plan_id:
        query = query.filter(PricingChangeLog.plan_id == plan_id)

    # Filter by date range
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    history = query.filter(
        PricingChangeLog.created_at >= cutoff_date
    ).order_by(PricingChangeLog.created_at.desc()).all()

    return {
        "history": [
            {
                "id": h.id,
                "plan_id": h.plan_id,
                "plan_name": h.plan.name,
                "version": h.version,
                "daily_price_old": float(h.daily_price_old) if h.daily_price_old else None,
                "daily_price_new": float(h.daily_price_new),
                "announced_at": h.announced_at.isoformat() if h.announced_at else None,
                "effective_at": h.effective_at.isoformat() if h.effective_at else None,
                "applied_at": h.applied_at.isoformat() if h.applied_at else None,
                "cancelled_at": h.cancelled_at.isoformat() if h.cancelled_at else None,
                "cancelled_by_admin": h.cancelled_by_admin,
                "created_by_admin": h.created_by_admin,
                "created_at": h.created_at.isoformat()
            }
            for h in history
        ],
        "total_changes": len(history),
        "period_days": days
    }


# ============================================================================
# ACCOUNT LOCK/UNLOCK MANAGEMENT
# ============================================================================

@router.post("/riders/{rider_id}/lock")
def lock_rider_account(
    rider_id: str,
    reason: str = Query(..., description="Reason for lock"),
    admin_email: str = Query(..., description="Admin email"),
    db: Session = Depends(get_db)
):
    """
    ✅ REQ-7.2: Manually lock a rider account with audit trail
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider ID format")

    try:
        result = SubscriptionService.lock_account_manual(
            db=db,
            rider_id=rider_uuid,
            reason=reason,
            admin_email=admin_email
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/riders/{rider_id}/unlock")
def unlock_rider_account(
    rider_id: str,
    admin_email: str = Query(..., description="Admin email"),
    db: Session = Depends(get_db)
):
    """
    ✅ REQ-7.2: Manually unlock a rider account with audit trail
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider ID format")

    try:
        result = SubscriptionService.unlock_account(
            db=db,
            rider_id=rider_uuid,
            admin_email=admin_email
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/lock-history/{rider_id}")
def get_lock_history(rider_id: str, db: Session = Depends(get_db)):
    """
    Get complete lock/unlock history for a rider
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider ID format")

    history = db.query(AccountLockHistory).filter(
        AccountLockHistory.rider_id == rider_uuid
    ).order_by(AccountLockHistory.triggered_at.desc()).all()

    return {
        "rider_id": str(rider_uuid),
        "lock_history": [
            {
                "id": h.id,
                "action": h.action,
                "reason": h.reason,
                "triggered_by": h.triggered_by,
                "triggered_at": h.triggered_at.isoformat(),
                "created_at": h.created_at.isoformat()
            }
            for h in history
        ],
        "total_events": len(history)
    }


# ============================================================================
# PAYMENT MANAGEMENT & VERIFICATION
# ============================================================================

@router.get("/payments/pending-review")
def get_pending_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    ✅ REQ-6.1: Get payments pending verification
    """
    query = db.query(Payment).filter(
        Payment.reconciliation == "Pending"
    ).order_by(Payment.submitted_at.desc())

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "payments": [
            {
                "id": p.id,
                "rider_id": str(p.rider_id),
                "amount": float(p.amount),
                "label": p.label,
                "mpesa_code": p.mpesa_code,
                "channel": p.channel,
                "submitted_at": p.submitted_at.isoformat(),
                "reconciliation": p.reconciliation,
                "notes": p.notes
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


@router.post("/payments/{payment_id}/verify")
def verify_payment(
    payment_id: int,
    admin_email: str = Query(..., description="Admin email"),
    notes: str = Query("", description="Verification notes"),
    db: Session = Depends(get_db)
):
    """
    ✅ REQ-6.1: Verify payment after checking M-Pesa records
    """
    payment = db.query(Payment).filter(
        Payment.id == payment_id
    ).first()

    if not payment:
        raise HTTPException(404, "Payment not found")

    try:
        result = SubscriptionService.verify_payment(
            db=db,
            payment_id=payment_id,
            admin_email=admin_email
        )

        # Add notes if provided
        if notes:
            payment.notes = notes
            db.commit()

        result["notes"] = notes
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/payments/history")
def get_payment_history(
    rider_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    days: int = Query(90),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Get payment history with filtering
    """
    query = db.query(Payment)

    if rider_id:
        try:
            rider_uuid = UUID(rider_id)
            query = query.filter(Payment.rider_id == rider_uuid)
        except ValueError:
            raise HTTPException(400, "Invalid rider ID format")

    if status:
        query = query.filter(Payment.reconciliation == status)

    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    query = query.filter(Payment.submitted_at >= cutoff_date)

    total = query.count()
    items = query.order_by(Payment.submitted_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    return {
        "payments": [
            {
                "id": p.id,
                "rider_id": str(p.rider_id),
                "amount": float(p.amount),
                "label": p.label,
                "mpesa_code": p.mpesa_code,
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
# SUBSCRIPTION ANALYTICS & REPORTING
# ============================================================================

@router.get("/analytics/overview")
def get_subscription_analytics(db: Session = Depends(get_db)):
    """
    Get subscription system overview and metrics
    """
    now = datetime.now(timezone.utc)

    # Count subscriptions by status
    total_riders = db.query(RiderSubscription).count()
    active_subscriptions = db.query(RiderSubscription).filter(
        ~RiderSubscription.locked,
        RiderSubscription.expiry_at > now
    ).count()
    locked_accounts = db.query(RiderSubscription).filter(
        RiderSubscription.locked
    ).count()
    trial_users = db.query(RiderSubscription).filter(
        RiderSubscription.has_ever_paid == False,
        RiderSubscription.expiry_at > now
    ).count()
    paid_users = db.query(RiderSubscription).filter(
        RiderSubscription.has_ever_paid == True,
        RiderSubscription.expiry_at > now
    ).count()

    # Payment metrics
    total_payments = db.query(Payment).count()
    verified_payments = db.query(Payment).filter(
        Payment.reconciliation == "Verified"
    ).count()
    pending_payments = db.query(Payment).filter(
        Payment.reconciliation == "Pending"
    ).count()

    # Revenue metrics
    total_revenue_result = db.query(
        func.sum(Payment.amount)
    ).filter(
        Payment.reconciliation == "Verified"
    ).scalar()
    total_revenue = float(total_revenue_result) if total_revenue_result else 0

    return {
        "subscriptions": {
            "total_riders": total_riders,
            "active_subscriptions": active_subscriptions,
            "locked_accounts": locked_accounts,
            "trial_users": trial_users,
            "paid_users": paid_users,
            "expiring_soon_2days": db.query(RiderSubscription).filter(
                RiderSubscription.expiry_at.between(
                    now,
                    now + timedelta(days=2)
                ),
                ~RiderSubscription.locked
            ).count()
        },
        "payments": {
            "total_payments": total_payments,
            "verified_payments": verified_payments,
            "pending_payments": pending_payments,
            "pending_verification_rate": f"{(pending_payments / total_payments * 100):.1f}%" if total_payments > 0 else "0%"
        },
        "revenue": {
            "total_verified": total_revenue,
            "currency": "KES",
            "average_per_payment": f"{(total_revenue / verified_payments):.2f}" if verified_payments > 0 else "0"
        },
        "timestamp": now.isoformat()
    }


@router.get("/riders/status")
def get_riders_subscription_status(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """
    Get all riders' subscription status with filtering
    """
    query = db.query(RiderSubscription)

    if status == "active":
        now = datetime.now(timezone.utc)
        query = query.filter(
            ~RiderSubscription.locked,
            RiderSubscription.expiry_at > now
        )
    elif status == "locked":
        query = query.filter(RiderSubscription.locked == True)
    elif status == "trial":
        query = query.filter(RiderSubscription.has_ever_paid == False)
    elif status == "paid":
        query = query.filter(RiderSubscription.has_ever_paid == True)

    total = query.count()
    items = query.order_by(RiderSubscription.expiry_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    return {
        "riders": [
            {
                "rider_id": str(r.rider_id),
                "status": "locked" if r.locked else ("paid" if r.has_ever_paid else "trial"),
                "has_ever_paid": r.has_ever_paid,
                "locked": r.locked,
                "lock_reason": r.lock_reason,
                "frequency": r.frequency,
                "expiry_at": r.expiry_at.isoformat(),
                "last_payment_at": r.last_payment_at.isoformat() if r.last_payment_at else None,
                "last_payment_amount": float(r.last_payment_amount) if r.last_payment_amount else None,
                "total_paid_lifetime": float(r.total_paid_lifetime) if r.total_paid_lifetime else 0
            }
            for r in items
        ],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": max(1, (total + page_size - 1) // page_size)
        }
    }


# Import for analytics
from sqlalchemy import func