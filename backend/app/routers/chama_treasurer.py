# backend/app/routers/chama_treasurer.py
from app.services.group_member_link_service import mask_phone
from datetime import datetime, timezone, date, timedelta
from uuid import UUID as RowId   # NOT "UUID": star-imports of the models bring SQLAlchemy's UUID column type into scope
from decimal import Decimal
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_rider
from app.models.rider import Rider
from app.models.boda_group import GroupMember
from app.models.chama_finance import *
from app.models.chama_finance import ChamaMgrRound
from app.routers.rider_groups import _my_group, _used
from app.services.group_roles import actor_group
from app.services.chama_finance_service import *
from app.services import tb_security as tbs, mgr_engine as eng
from app.models.chama_finance import ChamaTbSecurity, ChamaLoanSecurity, ChamaMgrCircle, ChamaMgrSwap
from app.services.notification_service import notify, complete

router = APIRouter(prefix="/chama/manage", tags=["chama-treasurer"])
GID = Query(None, description="Which group, when the Treasurer runs several. Omit for the first one.")
now = lambda: datetime.now(timezone.utc)

class ConfigIn(BaseModel):
    chama_type: Literal["tb", "mgr"]
    interest_rate_pct: Decimal = Field(ge=0, le=100, decimal_places=2)
    max_loan_multiple: Decimal = Field(gt=0, le=10, decimal_places=1)
    max_loan_months: int = Field(ge=1, le=12)
    min_loan_amount: Decimal = Field(ge=0, decimal_places=2)
    opening_pool: Decimal = Field(ge=0, decimal_places=2)
    min_contributions_for_loan: int = Field(default=0, ge=0, le=100)
    meeting_week: Optional[Literal["1st", "2nd", "3rd", "4th", "Last"]] = None     # Table Banking meeting rhythm
    meeting_day: Optional[Literal["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]] = None
    cycle_month: Optional[Literal["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]] = None

class CategoryIn(BaseModel):
    freq: Literal["Daily", "Weekly", "Bi-Weekly", "Monthly"]
    amount: Decimal = Field(ge=0, le=1000000, decimal_places=2)
    is_active: bool = True

class RejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)

def _cfg(db, g, lock=False):
    q = db.query(ChamaConfig).filter(ChamaConfig.group_id == g.id)
    cfg = (q.with_for_update() if lock else q).first()
    if not cfg: cfg = ensure_config(db, g)           # the administrator already chose the type: no extra step for the Treasurer
    if not cfg: raise HTTPException(409, "Set up your Chama first (choose the Chama type).")
    return cfg

@router.get("/config")
def get_config(group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g = _my_group(db, rider, group_id=group_id)
    cfg = ensure_config(db, g); db.commit()
    cats = db.query(ChamaCategory).filter_by(group_id=g.id).order_by(ChamaCategory.freq).all()
    return {"configured": bool(cfg), "group_id": str(g.id), "group_name": g.group_name, "group_type": g.group_type or (cfg.chama_type if cfg else None),
            "config": cfg and {"chama_type": cfg.chama_type, "interest_rate_pct": cfg.interest_rate_pct,
                "max_loan_multiple": cfg.max_loan_multiple, "max_loan_months": cfg.max_loan_months,
                "min_loan_amount": cfg.min_loan_amount, "opening_pool": cfg.opening_pool,
                "min_contributions_for_loan": cfg.min_contributions_for_loan,
                "meeting_week": cfg.meeting_week, "meeting_day": cfg.meeting_day, "cycle_month": cfg.cycle_month},
            "categories": [{"id": str(c.id), "freq": c.freq, "amount": c.amount, "is_active": c.is_active} for c in cats]}

@router.put("/config")
def put_config(b: ConfigIn, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g = _my_group(db, rider, lock=True, group_id=group_id)
    cfg = ensure_config(db, g)
    if g.group_type and b.chama_type != g.group_type:
        raise HTTPException(409, "The Smart Boda Administrator set this group up as a "
                                 + ("Merry-Go-Round." if g.group_type == "mgr" else "Table Banking group."))
    if cfg and cfg.chama_type != b.chama_type and db.query(GroupMember.id).filter_by(group_id=g.id, status="active").first():
        raise HTTPException(409, "This Chama already has members. A Chama can only run one type.")
    ledger_exists = db.query(ChamaLedger.id).filter_by(group_id=g.id).first()
    if cfg and ledger_exists and b.opening_pool != cfg.opening_pool:
        raise HTTPException(409, "The opening pool cannot change once money has moved.")
    if not cfg: cfg = ChamaConfig(group_id=g.id); db.add(cfg)
    for k, v in b.model_dump().items():
        if v is not None: setattr(cfg, k, v)
    db.commit()
    return {"ok": True}

@router.put("/categories")
def put_category(b: CategoryIn, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g = _my_group(db, rider, lock=True, group_id=group_id)
    cfg = _cfg(db, g)
    c = db.query(ChamaCategory).filter_by(group_id=g.id, freq=b.freq).first()
    if not c: c = ChamaCategory(group_id=g.id, freq=b.freq); db.add(c)
    c.amount, c.is_active = b.amount, b.is_active          # soft switch-off keeps history valid
    if cfg.chama_type == "mgr" and b.is_active:           # a Merry-Go-Round has exactly ONE active contribution
        db.query(ChamaCategory).filter(ChamaCategory.group_id == g.id, ChamaCategory.freq != b.freq).update({"is_active": False})
    db.commit()
    return {"ok": True}

@router.get("/overview")
def overview(group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g = _my_group(db, rider, group_id=group_id)
    n = lambda M: db.query(func.count(M.id)).filter(M.group_id == g.id, M.status == "pending").scalar()
    cfg = ensure_config(db, g)
    out = {"group_id": str(g.id), "group_type": cfg.chama_type if cfg else g.group_type,
           "pending_contributions": n(ChamaContribution), "pending_repayments": n(ChamaLoanPayment),
           "pending_loan_requests": n(ChamaLoanApplication),
           "pool": pool_cash(db, g.id, cfg) if cfg else 0}
    out["security_to_check"] = db.query(func.count(ChamaLoanSecurity.id)).filter_by(group_id=g.id, status="submitted").scalar()
    out["pending_swaps"] = db.query(func.count(ChamaMgrSwap.id)).filter_by(group_id=g.id, stage="treasurer").scalar()
    out["circles"] = db.query(func.count(ChamaMgrCircle.id)).filter_by(group_id=g.id).scalar()
    return out

def _rows(db, g, M, status):
    q = db.query(M, GroupMember).join(GroupMember, GroupMember.id == M.member_id).filter(M.group_id == g.id)
    return q.filter(M.status == status).order_by(M.submitted_at).all()

@router.get("/contributions")
def list_contributions(status: str = "pending", group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider, group_id=group_id)
    return [{"id": str(c.id), "reference": c.reference, "member": m.full_name, "phone": mask_phone(m.phone),
             "amount": c.amount, "method": c.method, "channel": c.channel,
             "submitted_at": c.submitted_at.isoformat()} for c, m in _rows(db, g, ChamaContribution, status)]

def _lock(db, M, rid, g):
    x = db.query(M).filter(M.id == rid, M.group_id == g.id).with_for_update().first()
    if not x: raise HTTPException(404, "Not found")
    if x.status != "pending": raise HTTPException(409, "This was already decided.")
    return x

def _member_rider(db, member_id):
    return db.get(GroupMember, member_id).linked_rider_id

@router.post("/contributions/{cid}/confirm")
def confirm_contribution(cid: RowId, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider, group_id=group_id); c = _lock(db, ChamaContribution, cid, g)
    circle_id = None
    if c.round_id:
        rnd = db.get(ChamaMgrRound, c.round_id)
        if rnd.status != "open":
            raise HTTPException(409, "This round was already paid out. Reject this payment.")
        circle_id = rnd.circle_id
    c.status, c.decided_at, c.decided_by_rider_id = "confirmed", now(), rider.id
    post(db, g.id, c.member_id, rider.id, "mgr_contribution" if c.round_id else "contribution", "in",
         c.amount, "contribution", c.id, circle_id=circle_id)
    complete(db, "contribution", c.id, "decided", recipient_type="rider")
    notify(db, "rider", _member_rider(db, c.member_id), "contribution_confirmed", "Contribution confirmed",
           f"KSh {c.amount:,.0f} confirmed by your Treasurer. Your savings are updated.", "contribution", c.id)
    db.commit(); return {"ok": True}

@router.post("/contributions/{cid}/reject")
def reject_contribution(cid: RowId, b: RejectIn, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider, group_id=group_id); c = _lock(db, ChamaContribution, cid, g)
    c.status, c.reject_reason, c.decided_at, c.decided_by_rider_id = "rejected", b.reason.strip(), now(), rider.id
    complete(db, "contribution", c.id, "decided", recipient_type="rider")
    notify(db, "rider", _member_rider(db, c.member_id), "contribution_rejected", "Contribution rejected",
           "Reason: " + b.reason.strip(), "contribution", c.id)
    db.commit(); return {"ok": True}

@router.get("/loan-applications")
def list_apps(status: str = "pending", group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider, group_id=group_id); cfg = _cfg(db, g)
    out = []
    for a, m in _rows(db, g, ChamaLoanApplication, status):
        out.append({"id": str(a.id), "reference": a.reference, "member": m.full_name, "phone": mask_phone(m.phone),
            "amount": a.amount, "months": a.months, "purpose": a.purpose, "interest": a.interest,
            "total": a.total, "installment": a.installment,
            "member_savings": savings_of(db, m.id), "submitted_at": a.submitted_at.isoformat(),
            "security": tbs.status_of(db, g, a),
            "securities": [tbs.row_view(db, r) for r in db.query(ChamaLoanSecurity).filter_by(application_id=a.id).order_by(ChamaLoanSecurity.created_at)]})
    return {"items": out, "pool": pool_cash(db, g.id, cfg)}

@router.post("/loan-applications/{aid}/approve")
def approve_loan(aid: RowId, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider, group_id=group_id); cfg = _cfg(db, g, lock=True)        # lock: two approvals cannot over-lend the pool
    a = _lock(db, ChamaLoanApplication, aid, g)
    if active_loan(db, a.member_id): raise HTTPException(409, "This member already has an active loan.")
    st = tbs.status_of(db, g, a)                          # security first: everything offered must be checked and held, and the cover reached
    if not st["ok"]: raise HTTPException(409, "Security is not ready. " + " ".join(st["blockers"]))
    if a.amount > pool_cash(db, g.id, cfg):
        raise HTTPException(409, "The group fund cannot lend this amount right now.")
    loan = ChamaLoan(reference=new_ref("TBL"), application_id=a.id, group_id=g.id, member_id=a.member_id,
        principal=a.amount, rate_pct=a.rate_pct, months=a.months, interest=a.interest, total=a.total,
        installment=a.installment, paid=0, status="active", disbursed_at=now())
    db.add(loan); db.flush()
    a.status, a.loan_id, a.decided_at, a.decided_by_rider_id = "approved", loan.id, now(), rider.id
    tbs.attach_to_loan(db, a.id, loan.id)
    post(db, g.id, a.member_id, rider.id, "loan_disbursement", "out", a.amount, "loan", loan.id)
    complete(db, "loan_application", a.id, "decided", recipient_type="rider")
    notify(db, "rider", _member_rider(db, a.member_id), "loan_approved", "Loan approved",
           f"KSh {a.amount:,.0f} approved. Collect the cash from your Treasurer.", "loan_application", a.id)
    db.commit(); return {"ok": True, "loan": loan.reference}

@router.post("/loan-applications/{aid}/reject")
def reject_loan(aid: RowId, b: RejectIn, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider, group_id=group_id); a = _lock(db, ChamaLoanApplication, aid, g)
    a.status, a.reject_reason, a.decided_at, a.decided_by_rider_id = "rejected", b.reason.strip(), now(), rider.id
    tbs.release_if_open(db, a.id, "declined")             # whatever was put up goes back
    complete(db, "loan_application", a.id, "decided", recipient_type="rider")
    notify(db, "rider", _member_rider(db, a.member_id), "loan_rejected", "Loan request declined",
           "Reason: " + b.reason.strip(), "loan_application", a.id)
    db.commit(); return {"ok": True}

@router.get("/loan-payments")
def list_loan_payments(status: str = "pending", group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider, group_id=group_id)
    out = []
    for p, m in _rows(db, g, ChamaLoanPayment, status):
        loan = db.get(ChamaLoan, p.loan_id)
        out.append({"id": str(p.id), "reference": p.reference, "member": m.full_name, "phone": mask_phone(m.phone),
            "amount": p.amount, "method": p.method, "channel": p.channel, "loan": loan.reference,
            "balance_now": loan.total - loan.paid, "submitted_at": p.submitted_at.isoformat()})
    return out

@router.post("/loan-payments/{pid}/confirm")
def confirm_payment(pid: RowId, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider, group_id=group_id); p = _lock(db, ChamaLoanPayment, pid, g)
    loan = db.query(ChamaLoan).filter_by(id=p.loan_id).with_for_update().first()
    if p.amount > loan.total - loan.paid:
        raise HTTPException(409, "This payment is more than the remaining balance. Reject it.")
    ip = (p.amount * loan.interest / loan.total).quantize(Decimal("0.01"))
    if p.amount == loan.total - loan.paid:                      # final payment: no rounding drift
        ip = loan.interest - interest_paid(db, loan.id)
    p.status, p.interest_part, p.decided_at, p.decided_by_rider_id = "confirmed", ip, now(), rider.id
    loan.paid += p.amount
    post(db, g.id, p.member_id, rider.id, "loan_repayment_principal", "in", p.amount - ip, "loan_payment", p.id)
    if ip > 0: post(db, g.id, p.member_id, rider.id, "loan_repayment_interest", "in", ip, "loan_payment", p.id)
    if loan.paid >= loan.total:
        loan.status, loan.cleared_at = "cleared", now()
        if db.query(ChamaLoanSecurity.id).filter_by(loan_id=loan.id, status="held").first():
            notify(db, "rider", g.treasurer_rider_id, "security_release_due", "Give the security back",
                   f"{db.get(GroupMember, p.member_id).full_name}'s loan is cleared. Return what you are holding.", "loan", loan.id)
    complete(db, "loan_payment", p.id, "decided", recipient_type="rider")
    notify(db, "rider", _member_rider(db, p.member_id), "loan_payment_confirmed", "Repayment confirmed",
           f"KSh {p.amount:,.0f} confirmed. Your loan balance has been updated.", "loan_payment", p.id)
    db.commit(); return {"ok": True}

@router.post("/loan-payments/{pid}/reject")
def reject_payment(pid: RowId, b: RejectIn, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider, group_id=group_id); p = _lock(db, ChamaLoanPayment, pid, g)
    p.status, p.reject_reason, p.decided_at, p.decided_by_rider_id = "rejected", b.reason.strip(), now(), rider.id
    complete(db, "loan_payment", p.id, "decided", recipient_type="rider")
    notify(db, "rider", _member_rider(db, p.member_id), "loan_payment_rejected", "Repayment rejected",
           "Reason: " + b.reason.strip(), "loan_payment", p.id)
    db.commit(); return {"ok": True}

# ---- Loan security (Table Banking): rules per group, and the "Security held" register ----
class SecurityCfgIn(BaseModel):
    preset: Optional[Literal["none", "savings", "assets"]] = None      # quick set-up; the fields below can still be adjusted
    mode: Literal["none", "optional", "required"] = "none"             # security is OFF until the Treasurer switches it on
    from_amount: Decimal = Field(default=0, ge=0, le=10000000)         # loans at or above this amount need security
    haircut_pct: int = Field(default=70, ge=10, le=100)                # papers/items count at this % of their value
    cover_pct: int = Field(default=100, ge=10, le=300)
    savings_on: bool = True
    savings_pct: int = Field(default=100, ge=1, le=100)
    allow_title: bool = False
    allow_logbook: bool = False
    allow_chattel: bool = False
    guar_on: bool = False
    guar_max: int = Field(default=1, ge=0, le=10)
    guar_savings: bool = True
    guar_title: bool = False
    guar_logbook: bool = False
    guar_chattel: bool = False
    keeper: Literal["Treasurer"] = "Treasurer"
    valuation: str = Field(default="Treasurer and one official", max_length=80)
    verify: str = Field(default="Check the original document or serial number", max_length=80)
    release_rule: str = Field(default="Released when the loan is fully repaid", max_length=80)

def _tb_only(db, g):
    cfg = _cfg(db, g)
    if cfg.chama_type != "tb": raise HTTPException(409, "Loan security applies to Table Banking groups only.")
    return cfg

@router.get("/security")
def get_security(group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider, group_id=group_id); _tb_only(db, g)
    return tbs.sec_dict(tbs.sec_of(db, g.id))

@router.put("/security")
def put_security(b: SecurityCfgIn, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g = _my_group(db, rider, lock=True, group_id=group_id); _tb_only(db, g)
    data = b.model_dump(exclude={"preset"})
    if b.preset:                                           # a preset sets the mode and which kinds of security are allowed
        for k in tbs.PRESET_FIELDS: data.pop(k, None)
    if b.preset and data.get("guar_on") and not (data.get("guar_savings") or data.get("guar_title") or data.get("guar_logbook") or data.get("guar_chattel")):
        raise HTTPException(422, "Choose at least one way a guarantor can back a loan.")
    if not b.preset and b.guar_on and not (b.guar_savings or b.guar_title or b.guar_logbook or b.guar_chattel):
        raise HTTPException(422, "Choose at least one way a guarantor can back a loan.")
    if not b.preset and b.mode == "required" and not (b.savings_on or b.allow_title or b.allow_logbook or b.allow_chattel or (b.guar_on and b.guar_max > 0)):
        raise HTTPException(422, "If security is required, allow at least one kind of security.")
    sec = db.get(ChamaTbSecurity, g.id)
    if not sec: sec = ChamaTbSecurity(group_id=g.id); db.add(sec)
    for k, v in data.items(): setattr(sec, k, v)
    if b.preset: tbs.apply_preset(sec, b.preset)
    # Switching guarantors off later affects NEW requests only; guarantees already on live loans stay until they are cleared.
    db.commit()
    return tbs.sec_dict(sec)

@router.get("/security-held")
def security_held(group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """To check / held / returned, grouped by borrower, with how much of the loan is still owed."""
    g, role = actor_group(db, rider, group_id=group_id); _tb_only(db, g)
    rows = db.query(ChamaLoanSecurity, GroupMember).join(GroupMember, GroupMember.id == ChamaLoanSecurity.member_id)\
             .filter(ChamaLoanSecurity.group_id == g.id, ChamaLoanSecurity.status.in_(("submitted", "held")))\
             .order_by(ChamaLoanSecurity.created_at).all()
    by = {}
    for r, m in rows:
        e = by.setdefault(m.id, {"member_id": str(m.id), "member": m.full_name, "phone": mask_phone(m.phone), "items": [], "owes": ZERO})
        e["items"].append(tbs.row_view(db, r))
    for mid, e in by.items():
        loan = active_loan(db, mid); e["owes"] = (loan.total - loan.paid) if loan else ZERO
        e["can_release"] = e["owes"] == 0 and all(i["status"] == "held" for i in e["items"]) \
            and any(r.loan_id for r, m in rows if m.id == mid)
    items = [i for e in by.values() for i in e["items"]]
    return {"to_check": sum(1 for i in items if i["status"] == "submitted"), "held": sum(1 for i in items if i["status"] == "held"),
            "value_held": sum((Decimal(i["value"]) for i in items if i["status"] == "held"), ZERO),
            "borrowers": list(by.values()), "rules": tbs.sec_dict(tbs.sec_of(db, g.id))}

def _sec_lock(db, g, role, sid):
    r = db.query(ChamaLoanSecurity).filter_by(id=sid, group_id=g.id).with_for_update().first()
    if not r: raise HTTPException(404, "Not found")
    return r

@router.post("/loan-securities/{sid}/hold")
def hold_security(sid: RowId, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """"I checked it: hold it." Only an item the borrower has sent (and a guarantor has agreed to) can be held."""
    g, role = actor_group(db, rider, group_id=group_id); r = _sec_lock(db, g, role, sid)
    if r.status != "submitted": raise HTTPException(409, "This item is not waiting to be checked.")
    if r.kind == "guarantor" and r.guarantor_form == "savings":
        gm = db.get(GroupMember, r.guarantor_member_id)
        if Decimal(r.value) > savings_of(db, gm.id): raise HTTPException(409, "The guarantor no longer has enough savings.")
    r.status, r.checked_at, r.checked_by_rider_id = "held", now(), rider.id
    app = db.get(ChamaLoanApplication, r.application_id) if r.application_id else None
    b = db.get(GroupMember, r.member_id)
    if b.linked_rider_id:
        notify(db, "rider", b.linked_rider_id, "security_held", "Security checked",
               "Your Treasurer checked your security and is holding it safely.", "loan_application", app.id if app else r.id)
    db.commit(); return {"ok": True}

@router.post("/loan-securities/{sid}/decline")
def decline_security(sid: RowId, b: RejectIn, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider, group_id=group_id); r = _sec_lock(db, g, role, sid)
    if r.status not in ("submitted", "waiting_guarantor"): raise HTTPException(409, "This item cannot be declined now.")
    r.status, r.checked_at, r.checked_by_rider_id = "declined", now(), rider.id
    bm = db.get(GroupMember, r.member_id)
    if bm.linked_rider_id:
        notify(db, "rider", bm.linked_rider_id, "security_declined", "Security not accepted",
               "Reason: " + b.reason.strip() + " Add other security or cancel your request.", "loan_application", r.application_id or r.id)
    db.commit(); return {"ok": True}

@router.post("/borrowers/{member_id}/release-security")
def release_security(member_id: RowId, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Give everything back once the loan is cleared."""
    g, role = actor_group(db, rider, group_id=group_id)
    m = db.query(GroupMember).filter_by(id=member_id, group_id=g.id).first()
    if not m: raise HTTPException(404, "Not found")
    if active_loan(db, m.id): raise HTTPException(409, "The loan is not finished yet. Keep holding the security.")
    rows = db.query(ChamaLoanSecurity).filter(ChamaLoanSecurity.member_id == m.id, ChamaLoanSecurity.status == "held",
                                              ChamaLoanSecurity.loan_id.isnot(None)).with_for_update().all()
    if not rows: raise HTTPException(409, "There is no security to give back.")
    for r in rows: r.status, r.released_at = "released", now()
    if m.linked_rider_id:
        notify(db, "rider", m.linked_rider_id, "security_released", "Your security is returned",
               "Your loan is cleared and your security has been given back.", "group_member", m.id)
    db.commit(); return {"ok": True, "released": len(rows)}

# ---- Group Finance History & Statements: read-only views of the ledger ----
# Ledger entry types by Chama model. A Chama runs ONE model, so a group normally has only one of these.
TB_TYPES = ("contribution", "loan_disbursement", "loan_repayment_principal", "loan_repayment_interest")
MGR_TYPES = ("mgr_contribution", "mgr_payout")

@router.get("/history")
def history(date_from: Optional[date] = None, date_to: Optional[date] = None,
            entry_type: Optional[str] = Query(None, description="One type, or several separated by commas"),
            model: Optional[Literal["tb", "mgr"]] = None,
            member_id: Optional[RowId] = None, circle_id: Optional[RowId] = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
            group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g = _my_group(db, rider, group_id=group_id)
    q = db.query(ChamaLedger, GroupMember).outerjoin(GroupMember, GroupMember.id == ChamaLedger.member_id)\
          .filter(ChamaLedger.group_id == g.id)
    if date_from: q = q.filter(ChamaLedger.posted_at >= date_from)
    if date_to: q = q.filter(ChamaLedger.posted_at < date_to + timedelta(days=1))
    if entry_type:
        types = [t.strip() for t in entry_type.split(",") if t.strip()]
        q = q.filter(ChamaLedger.entry_type.in_(types))
    if model: q = q.filter(ChamaLedger.entry_type.in_(TB_TYPES if model == "tb" else MGR_TYPES))
    if member_id: q = q.filter(ChamaLedger.member_id == member_id)
    if circle_id: q = q.filter(ChamaLedger.circle_id == circle_id)
    total = q.count()
    rows = q.order_by(ChamaLedger.posted_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    sums = {d: sum(Decimal(l.amount) for l, _ in q.filter(ChamaLedger.direction == d).all()) for d in ("in", "out")}
    present = {t for (t,) in db.query(ChamaLedger.entry_type).filter(ChamaLedger.group_id == g.id).distinct()}
    models = [m for m, ts in (("tb", TB_TYPES), ("mgr", MGR_TYPES)) if present & set(ts)]   # which model chips make sense
    return {"total": total, "page": page, "page_size": page_size, "money_in": sums["in"], "money_out": sums["out"],
            "models": models,
            "items": [{"id": str(l.id), "type": l.entry_type, "direction": l.direction, "amount": l.amount,
                       "member": m.full_name if m else None, "posted_at": l.posted_at.isoformat()} for l, m in rows]}

@router.get("/statement")
def statement(date_from: date, date_to: date, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    if date_to < date_from: raise HTTPException(422, "End date is before start date.")
    g = _my_group(db, rider, group_id=group_id); cfg = _cfg(db, g)
    rng = [ChamaLedger.group_id == g.id, ChamaLedger.posted_at >= date_from,
           ChamaLedger.posted_at < date_to + timedelta(days=1)]
    per = {}
    for l, m in db.query(ChamaLedger, GroupMember).join(GroupMember, GroupMember.id == ChamaLedger.member_id).filter(*rng):
        r = per.setdefault(str(m.id), {"member": m.full_name, "phone": mask_phone(m.phone), "contributions": ZERO,
                                       "loans_taken": ZERO, "repaid": ZERO, "received": ZERO})
        a = Decimal(l.amount)
        if l.entry_type == "contribution": r["contributions"] += a
        elif l.entry_type == "loan_disbursement": r["loans_taken"] += a
        elif l.entry_type == "mgr_payout": r["received"] += a
        elif l.entry_type == "mgr_contribution": r["contributions"] += a
        else: r["repaid"] += a
    ref = new_ref("GST")
    db.add(ChamaStatementLog(reference=ref, group_id=g.id, generated_by_rider_id=rider.id,
                             period_start=date_from, period_end=date_to))
    db.commit()
    return {"reference": ref, "group": g.group_name, "group_code": g.group_code, "from": date_from, "to": date_to,
            "members": list(per.values()), "pool_now": pool_cash(db, g.id, cfg),
            "totals": {k: sum(r[k] for r in per.values()) for k in ("contributions", "loans_taken", "repaid", "received")}}