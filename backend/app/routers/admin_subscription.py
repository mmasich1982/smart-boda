# backend/app/routers/admin_subscription.py
# ============================================================================
# ADMIN SUBSCRIPTION MANAGEMENT ENDPOINTS
# Requirements Coverage: REQ-3.4, REQ-5.1, REQ-5.2, REQ-5.3
# ============================================================================

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from uuid import UUID
from app.database import get_db
from app.models.subscription import RiderSubscription
from app.models.payment import Payment
from app.models.rider import Rider
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/subscription", tags=["admin-subscription"])

# ============================================================================
# PAYMENT VERIFICATION ENDPOINTS
# ============================================================================

@router.get("/pending-payments")
def list_pending_payments(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    status: str = Query("pending", description="Filter by status: pending/verified/rejected"),
    db: Session = Depends(get_db)
):
    """
    ✅ REQ-5.1: List pending payment verifications.
    
    Returns list of payments awaiting Super Admin review with rider details.
    Allows admin to verify M-Pesa codes against actual transactions.
    
    Response includes:
    - Rider name and phone
    - M-Pesa code submitted
    - Amount claimed
    - Plan selected
    - Current reconciliation status
    """
    # Map status parameter to reconciliation values
    status_filter_map = {
        "pending": "Pending Super Admin Review",
        "verified": "Verified",
        "rejected": "Rejected"
    }
    
    filter_status = status_filter_map.get(status, "Pending Super Admin Review")
    
    # Query pending payments with rider details
    query = db.query(Payment).filter(
        Payment.reconciliation == filter_status
    ).order_by(Payment.submitted_at.desc())
    
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    
    # Enrich with rider details
    payments_with_riders = []
    for payment in items:
        rider = db.query(Rider).filter(Rider.id == payment.rider_id).first()
        sub = db.query(RiderSubscription).filter(
            RiderSubscription.rider_id == payment.rider_id
        ).first()
        
        payments_with_riders.append({
            "payment_id": str(payment.id),
            "rider_id": str(payment.rider_id),
            "rider_name": rider.name if rider else "Unknown",
            "rider_phone": rider.mobile if rider else "Unknown",
            "amount": float(payment.amount),
            "label": payment.label,
            "mpesa_code": payment.mpesa_code,
            "submitted_at": payment.submitted_at,
            "reconciliation": payment.reconciliation,
            "verified_by": payment.verified_by,
            "verified_at": payment.verified_at,
            "rider_locked": sub.locked if sub else False,
            "rider_has_ever_paid": sub.has_ever_paid if sub else False
        })
    
    return {
        "payments": payments_with_riders,
        "page": page,
        "total_pages": max(1, -(-total // page_size)),
        "total": total,
        "filter_status": filter_status
    }

@router.post("/verify-payment")
def verify_payment(
    payment_id: str = Query(..., description="Payment UUID"),
    verification_status: str = Query(..., description="Status: 'verified' or 'rejected'"),
    verified_by: str = Query(..., description="Admin email/ID"),
    note: str = Query("", description="Optional verification note"),
    db: Session = Depends(get_db)
):
    """
    ✅ REQ-5.2: Confirm payment as verified.
    
    Admin has verified the M-Pesa code matches actual transaction.
    Updates payment status and records admin verification.
    """
    if verification_status not in ["verified", "rejected"]:
        raise HTTPException(422, "verification_status must be 'verified' or 'rejected'")
    
    try:
        payment_uuid = UUID(payment_id)
    except ValueError:
        raise HTTPException(400, "Invalid payment_id format")
    
    # Find payment
    payment = db.query(Payment).filter(Payment.id == payment_uuid).first()
    if not payment:
        raise HTTPException(404, "Payment not found")
    
    # Update payment status
    if verification_status == "verified":
        payment.reconciliation = "Verified"
    else:
        payment.reconciliation = "Rejected"
    
    payment.verified_by = verified_by
    payment.verified_at = datetime.now(timezone.utc)
    
    # Log the verification
    logger.info(
        f"Payment {payment_id} verified as '{verification_status}' by {verified_by}. "
        f"Note: {note}"
    )
    
    db.commit()
    
    return {
        "payment_id": str(payment.id),
        "reconciliation": payment.reconciliation,
        "verified_by": payment.verified_by,
        "verified_at": payment.verified_at,
        "status": "Payment verification recorded"
    }

@router.post("/lock-account")
def lock_account_for_fraud(
    rider_id: str = Query(..., description="Rider UUID"),
    lock_reason: str = Query(..., description="Reason for locking"),
    reason_detail: str = Query("", description="Detailed explanation"),
    locked_by: str = Query(..., description="Admin email/ID"),
    db: Session = Depends(get_db)
):
    """
    ✅ REQ-3.4, REQ-5.3: Lock account for fraudulent payment.
    
    When admin detects fraud (M-Pesa code doesn't exist in transactions),
    this endpoint re-locks the rider's account immediately.
    
    Rider will see "Account Locked" modal on next app access
    and must make real payment to unlock.
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    # Find subscription
    sub = db.query(RiderSubscription).filter(
        RiderSubscription.rider_id == rider_uuid
    ).first()
    
    if not sub:
        raise HTTPException(404, "Subscription not found for rider")
    
    # Lock the account
    sub.locked = True
    sub.lock_reason = lock_reason
    sub.locked_at = datetime.now(timezone.utc)
    
    # Log the action
    logger.warning(
        f"Account locked for rider {rider_id} by admin {locked_by}. "
        f"Reason: {lock_reason}. Detail: {reason_detail}"
    )
    
    db.commit()
    
    return {
        "rider_id": str(rider_uuid),
        "locked": sub.locked,
        "lock_reason": sub.lock_reason,
        "locked_at": sub.locked_at,
        "locked_by": locked_by,
        "status": "Account has been locked. Rider must resubmit valid payment."
    }

@router.post("/unlock-account")
def unlock_account_manual(
    rider_id: str = Query(..., description="Rider UUID"),
    unlock_reason: str = Query(..., description="Reason for unlocking"),
    unlocked_by: str = Query(..., description="Admin email/ID"),
    db: Session = Depends(get_db)
):
    """
    ✅ BONUS: Manual account unlock by admin (for edge cases).
    
    Allows admin to manually unlock account without payment
    (e.g., system error correction, manual verification).
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    # Find subscription
    sub = db.query(RiderSubscription).filter(
        RiderSubscription.rider_id == rider_uuid
    ).first()
    
    if not sub:
        raise HTTPException(404, "Subscription not found for rider")
    
    # Unlock the account
    was_locked = sub.locked
    sub.locked = False
    sub.lock_reason = None
    
    # Log the action
    logger.info(
        f"Account unlocked for rider {rider_id} by admin {unlocked_by}. "
        f"Reason: {unlock_reason}"
    )
    
    db.commit()
    
    return {
        "rider_id": str(rider_uuid),
        "was_locked": was_locked,
        "currently_locked": sub.locked,
        "unlocked_by": unlocked_by,
        "status": "Account has been unlocked manually"
    }

# ============================================================================
# ADMIN DASHBOARD ENDPOINTS
# ============================================================================

@router.get("/payment-history")
def get_payment_history(
    rider_id: str = Query(..., description="Filter by rider UUID"),
    status: str = Query("all", description="Filter by reconciliation status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db)
):
    """
    ✅ BONUS: Get full payment audit trail for a rider.
    Admin can see all payments (pending, verified, rejected) for a single rider.
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    query = db.query(Payment).filter(Payment.rider_id == rider_uuid)
    
    # Apply status filter
    if status != "all":
        status_map = {
            "pending": "Pending Super Admin Review",
            "verified": "Verified",
            "rejected": "Rejected"
        }
        filter_status = status_map.get(status)
        if filter_status:
            query = query.filter(Payment.reconciliation == filter_status)
    
    # Order by submitted date
    query = query.order_by(Payment.submitted_at.desc())
    
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    
    return {
        "payments": [
            {
                "payment_id": str(p.id),
                "amount": float(p.amount),
                "label": p.label,
                "mpesa_code": p.mpesa_code,
                "submitted_at": p.submitted_at,
                "reconciliation": p.reconciliation,
                "verified_by": p.verified_by,
                "verified_at": p.verified_at
            } for p in items
        ],
        "page": page,
        "total_pages": max(1, -(-total // page_size)),
        "total": total,
        "rider_id": str(rider_uuid)
    }

@router.get("/subscription-status")
def get_rider_subscription_status(
    rider_id: str = Query(..., description="Rider UUID"),
    db: Session = Depends(get_db)
):
    """
    ✅ BONUS: Admin view of rider's subscription status.
    Useful for customer support and verification.
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format")
    
    sub = db.query(RiderSubscription).filter(
        RiderSubscription.rider_id == rider_uuid
    ).first()
    
    if not sub:
        raise HTTPException(404, "Subscription not found")
    
    rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
    
    return {
        "rider_id": str(rider_uuid),
        "rider_name": rider.name if rider else "Unknown",
        "rider_phone": rider.mobile if rider else "Unknown",
        "plan_id": sub.plan_id,
        "expiry_at": sub.expiry_at,
        "frequency": sub.frequency,
        "has_ever_paid": sub.has_ever_paid,
        "locked": sub.locked,
        "lock_reason": sub.lock_reason,
        "locked_at": sub.locked_at,
        "total_paid_lifetime": float(sub.total_paid_lifetime or 0),
        "last_payment_at": sub.last_payment_at,
        "last_payment_amount": float(sub.last_payment_amount or 0),
        "created_at": sub.created_at,
        "updated_at": sub.updated_at
    }

# ============================================================================
# USAGE IN main.py:
# ============================================================================
#
# from app.routers import admin_subscription
# 
# app.include_router(admin_subscription.router)
#
