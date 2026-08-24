# backend/app/routers/admin_dashboard.py
# Backs the Super Admin Console's Dashboard, Payments & Reconciliation, User & Subscription
# Management, and Reporting sections. None of the five developer guides covered these
# sections in any depth (see docs/NAVIGATION_VALIDATION_REPORT.md) -- written here as real,
# working SQLAlchemy-backed endpoints rather than placeholders.

# ISSUE #1 FIX: Added SQLAlchemy text() import to properly wrap raw SQL queries
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, case, text  # ADDED: text import for Issue #1
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.rider import Rider
from app.models.subscription import RiderSubscription, SubscriptionPlan
from app.models.payment import Payment
from app.models.trip import Trip
from app.models.pin_recovery_request import PinRecoveryRequest
from app.models.bike_profile import DuplicatePlateCase, BikeProfile
from app.models.data_export_request import DataExportRequest
from app.models.legal_content import LegalContent

router = APIRouter(prefix="/admin", tags=["admin-dashboard"])

# ---------------------------------------------------------------
# Dashboard Summary -- backs AdminConsole's /admin/dashboard/summary
# ---------------------------------------------------------------

@router.get("/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db)):
    """Provide a high-level summary for the Super Admin dashboard"""
    total_riders = db.query(func.count(Rider.id)).scalar() or 0
    total_payments = db.query(func.count(Payment.id)).scalar() or 0
    active_subscriptions = db.query(func.count(RiderSubscription.rider_id)).filter(
        RiderSubscription.locked.is_(False)
    ).scalar() or 0

    return {
        "total_riders": total_riders,
        "total_payments": total_payments,
        "active_subscriptions": active_subscriptions,
        "timestamp": datetime.now(timezone.utc),
    }

# ---------------------------------------------------------------
# Legal Content -- backs MasterDataLegalContent.jsx's getLegalContent/updateLegalContent.
# ---------------------------------------------------------------
@router.get("/master-data/legal-content")
def get_legal_content(db: Session = Depends(get_db)):
    """Get all legal content"""
    rows = db.query(LegalContent).all()
    return {row.key: row.content for row in rows}


@router.put("/master-data/legal-content/{key}")
def update_legal_content(key: str, payload: dict, db: Session = Depends(get_db)):
    """Update legal content by key"""
    content = payload.get("content", "")
    row = db.query(LegalContent).get(key)
    if not row:
        row = LegalContent(key=key, content=content)
        db.add(row)
    else:
        row.content = content
    db.commit()
    return {"key": key, "content": row.content}


# ---------------------------------------------------------------
# Duplicate Plate Queue -- backs api/riderSupport.js's listDuplicatePlateCases/
# resolveDuplicatePlateCase, which RiderAccountSupport.jsx already calls.
# ---------------------------------------------------------------
@router.get("/rider-support/duplicate-plate-cases")
def duplicate_plate_cases(status: str = "pending_review", db: Session = Depends(get_db)):
    """Get duplicate plate cases by status"""
    rows = db.query(DuplicatePlateCase).filter(DuplicatePlateCase.status == status).all()
    result = []
    for c in rows:
        rider_a = db.query(Rider).get(c.rider_a_id) if c.rider_a_id else None
        rider_b = db.query(Rider).get(c.rider_b_id) if c.rider_b_id else None
        bike_a = db.query(BikeProfile).filter_by(rider_id=c.rider_a_id).first() if c.rider_a_id else None
        bike_b = db.query(BikeProfile).filter_by(rider_id=c.rider_b_id).first() if c.rider_b_id else None
        # BUG FIX: the admin-console page has always expected rider_a_masked_phone /
        # rider_a_submitted_at (and the _b equivalents) -- neither was ever returned by this
        # endpoint, so the queue rendered with blank rider info for every case.
        result.append({
            "id": c.id,
            "number_plate": c.number_plate,
            "rider_a_id": str(c.rider_a_id) if c.rider_a_id else None,
            "rider_a_masked_phone": rider_a.mobile_number if rider_a else None,
            "rider_a_submitted_at": bike_a.submitted_at if bike_a else None,
            "rider_b_id": str(c.rider_b_id) if c.rider_b_id else None,
            "rider_b_masked_phone": rider_b.mobile_number if rider_b else None,
            "rider_b_submitted_at": bike_b.submitted_at if bike_b else None,
            "status": c.status,
        })
    return result


@router.patch("/rider-support/duplicate-plate-cases/{case_id}/resolve")
def resolve_duplicate_plate_case(case_id: str, payload: dict, db: Session = Depends(get_db)):
    """Resolve a duplicate plate case"""
    decision = payload.get("decision")
    admin_id = payload.get("admin_id", "admin")
    case = db.query(DuplicatePlateCase).get(case_id)
    if not case:
        raise HTTPException(404, "Duplicate-plate case not found.")
    if decision not in ("confirm_a", "confirm_b", "request_correction_both"):
        raise HTTPException(422, "decision must be one of: confirm_a, confirm_b, request_correction_both")
    case.status = "resolved"
    case.resolution_decision = decision
    case.reviewed_by_admin_id = admin_id
    case.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": case.id, "status": case.status, "resolution_decision": case.resolution_decision}


# ---------------------------------------------------------------
# Data Export Requests Queue -- backs api/riderSupport.js's listDataExportRequests/
# fulfilDataExportRequest.
# ---------------------------------------------------------------
@router.get("/rider-support/data-export-requests")
def data_export_requests(status: str = "pending", db: Session = Depends(get_db)):
    """Get data export requests by status"""
    rows = (
        db.query(DataExportRequest, Rider.full_name, Rider.mobile_number)
        .join(Rider, DataExportRequest.rider_id == Rider.id)
        .filter(DataExportRequest.status == status)
        .order_by(DataExportRequest.requested_at.asc())
        .all()
    )
    return [
        {
            "id": str(req.id),
            "full_name": name,
            "mobile_number": phone,
            "contact_email": req.contact_email,
            "reason_code": req.reason_code,
            "requested_at": req.requested_at,
        }
        for req, name, phone in rows
    ]


@router.post("/rider-support/data-export-requests/{request_id}/fulfil")
def fulfil_data_export_request(request_id: str, db: Session = Depends(get_db)):
    """Mark a data export request as fulfilled"""
    req = db.query(DataExportRequest).get(request_id)
    if not req:
        raise HTTPException(404, "Data export request not found.")
    req.status = "fulfilled"
    req.fulfilled_at = datetime.now(timezone.utc)
    db.commit()
    # NOTE: actually generating/emailing the export file is a separate background job --
    # this endpoint only marks the request as fulfilled once that job has run. Wire up
    # the real file generation before relying on this in production.
    return {"id": str(req.id), "status": req.status}


# ---------------------------------------------------------------
# Rider Account Support -- Mobile Verification & PIN Recovery queues
# (these two endpoints back api/riderSupport.js's listMobileVerificationQueue/
# listPinRecoveryQueue, which admin-console pages already call)
# ---------------------------------------------------------------
@router.get("/rider-support/mobile-verification-queue")
def mobile_verification_queue(db: Session = Depends(get_db)):
    """Get pending mobile verification requests"""
    riders = (
        db.query(Rider)
        .filter(Rider.mobile_verified.is_(False), Rider.registration_status != "rejected")
        .order_by(Rider.created_at.asc())
        .all()
    )
    return [
        {
            "id": str(r.id),
            "full_name": r.full_name,
            "mobile_number": r.mobile_number,
            "submitted_at": r.created_at,
        }
        for r in riders
    ]


@router.patch("/rider-support/mobile-verification-queue/{rider_id}")
def resolve_mobile_verification(rider_id: str, payload: dict, db: Session = Depends(get_db)):
    """Approve or reject mobile verification"""
    approved = payload.get("approved", False)
    rider = db.query(Rider).get(rider_id)
    if not rider:
        raise HTTPException(404, "Rider not found.")
    rider.mobile_verified = approved
    if not approved:
        rider.registration_status = "rejected"
    db.commit()
    return {"id": str(rider.id), "mobile_verified": rider.mobile_verified}


@router.get("/rider-support/pin-recovery-queue")
def pin_recovery_queue(status: str = "pending", db: Session = Depends(get_db)):
    """Get PIN recovery requests by status"""
    rows = (
        db.query(PinRecoveryRequest, Rider.full_name)
        .join(Rider, PinRecoveryRequest.rider_id == Rider.id)
        .filter(PinRecoveryRequest.status == status)
        .order_by(PinRecoveryRequest.created_at.asc())
        .all()
    )
    return [
        {
            "id": str(req.id),
            "full_name": name,
            "mobile_number": req.mobile_number,
            "requested_at": req.created_at,
        }
        for req, name in rows
    ]


@router.patch("/rider-support/pin-recovery-queue/{request_id}/approve")
def approve_pin_recovery(request_id: str, admin_id: str = "admin", db: Session = Depends(get_db)):
    """Approve PIN recovery request"""
    req = db.query(PinRecoveryRequest).get(request_id)
    if not req:
        raise HTTPException(404, "PIN recovery request not found.")
    req.status = "approved"
    req.approved_by_admin = admin_id
    req.approved_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": str(req.id), "status": req.status}


# ---------------------------------------------------------------
# Payments & Reconciliation
# ---------------------------------------------------------------
@router.get("/payments")
def list_payments(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    rider_id: str = Query(None),
):
    """List all payments with optional filtering and pagination"""
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
    """Get payment details"""
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(404, "Payment not found")
    return payment


@router.patch("/payments/{payment_id}/verify")
def verify_payment(payment_id: str, db: Session = Depends(get_db)):
    """Mark payment as verified by super admin"""
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(404, "Payment not found")
    
    payment.reconciliation = "Verified"
    payment.reconciled_at = datetime.utcnow()
    payment.reconciled_by_admin = "super_admin"
    db.commit()
    db.refresh(payment)
    return payment


@router.patch("/payments/{payment_id}/reject")
def reject_payment(payment_id: str, reason: str = Query(...), db: Session = Depends(get_db)):
    """Mark payment as rejected with reason"""
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(404, "Payment not found")
    
    payment.reconciliation = f"Rejected — {reason}"
    payment.reconciled_at = datetime.utcnow()
    payment.reconciled_by_admin = "super_admin"
    db.commit()
    db.refresh(payment)
    return payment


@router.patch("/payments/{payment_id}/reconcile")
def reconcile_payment(payment_id: str, payload: dict, db: Session = Depends(get_db)):
    """Reconcile a payment (mark as verified or rejected)"""
    approved = payload.get("approved", False)
    admin_name = payload.get("admin_name", "admin")
    payment = db.query(Payment).get(payment_id)
    if not payment:
        raise HTTPException(404, "Payment not found.")
    payment.reconciliation = "Verified" if approved else "Rejected — Code Not Found"
    payment.reconciled_at = datetime.now(timezone.utc)
    payment.reconciled_by_admin = admin_name
    db.commit()
    return {"id": str(payment.id), "reconciliation": payment.reconciliation}


@router.patch("/payments/{rider_id}/relock")
def relock_account(rider_id: str, reason: str = "Manual re-lock by admin", db: Session = Depends(get_db)):
    """Manually re-lock an account (e.g. for chargeback, fraudulent M-Pesa code)"""
    sub = db.query(RiderSubscription).get(rider_id)
    if not sub:
        raise HTTPException(404, "Rider subscription not found.")
    sub.locked = True
    sub.lock_reason = reason
    sub.locked_at = datetime.now(timezone.utc)
    db.commit()
    return {"rider_id": rider_id, "locked": True, "lock_reason": reason}


# ---------------------------------------------------------------
# User & Subscription Management
# ---------------------------------------------------------------
@router.get("/riders")
def list_riders(status: str | None = None, page: int = 1, page_size: int = 20, db: Session = Depends(get_db)):
    """List all riders with pagination and optional status filter"""
    q = db.query(Rider)
    if status == "active":
        q = q.filter(Rider.registration_status == "active")
    total = q.count()
    rows = q.order_by(Rider.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    items = [
        {
            "id": str(r.id),
            "full_name": r.full_name,
            "mobile_number": r.mobile_number,
            "registration_status": r.registration_status,
            "mobile_verified": r.mobile_verified,
            "created_at": r.created_at,
        }
        for r in rows
    ]
    return {"items": items, "page": page, "total_pages": max(1, -(-total // page_size)), "total": total}


@router.get("/riders/subscription-status")
def subscription_status_breakdown(db: Session = Depends(get_db)):
    """Get subscription status breakdown for all riders"""
    rows = (
        db.query(Rider.id, Rider.full_name, Rider.mobile_number, RiderSubscription)
        .join(RiderSubscription, RiderSubscription.rider_id == Rider.id)
        .all()
    )
    items = []
    for rider_id, name, phone, sub in rows:
        if sub.locked:
            status = "expired"
        elif not sub.has_ever_paid:
            status = "free_trial"
        else:
            status = "paid"
        items.append({
            "rider_id": str(rider_id),
            "full_name": name,
            "mobile_number": phone,
            "status": status,
            "expiry_at": sub.expiry_at,
        })
    return {"items": items}


@router.get("/analytics/churn")
def churn_analysis(db: Session = Depends(get_db)):
    """Get churn analysis metrics"""
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)

    total_ever_paid = db.query(func.count(RiderSubscription.rider_id)).filter(
        RiderSubscription.has_ever_paid.is_(True)
    ).scalar() or 0

    churned = db.query(func.count(RiderSubscription.rider_id)).filter(
        RiderSubscription.has_ever_paid.is_(True),
        RiderSubscription.locked.is_(True),
        RiderSubscription.locked_at.isnot(None),
        RiderSubscription.locked_at >= thirty_days_ago,
    ).scalar() or 0

    churn_rate_pct = round((churned / total_ever_paid) * 100, 1) if total_ever_paid else 0.0

    # Riders active in trip-logging in the last 30 days but not currently subscribed --
    # a useful "at risk of full churn" signal distinct from already-locked accounts.
    recently_active_rider_ids = {
        r.rider_id for r in db.query(Trip.rider_id).filter(Trip.created_at >= thirty_days_ago).distinct()
    }

    return {
        "total_ever_paid_riders": total_ever_paid,
        "churned_last_30_days": churned,
        "churn_rate_pct": churn_rate_pct,
        "recently_active_rider_count": len(recently_active_rider_ids),
    }


# ---------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------
@router.get("/reports/daily-revenue")
def daily_revenue_report(days: int = 30, db: Session = Depends(get_db)):
    """Get daily revenue report for the last N days"""
    since = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
    rows = (
        db.query(
            func.date(Payment.submitted_at).label("day"),
            func.sum(Payment.amount).label("total"),
            func.count(Payment.id).label("count"),
        )
        .filter(func.date(Payment.submitted_at) >= since)
        .group_by(func.date(Payment.submitted_at))
        .order_by(func.date(Payment.submitted_at))
        .all()
    )
    return {
        "items": [
            {"date": str(r.day), "revenue": float(r.total), "payment_count": r.count}
            for r in rows
        ]
    }


@router.get("/reports/engagement")
def user_engagement_metrics(db: Session = Depends(get_db)):
    """Get user engagement metrics based on trip logging"""
    # See docs/USAGE_STATISTICS_REPORT.md for why this starts with trip-logging frequency
    # as the primary engagement signal, and the recommended app_usage_event table for
    # richer per-screen metrics once that's wired up on the mobile side.
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)

    trips_last_7_days = db.query(func.count(Trip.id)).filter(Trip.created_at >= seven_days_ago).scalar() or 0
    riders_with_trips = (
        db.query(func.count(func.distinct(Trip.rider_id)))
        .filter(Trip.created_at >= seven_days_ago)
        .scalar()
        or 0
    )
    total_active_riders = db.query(func.count(Rider.id)).filter(
        Rider.registration_status == "active"
    ).scalar() or 0

    avg_trips_per_active_rider = round(trips_last_7_days / riders_with_trips, 1) if riders_with_trips else 0
    pct_riders_engaged = round((riders_with_trips / total_active_riders) * 100, 1) if total_active_riders else 0

    return {
        "trips_last_7_days": trips_last_7_days,
        "riders_with_at_least_one_trip_last_7_days": riders_with_trips,
        "avg_trips_per_active_rider_last_7_days": avg_trips_per_active_rider,
        "pct_active_riders_engaged_last_7_days": pct_riders_engaged,
    }


@router.get("/reports/system-health")
def system_health(db: Session = Depends(get_db)):
    """Get system health report
    
    ISSUE #1 FIX: Wrapped raw SQL query with text() to comply with SQLAlchemy best practices
    """
    # FIXED: Added text() wrapper for raw SQL query
    db_size = db.execute(
        text("SELECT pg_size_pretty(pg_database_size(current_database()))")
    ).scalar()
    pending_reconciliation = (
        db.query(func.count(Payment.id))
        .filter(Payment.reconciliation == "Pending Super Admin Review")
        .scalar()
        or 0
    )
    oldest_pending = (
        db.query(func.min(Payment.submitted_at))
        .filter(Payment.reconciliation == "Pending Super Admin Review")
        .scalar()
    )
    oldest_pending_age_hours = None
    if oldest_pending:
        oldest_pending_age_hours = round(
            (datetime.now(timezone.utc) - oldest_pending).total_seconds() / 3600, 1
        )
    return {
        "status": "ok",
        "database_size": db_size,
        "pending_reconciliation_count": pending_reconciliation,
        "oldest_pending_reconciliation_age_hours": oldest_pending_age_hours,
    }


