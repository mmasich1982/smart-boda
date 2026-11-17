# backend/app/services/special_loan_service.py
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.chama_finance import (PersonalSavingsTxn, SpecialLoanRequest, SpecialLoanPledge)
from app.services.notification_service import notify, complete

ZERO = Decimal("0")

def psv_balance(db: Session, rider_id) -> Decimal:
    return Decimal(db.query(func.coalesce(func.sum(PersonalSavingsTxn.amount), 0)).filter_by(rider_id=rider_id).scalar())

def psv_locked(db: Session, rider_id) -> Decimal:
    """Money pledged to live special loans and not yet returned."""
    rows = db.query(SpecialLoanPledge).filter_by(lender_rider_id=rider_id, status="active").all()
    return sum((Decimal(p.amount) - Decimal(p.returned) for p in rows), ZERO)

def lendable(db: Session, rider_id, cfg) -> Decimal:
    bal, locked = psv_balance(db, rider_id), psv_locked(db, rider_id)
    cap = bal * Decimal(cfg.sp_lend_cap_pct) / 100
    return max(ZERO, min(cap - locked, bal - locked))

def funded(db: Session, request_id) -> Decimal:
    return Decimal(db.query(func.coalesce(func.sum(SpecialLoanPledge.amount), 0)).filter(
        SpecialLoanPledge.request_id == request_id, SpecialLoanPledge.status.in_(("active", "repaid"))).scalar())

def expire_stale(db: Session, group_id) -> None:
    """No scheduler exists, so overdue funding windows are closed whenever a list is read."""
    now = datetime.now(timezone.utc)
    stale = db.query(SpecialLoanRequest).filter(SpecialLoanRequest.group_id == group_id,
        SpecialLoanRequest.status == "open", SpecialLoanRequest.funding_deadline < now).with_for_update().all()
    for r in stale:
        r.status = "expired"
        db.query(SpecialLoanPledge).filter_by(request_id=r.id, status="active").update({"status": "released"})
        complete(db, "special_request", r.id, "expired")
        notify(db, "rider", r.borrower_rider_id, "sp_expired", "Special Loan not funded in time",
               "Your request was not fully funded within the funding window. Pledges have been released.", "special_request", r.id)
    if stale: db.commit()