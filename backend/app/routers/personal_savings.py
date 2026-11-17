# backend/app/routers/personal_savings.py
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_rider
from app.models.rider import Rider
from app.models.boda_group import BodaGroup, GroupMember
from app.models.chama_finance import ChamaConfig, PersonalSavingsDeposit, PersonalSavingsTxn
from app.routers.chama_treasurer import _lock, RejectIn
from app.services.chama_finance_service import member_for_rider, new_ref, ZERO
from app.services.group_roles import actor_group, guard, visible, approvers
from app.services.special_loan_service import psv_balance, psv_locked, lendable
from app.services.notification_service import notify, complete

router = APIRouter(prefix="/psv", tags=["personal-savings"])
now = lambda: datetime.now(timezone.utc)

class DepositIn(BaseModel):
    amount: Decimal = Field(gt=0, le=1000000, decimal_places=2)
    method: Literal["cash", "mpesa"]
    channel: Optional[Literal["treasurer", "paybill"]] = None

@router.get("/me/summary")
def summary(db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Reached only from My Savings, which only group members see. Without a group the numbers are zero."""
    m = member_for_rider(db, rider.id)
    g = db.get(BodaGroup, m.group_id) if m else None
    cfg = db.get(ChamaConfig, g.id) if g else None
    bal, locked = psv_balance(db, rider.id), psv_locked(db, rider.id)
    rows = db.query(PersonalSavingsDeposit).filter_by(rider_id=rider.id)\
             .order_by(PersonalSavingsDeposit.submitted_at.desc()).limit(30).all()
    return {"has_group": bool(m), "treasurer": g and {"name": g.treasurer_name, "phone": g.treasurer_phone},
        "balance": bal, "locked": locked, "available": bal - locked,
        "lendable": lendable(db, rider.id, cfg) if cfg else ZERO,
        "pending_total": sum((Decimal(r.amount) for r in rows if r.status == "pending"), ZERO),
        "history": [{"id": str(r.id), "amount": r.amount, "method": r.method, "status": r.status,
                     "reason": r.reject_reason, "at": r.submitted_at.isoformat()} for r in rows]}

@router.post("/me/deposits", status_code=201)
def deposit(b: DepositIn, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    m = member_for_rider(db, rider.id)
    if not m: raise HTTPException(409, "Deposits are confirmed by your group Treasurer. Ask your Treasurer to add your bike registration number.")
    g = db.get(BodaGroup, m.group_id)
    if b.method == "mpesa" and b.channel == "paybill": raise HTTPException(422, "Paybill is not available yet. Send to the Treasurer's number.")
    who = approvers(db, g, rider.id)          # BEFORE anything is saved: the Treasurer, or the officers if the depositor IS the Treasurer
    d = PersonalSavingsDeposit(reference=new_ref("PSV"), rider_id=rider.id, group_id=g.id, amount=b.amount,
        method=b.method, channel=None if b.method == "cash" else "treasurer")
    db.add(d); db.flush()
    for rid_ in who:
        notify(db, "rider", rid_, "psv_pending", "Personal Savings to confirm",
               f"{m.full_name} deposited KSh {b.amount:,.0f} to Personal Savings.", "psv_deposit", d.id)
    db.commit()
    return {"id": str(d.id), "reference": d.reference, "status": "pending"}

# ---- Treasurer queue; officers see and decide only the Treasurer's own deposits ----
@router.get("/manage/deposits")
def list_deposits(status: str = "pending", db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider)
    rows = db.query(PersonalSavingsDeposit, GroupMember)\
             .join(GroupMember, GroupMember.linked_rider_id == PersonalSavingsDeposit.rider_id)\
             .filter(PersonalSavingsDeposit.group_id == g.id, GroupMember.group_id == g.id, GroupMember.status == "active",
                     PersonalSavingsDeposit.status == status).order_by(PersonalSavingsDeposit.submitted_at).all()
    return [{"id": str(d.id), "reference": d.reference, "member": m.full_name, "bike": m.plate_raw,
             "amount": d.amount, "method": d.method, "channel": d.channel, "submitted_at": d.submitted_at.isoformat()}
            for d, m in rows if visible(g, role, d.rider_id)]

@router.post("/manage/deposits/{did}/confirm")
def confirm(did: str, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider); d = _lock(db, PersonalSavingsDeposit, did, g)
    guard(g, role, d.rider_id)                # nobody confirms their own money
    d.status, d.decided_at, d.decided_by_rider_id = "confirmed", now(), rider.id
    db.add(PersonalSavingsTxn(rider_id=d.rider_id, kind="deposit", amount=d.amount, ref_type="psv_deposit", ref_id=d.id))
    complete(db, "psv_deposit", d.id, "decided", recipient_type="rider")
    notify(db, "rider", d.rider_id, "psv_confirmed", "Personal Savings confirmed",
           f"KSh {d.amount:,.0f} confirmed by your group officer.", "psv_deposit", d.id)
    db.commit(); return {"ok": True}

@router.post("/manage/deposits/{did}/reject")
def reject(did: str, b: RejectIn, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider); d = _lock(db, PersonalSavingsDeposit, did, g)
    guard(g, role, d.rider_id)
    d.status, d.reject_reason, d.decided_at, d.decided_by_rider_id = "rejected", b.reason.strip(), now(), rider.id
    complete(db, "psv_deposit", d.id, "decided", recipient_type="rider")
    notify(db, "rider", d.rider_id, "psv_rejected", "Personal Savings rejected", "Reason: " + b.reason.strip(), "psv_deposit", d.id)
    db.commit(); return {"ok": True}