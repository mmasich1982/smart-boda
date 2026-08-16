# backend/app/routers/payment_admin.py
# Payment & Subscription management endpoints for the Super Admin Console
# ISSUE #5 FIX: Complete payment and subscription endpoints for admin reconciliation

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.payment import Payment
from app.models.subscription import RiderSubscription
from app.auth import require_super_admin

router = APIRouter(
    prefix="/admin",
    tags=["super-admin"],
    dependencies=[Depends(require_super_admin)]
)


# ═══════════════════════════════════════════════════════════════════════════════
# PAYMENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/payments")
def list_payments(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    rider_id: str = Query(None),
):
    """List all payments with optional filtering
    
    ISSUE #5 FIX: Complete payment listing endpoint with pagination and filtering
    """
    query = db.query(Payment)
    
    if status:
        query = query.filter(Payment.reconciliation == status)
    if rider_id:
        query = query.filter(Payment.rider_id == rider_id)
    
    total = query.count()
    items = query.order_by(Payment.submitted_at.desc())\
                  .offset((page - 1) * page_size)\
                  .limit(page_size).all()
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items
    }


@router.get("/payments/{payment_id}")
def get_payment(payment_id: str, db: Session = Depends(get_db)):
    """Get payment details
    
    ISSUE #5 FIX: Retrieve a single payment by ID
    """
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment


@router.patch("/payments/{payment_id}/verify")
def verify_payment(payment_id: str, db: Session = Depends(get_db)):
    """Mark payment as verified by super admin
    
    ISSUE #5 FIX: Approve payment with verification
    """
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    payment.reconciliation = "Verified"
    payment.reconciled_at = datetime.utcnow()
    payment.reconciled_by_admin = "super_admin"
    db.commit()
    db.refresh(payment)
    return payment


@router.patch("/payments/{payment_id}/reject")
def reject_payment(
    payment_id: str,
    reason: str = Query(...),
    db: Session = Depends(get_db)
):
    """Mark payment as rejected with reason
    
    ISSUE #5 FIX: Reject payment with specified reason
    """
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    payment.reconciliation = f"Rejected — {reason}"
    payment.reconciled_at = datetime.utcnow()
    payment.reconciled_by_admin = "super_admin"
    db.commit()
    db.refresh(payment)
    return payment


# ═══════════════════════════════════════════════════════════════════════════════
# SUBSCRIPTION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/riders/subscription-status")
def list_rider_subscriptions(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status: str = Query(None),
):
    """List all rider subscriptions with status
    
    ISSUE #5 FIX: Comprehensive subscription listing with filtering
    
    Status filters:
    - locked: Subscription is locked (rider suspended)
    - expired: Subscription has expired
    - active: Subscription is currently active
    """
    query = db.query(RiderSubscription)
    
    if status == "locked":
        query = query.filter(RiderSubscription.locked == True)
    elif status == "expired":
        query = query.filter(RiderSubscription.expiry_at < datetime.utcnow())
    elif status == "active":
        query = query.filter(
            RiderSubscription.locked == False,
            RiderSubscription.expiry_at >= datetime.utcnow()
        )
    
    total = query.count()
    items = query.order_by(RiderSubscription.expiry_at.desc())\
                  .offset((page - 1) * page_size)\
                  .limit(page_size).all()
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items
    }


@router.get("/riders/{rider_id}/subscription")
def get_rider_subscription(rider_id: str, db: Session = Depends(get_db)):
    """Get subscription details for a specific rider
    
    ISSUE #5 FIX: Retrieve subscription info for a single rider
    """
    subscription = db.query(RiderSubscription).filter(
        RiderSubscription.rider_id == rider_id
    ).first()
    
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return subscription


@router.patch("/riders/{rider_id}/subscription/lock")
def lock_rider_subscription(
    rider_id: str,
    reason: str = Query(...),
    db: Session = Depends(get_db)
):
    """Lock a rider's subscription (suspend riding privileges)
    
    ISSUE #5 FIX: Suspend a rider's account with reason
    """
    subscription = db.query(RiderSubscription).filter(
        RiderSubscription.rider_id == rider_id
    ).first()
    
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    subscription.locked = True
    subscription.lock_reason = reason
    subscription.locked_at = datetime.utcnow()
    db.commit()
    db.refresh(subscription)
    return subscription


@router.patch("/riders/{rider_id}/subscription/unlock")
def unlock_rider_subscription(rider_id: str, db: Session = Depends(get_db)):
    """Unlock a rider's subscription (restore riding privileges)
    
    ISSUE #5 FIX: Restore a rider's suspended account
    """
    subscription = db.query(RiderSubscription).filter(
        RiderSubscription.rider_id == rider_id
    ).first()
    
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    subscription.locked = False
    subscription.lock_reason = None
    subscription.locked_at = None
    db.commit()
    db.refresh(subscription)
    return subscription
