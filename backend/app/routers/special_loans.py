# backend/app/routers/special_loans.py
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_rider
from app.models.rider import Rider
from app.models.boda_group import BodaGroup, GroupMember
from app.models.chama_finance import (ChamaConfig, SpecialLoanRequest, SpecialLoanPledge, SpecialLoanPayment, PersonalSavingsTxn)
from app.routers.rider_groups import _my_group
from app.services.group_roles import actor_group, guard, visible, approvers
from app.routers.chama_treasurer import _lock, RejectIn
from app.services.chama_finance_service import member_for_rider, new_ref, calc_loan, ZERO
from app.services.special_loan_service import psv_balance, psv_locked, lendable, funded, expire_stale
from app.services.notification_service import notify, complete

router = APIRouter(prefix="/special", tags=["special-loans"])
now = lambda: datetime.now(timezone.utc)
LIVE = ("pending_verification", "open", "funded", "active")

class ReqIn(BaseModel):
    reason: Literal["sickness", "school", "funeral", "accident", "other"]
    amount: Decimal = Field(gt=0, le=10000000, decimal_places=2)
    months: int = Field(ge=1, le=12)
    story: str = Field(min_length=15, max_length=600)
class PledgeIn(BaseModel):
    amount: Decimal = Field(gt=0, le=10000000, decimal_places=2)
class PayIn(BaseModel):
    amount: Decimal = Field(gt=0, le=1000000, decimal_places=2)
    method: Literal["cash", "mpesa"]
    channel: Optional[Literal["treasurer", "paybill"]] = None

def _me(db, rider):
    m = member_for_rider(db, rider.id)
    if not m: raise HTTPException(404, "Special Loans are shared inside your group. Ask your Treasurer to add your bike registration number.")
    g = db.get(BodaGroup, m.group_id); cfg = db.get(ChamaConfig, g.id)
    if not cfg: raise HTTPException(409, "Your group has not finished set-up yet.")
    return m, g, cfg

def _name(db, rider_id, group_id):
    m = db.query(GroupMember).filter_by(linked_rider_id=rider_id, group_id=group_id, status="active").first()
    return m.full_name if m else "Group member"

def _card(db, r, rider_id):
    f = funded(db, r.id)
    mine = db.query(SpecialLoanPledge).filter_by(request_id=r.id, lender_rider_id=rider_id).filter(
        SpecialLoanPledge.status.in_(("active", "repaid"))).all()
    return {"id": str(r.id), "reference": r.reference, "borrower": _name(db, r.borrower_rider_id, r.group_id),
        "reason": r.reason, "story": r.story, "amount": r.amount, "months": r.months, "interest": r.interest,
        "total": r.total, "installment": r.installment, "paid": r.paid, "balance": r.total - r.paid,
        "status": r.status, "reject_reason": r.reject_reason, "funded": f, "remaining": r.amount - f,
        "deadline": r.funding_deadline.isoformat() if r.funding_deadline else None,
        "my_pledge": sum((Decimal(p.amount) for p in mine), ZERO)}

@router.get("/me")
def board(db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    m, g, cfg = _me(db, rider)
    expire_stale(db, g.id)
    mine = db.query(SpecialLoanRequest).filter_by(borrower_rider_id=rider.id).order_by(SpecialLoanRequest.submitted_at.desc()).limit(20).all()
    fund = db.query(SpecialLoanRequest).filter(SpecialLoanRequest.group_id == g.id, SpecialLoanRequest.status == "open",
            SpecialLoanRequest.borrower_rider_id != rider.id).order_by(SpecialLoanRequest.funding_deadline).all()
    lent = db.query(SpecialLoanPledge, SpecialLoanRequest).join(SpecialLoanRequest, SpecialLoanRequest.id == SpecialLoanPledge.request_id)\
             .filter(SpecialLoanPledge.lender_rider_id == rider.id).order_by(SpecialLoanPledge.created_at.desc()).limit(30).all()
    pays = db.query(SpecialLoanPayment).filter_by(borrower_rider_id=rider.id).order_by(SpecialLoanPayment.submitted_at.desc()).limit(20).all()
    return {"treasurer": {"name": g.treasurer_name, "phone": g.treasurer_phone},
        "params": {"rate": cfg.sp_rate_pct, "max_months": cfg.sp_max_months, "min": cfg.sp_min_amount, "max": cfg.sp_max_amount,
                       "pledge_min": cfg.sp_pledge_min, "cap_pct": cfg.sp_lend_cap_pct, "window_days": cfg.sp_window_days},
        "personal": {"balance": psv_balance(db, rider.id), "locked": psv_locked(db, rider.id), "lendable": lendable(db, rider.id, cfg)},
        "mine": [_card(db, r, rider.id) for r in mine], "fund": [_card(db, r, rider.id) for r in fund],
        "lending": [{"id": str(p.id), "request_id": str(r.id), "reference": r.reference, "amount": p.amount, "returned": p.returned,
                     "earned": p.earned, "status": p.status, "loan_status": r.status} for p, r in lent],
        "payments": [{"id": str(p.id), "request_id": str(p.request_id), "amount": p.amount, "method": p.method,
                      "status": p.status, "reason": p.reject_reason} for p in pays]}

@router.post("/me/requests", status_code=201)
def create_request(b: ReqIn, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    m, g, cfg = _me(db, rider)
    if g.status != "active": raise HTTPException(403, "This group is inactive.")
    if b.amount < cfg.sp_min_amount or b.amount > cfg.sp_max_amount:
        raise HTTPException(422, f"Amount must be between KSh {cfg.sp_min_amount:,.0f} and KSh {cfg.sp_max_amount:,.0f}.")
    if b.months > cfg.sp_max_months: raise HTTPException(422, f"Maximum repayment period is {cfg.sp_max_months} months.")
    interest, total, inst = calc_loan(b.amount, b.months, cfg.sp_rate_pct)
    to = approvers(db, g, rider.id)           # raises BEFORE anything is saved if a Treasurer's request has no officer to verify it
    r = SpecialLoanRequest(reference=new_ref("SPL"), group_id=g.id, borrower_rider_id=rider.id, reason=b.reason,
        story=b.story.strip(), amount=b.amount, months=b.months, rate_pct=cfg.sp_rate_pct,
        interest=interest, total=total, installment=inst)
    db.add(r)
    try: db.flush()
    except IntegrityError:
        db.rollback(); raise HTTPException(409, "You already have a Special Loan in progress.")
    for rid_ in to:                           # the Treasurer, or the officers if the borrower IS the Treasurer
        notify(db, "rider", rid_, "sp_verify_pending", "Emergency to verify",
               f"{m.full_name} asks for a Special Loan of KSh {b.amount:,.0f}.", "special_request", r.id)
    db.commit()
    return {"id": str(r.id), "status": r.status}

@router.post("/me/requests/{rid}/cancel")
def cancel_request(rid: str, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    r = db.query(SpecialLoanRequest).filter(SpecialLoanRequest.id == rid, SpecialLoanRequest.borrower_rider_id == rider.id,
            SpecialLoanRequest.status.in_(("pending_verification", "open"))).with_for_update().first()
    if not r: raise HTTPException(409, "This request can no longer be cancelled.")
    r.status = "cancelled"
    db.query(SpecialLoanPledge).filter_by(request_id=r.id, status="active").update({"status": "released"})
    complete(db, "special_request", r.id, "cancelled")
    db.commit(); return {"ok": True}

@router.post("/me/requests/{rid}/pledge", status_code=201)
def pledge(rid: str, b: PledgeIn, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    m, g, cfg = _me(db, rider); expire_stale(db, g.id)
    r = db.query(SpecialLoanRequest).filter_by(id=rid, group_id=g.id).with_for_update().first()
    if not r or r.status != "open": raise HTTPException(409, "This request is not open for funding.")
    if r.borrower_rider_id == rider.id: raise HTTPException(409, "You cannot fund your own request.")
    db.query(Rider).filter(Rider.id == rider.id).with_for_update().first()     # serialise one lender's pledges
    remaining = Decimal(r.amount) - funded(db, r.id)
    if b.amount > remaining: raise HTTPException(422, f"Only KSh {remaining:,.0f} is still needed.")
    if b.amount < cfg.sp_pledge_min and b.amount != remaining:
        raise HTTPException(422, f"The smallest pledge is KSh {cfg.sp_pledge_min:,.0f}.")
    room = lendable(db, rider.id, cfg)
    if b.amount > room:
        raise HTTPException(422, f"You can lend up to KSh {room:,.0f} (limit {cfg.sp_lend_cap_pct}% of your Personal Savings).")
    to = approvers(db, g, r.borrower_rider_id)   # who hands over the cash if this pledge completes the funding
    db.add(SpecialLoanPledge(request_id=r.id, lender_rider_id=rider.id, amount=b.amount))
    db.flush()
    if funded(db, r.id) >= r.amount:
        r.status, r.funded_at = "funded", now()
        for rid_ in to:
            notify(db, "rider", rid_, "sp_disburse_pending", "Hand over a Special Loan",
                   f"{r.reference} is fully funded. Hand KSh {r.amount:,.0f} to the borrower.", "special_request", r.id)
        notify(db, "rider", r.borrower_rider_id, "sp_funded", "Your Special Loan is fully funded",
               "Your Treasurer will hand you the cash.", "special_request", r.id)
    db.commit()
    return {"ok": True, "status": r.status}

@router.post("/me/pledges/{pid}/withdraw")
def withdraw_pledge(pid: str, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    m, g, cfg = _me(db, rider)
    pl = db.query(SpecialLoanPledge).filter_by(id=pid, lender_rider_id=rider.id, status="active").with_for_update().first()
    if not pl: raise HTTPException(404, "Pledge not found")
    r = db.query(SpecialLoanRequest).filter_by(id=pl.request_id).with_for_update().first()
    if r.status != "open":                                  # once fully funded the money is committed
        raise HTTPException(409, "This pledge can no longer be withdrawn.")
    pl.status = "withdrawn"
    db.commit(); return {"ok": True}

@router.post("/me/payments", status_code=201)
def pay(b: PayIn, request_id: UUID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    m, g, cfg = _me(db, rider)
    r = db.query(SpecialLoanRequest).filter_by(id=request_id, borrower_rider_id=rider.id, status="active").first()
    if not r: raise HTTPException(409, "You have no active Special Loan.")
    pend = sum((Decimal(p.amount) for p in db.query(SpecialLoanPayment).filter_by(request_id=r.id, status="pending")), ZERO)
    if b.amount < 100: raise HTTPException(422, "The minimum repayment is KSh 100.")
    if b.amount + pend > r.total - r.paid: raise HTTPException(422, f"That is more than your remaining balance of KSh {r.total - r.paid - pend:,.0f}.")
    if b.method == "mpesa" and b.channel == "paybill": raise HTTPException(422, "Paybill is not available yet.")
    to = approvers(db, g, rider.id)           # raises BEFORE anything is saved if no one can confirm it
    p = SpecialLoanPayment(reference=new_ref("SPP"), request_id=r.id, group_id=g.id, borrower_rider_id=rider.id,
        amount=b.amount, method=b.method, channel=None if b.method == "cash" else "treasurer")
    db.add(p); db.flush()
    for rid_ in to:
        notify(db, "rider", rid_, "sp_payment_pending", "Special Loan repayment to confirm",
               f"{m.full_name} paid KSh {b.amount:,.0f} towards {r.reference}.", "special_payment", p.id)
    db.commit()
    return {"id": str(p.id), "status": "pending"}

# ---------------- Treasurer ----------------
def _req_rows(db, g, status):
    return db.query(SpecialLoanRequest).filter_by(group_id=g.id, status=status).order_by(SpecialLoanRequest.submitted_at).all()

@router.get("/manage/requests")
def to_verify(db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider); expire_stale(db, g.id)
    return [{"id": str(r.id), "reference": r.reference, "member": _name(db, r.borrower_rider_id, g.id), "bike": "",
             "amount": r.amount, "months": r.months, "total": r.total, "reason": r.reason, "story": r.story,
             "submitted_at": r.submitted_at.isoformat()} for r in _req_rows(db, g, "pending_verification")
            if visible(g, role, r.borrower_rider_id)]

def _lock_req(db, rid, g, status):
    r = db.query(SpecialLoanRequest).filter_by(id=rid, group_id=g.id).with_for_update().first()
    if not r: raise HTTPException(404, "Not found")
    if r.status != status: raise HTTPException(409, "This was already decided.")
    return r

@router.post("/manage/requests/{rid}/approve")
def verify(rid: str, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider); r = _lock_req(db, rid, g, "pending_verification")
    guard(g, role, r.borrower_rider_id)
    cfg = db.get(ChamaConfig, g.id)
    r.status, r.verified_by_rider_id, r.verified_at = "open", rider.id, now()
    r.funding_deadline = now() + timedelta(days=cfg.sp_window_days)
    complete(db, "special_request", r.id, "decided", recipient_type="rider", kind="sp_verify_pending")
    notify(db, "rider", r.borrower_rider_id, "sp_verified", "Emergency verified",
           f"Your request is open for pledges for {cfg.sp_window_days} days.", "special_request", r.id)
    db.commit(); return {"ok": True}

@router.post("/manage/requests/{rid}/reject")
def refuse(rid: str, b: RejectIn, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider); r = _lock_req(db, rid, g, "pending_verification")
    guard(g, role, r.borrower_rider_id)
    r.status, r.reject_reason = "rejected", b.reason.strip()
    complete(db, "special_request", r.id, "decided", recipient_type="rider", kind="sp_verify_pending")
    notify(db, "rider", r.borrower_rider_id, "sp_rejected", "Special Loan request declined", "Reason: " + b.reason.strip(), "special_request", r.id)
    db.commit(); return {"ok": True}

@router.get("/manage/funded")
def to_hand_over(db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider)
    return [{"id": str(r.id), "reference": r.reference, "member": _name(db, r.borrower_rider_id, g.id), "bike": "",
             "amount": r.amount, "method": "cash", "submitted_at": r.funded_at.isoformat()} for r in _req_rows(db, g, "funded")
            if visible(g, role, r.borrower_rider_id)]

@router.post("/manage/funded/{rid}/confirm")
def hand_over(rid: str, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider); r = _lock_req(db, rid, g, "funded")
    guard(g, role, r.borrower_rider_id)
    r.status, r.disbursed_at = "active", now()
    complete(db, "special_request", r.id, "decided", recipient_type="rider", kind="sp_disburse_pending")
    notify(db, "rider", r.borrower_rider_id, "sp_disbursed", "Special Loan handed over",
           f"Repay KSh {r.installment:,.0f} a month through your Treasurer.", "special_request", r.id)
    db.commit(); return {"ok": True}

@router.get("/manage/payments")
def pending_payments(db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider)
    rows = db.query(SpecialLoanPayment, SpecialLoanRequest).join(SpecialLoanRequest, SpecialLoanRequest.id == SpecialLoanPayment.request_id)\
             .filter(SpecialLoanPayment.group_id == g.id, SpecialLoanPayment.status == "pending").order_by(SpecialLoanPayment.submitted_at).all()
    return [{"id": str(p.id), "reference": p.reference, "member": _name(db, p.borrower_rider_id, g.id), "bike": "", "amount": p.amount,
             "method": p.method, "channel": p.channel, "loan": r.reference, "balance_now": r.total - r.paid,
             "submitted_at": p.submitted_at.isoformat()} for p, r in rows if visible(g, role, p.borrower_rider_id)]

@router.post("/manage/payments/{pid}/confirm")
def confirm_payment(pid: str, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider); p = _lock(db, SpecialLoanPayment, pid, g)
    guard(g, role, p.borrower_rider_id)
    r = db.query(SpecialLoanRequest).filter_by(id=p.request_id).with_for_update().first()
    if p.amount > r.total - r.paid: raise HTTPException(409, "This payment is more than the remaining balance. Reject it.")
    ip = (p.amount * r.interest / r.total).quantize(Decimal("0.01"))
    if p.amount == r.total - r.paid:                            # final payment: no rounding drift
        ip = r.interest - Decimal(db.query(func.coalesce(func.sum(SpecialLoanPayment.interest_part), 0)).filter(
            SpecialLoanPayment.request_id == r.id, SpecialLoanPayment.status == "confirmed").scalar())
    pr = p.amount - ip
    p.status, p.interest_part, p.decided_at, p.decided_by_rider_id = "confirmed", ip, now(), rider.id
    r.paid += p.amount
    cleared = r.paid >= r.total
    for pl in db.query(SpecialLoanPledge).filter_by(request_id=r.id, status="active").all():   # share to lenders pro rata
        share = Decimal(pl.amount) / Decimal(r.amount)
        pl.returned += (pr * share).quantize(Decimal("0.01"))              # principal unlocks
        earned = (ip * share).quantize(Decimal("0.01"))
        pl.earned += earned
        if earned > 0:                                                      # interest goes into the lender's Personal Savings
            db.add(PersonalSavingsTxn(rider_id=pl.lender_rider_id, kind="interest", amount=earned, ref_type="special_payment", ref_id=p.id))
        if cleared: pl.returned, pl.status = pl.amount, "repaid"
    if cleared: r.status, r.cleared_at = "cleared", now()
    complete(db, "special_payment", p.id, "decided", recipient_type="rider")
    notify(db, "rider", r.borrower_rider_id, "sp_payment_confirmed", "Repayment confirmed",
           f"KSh {p.amount:,.0f} confirmed. Your Special Loan balance is updated.", "special_payment", p.id)
    db.commit(); return {"ok": True}

@router.post("/manage/payments/{pid}/reject")
def reject_payment(pid: str, b: RejectIn, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider); p = _lock(db, SpecialLoanPayment, pid, g)
    guard(g, role, p.borrower_rider_id)
    p.status, p.reject_reason, p.decided_at, p.decided_by_rider_id = "rejected", b.reason.strip(), now(), rider.id
    complete(db, "special_payment", p.id, "decided", recipient_type="rider")
    notify(db, "rider", p.borrower_rider_id, "sp_payment_rejected", "Repayment rejected", "Reason: " + b.reason.strip(), "special_payment", p.id)
    db.commit(); return {"ok": True}