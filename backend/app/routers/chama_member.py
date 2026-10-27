# backend/app/routers/chama_member.py
"""Rider side of a Chama: My Savings, My Loans, paying contributions and repayments, loan security and guarantees.

A rider can belong to SEVERAL groups at once (Merry-Go-Round and Table Banking, run by different Treasurers).
Every route that depends on a group takes an optional ?group_id=. Without it the rider's oldest matching membership is used,
so older app versions keep working."""
from datetime import date
from uuid import UUID as RowId   # NOT "UUID": star-imports of the models bring SQLAlchemy's UUID column type into scope
from decimal import Decimal
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_rider
from app.models.rider import Rider
from app.models.boda_group import BodaGroup, GroupMember
from app.models.chama_finance import *
from app.services.chama_finance_service import *
from app.services.group_member_link_service import mask_phone
from app.services.group_roles import approvers, treasurer_groups, invited_groups
from app.services.notification_service import notify, complete
from app.services import mgr_engine as eng, mgr_schedule as sch, tb_security as tbs

router = APIRouter(prefix="/chama/me", tags=["chama-member"])
GID = Query(None, description="Which group, when the rider belongs to several. Omit for the first one.")

class PayIn(BaseModel):
    amount: Decimal = Field(gt=0, le=1000000, decimal_places=2)
    method: Literal["cash", "mpesa"]
    channel: Optional[Literal["treasurer", "paybill"]] = None
    circle_id: Optional[RowId] = None            # Merry-Go-Round: which circle the money is for (optional when there is only one)

class SecurityIn(BaseModel):
    kind: Literal["savings", "logbook", "title", "chattel", "guarantor"]
    value: Decimal = Field(gt=0, le=100000000, decimal_places=2)
    description: Optional[str] = Field(default=None, max_length=120)
    ref: Optional[str] = Field(default=None, max_length=60)
    guarantor_member_id: Optional[RowId] = None
    guarantor_form: Optional[Literal["savings", "title", "logbook", "chattel"]] = None

class LoanAppIn(BaseModel):
    amount: Decimal = Field(gt=0, le=10000000, decimal_places=2)
    months: int = Field(ge=1, le=12)
    purpose: Optional[str] = Field(default=None, max_length=80)
    securities: list[SecurityIn] = []

def _cfg_of(db, m):
    return db.get(ChamaConfig, m.group_id)

def _ctx(db, rider, kind=None, group_id=None):
    """The rider's membership (in one group), that group and its settings."""
    found, in_group = None, False
    for m in members_for_rider(db, rider.id):
        if group_id is not None and m.group_id != group_id: continue
        in_group = True
        cfg = _cfg_of(db, m)
        if kind and not (cfg and cfg.chama_type == kind): continue
        found = (m, cfg); break
    if not found:
        if group_id is not None and in_group: raise HTTPException(409, "This is not available for your group.")
        if group_id is not None: raise HTTPException(404, "You are not a member of that group.")
        if kind and members_for_rider(db, rider.id): raise HTTPException(409, "This is not available for your group.")
        raise HTTPException(404, "Ask your Treasurer to add your bike registration number to the group.")
    m, cfg = found
    g = db.get(BodaGroup, m.group_id)
    if not cfg: raise HTTPException(409, "Your group has not finished set-up yet.")
    return m, g, cfg

def _channel(b: PayIn):
    if b.method == "cash": return None
    if b.channel == "paybill": raise HTTPException(422, "Paybill is not available yet. Send to the Treasurer's number.")
    return "treasurer"

def _membership_row(db, m):
    g = db.get(BodaGroup, m.group_id); cfg = _cfg_of(db, m)
    return {"member_id": str(m.id), "group_id": str(g.id), "group_name": g.group_name, "group_code": None,
            "group_type": cfg.chama_type if cfg else g.group_type, "group_active": g.status == "active",
            "treasurer": {"name": g.treasurer_name, "phone": g.treasurer_phone}}

# ───────────────────────────── profile / groups ─────────────────────────────
@router.get("/profile")
def profile(db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Drives the Home tiles and the tabs.

    memberships        every active group the rider belongs to (Merry-Go-Round and Table Banking, any Treasurer).
    treasurer_groups   every group the rider is the registered Treasurer of  -> Manage Chama tabs.
    treasurer_invites  groups whose Treasurer phone is this rider's phone and that have no Treasurer yet -> the
                       "Click here to Enter your Chama Code" card. The server decides, never the rider. The code is NOT included.
    has_group (and the first group's fields) are kept for older app versions.
    """
    rows = [_membership_row(db, m) for m in members_for_rider(db, rider.id)]
    live = [r for r in rows if r["group_active"] and r["group_type"]]
    tgs = treasurer_groups(db, rider)
    inv = invited_groups(db, rider)
    first = live[0] if live else None
    return {"has_group": bool(live), "group_type": first["group_type"] if first else None,
            "group_name": first["group_name"] if first else (rows[0]["group_name"] if rows else None),
            "group_active": bool(live),
            "memberships": rows,
            "has_mgr": any(r["group_type"] == "mgr" for r in live), "has_tb": any(r["group_type"] == "tb" for r in live),
            "is_treasurer": bool(tgs),
            "treasurer_groups": [{"group_id": str(g.id), "group_name": g.group_name,
                                  "group_type": (db.get(ChamaConfig, g.id).chama_type if db.get(ChamaConfig, g.id) else g.group_type),
                                  "status": g.status} for g in tgs],
            "treasurer_invite": bool(inv), "treasurer_invite_group": inv[0].group_name if inv else None,
            "treasurer_invites": [{"group_id": str(g.id), "group_name": g.group_name, "group_type": g.group_type} for g in inv]}

@router.get("/groups")
def my_groups(db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    return [_membership_row(db, m) for m in members_for_rider(db, rider.id)]

# ───────────────────────────── My Savings (all my groups) ─────────────────────────────
@router.get("/savings")
def my_savings(db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """One card per group: Table Banking savings, or the circles of a Merry-Go-Round with what I have put in this cycle."""
    from app.routers.chama_mgr import _my_circle_view
    out, total_tb, total_mgr = [], ZERO, ZERO
    for m in members_for_rider(db, rider.id):
        g = db.get(BodaGroup, m.group_id); cfg = _cfg_of(db, m)
        if not cfg or g.status != "active": continue
        row = {"group_id": str(g.id), "group_name": g.group_name, "group_type": cfg.chama_type, "member_id": str(m.id),
               "treasurer": {"name": g.treasurer_name, "phone": g.treasurer_phone}}
        if cfg.chama_type == "tb":
            b = borrowing(db, m, cfg); cat = db.get(ChamaCategory, m.category_id) if m.category_id else None
            pend = db.query(ChamaContribution).filter_by(member_id=m.id, status="pending").all()
            row.update({"savings": b["savings"], "locked": tbs.locked_savings(db, m.id), "free": tbs.free_savings(db, m),
                        "category": cat and {"freq": cat.freq, "amount": cat.amount},
                        "pending_total": sum((Decimal(c.amount) for c in pend), ZERO)})
            total_tb += Decimal(b["savings"])
        else:
            circles = [v for c in eng.circles_of(db, g.id) if (v := _my_circle_view(db, g, m, c))]
            row["circles"] = circles
            total_mgr += sum((Decimal(c["saved_this_cycle"]) for c in circles), ZERO)
        out.append(row)
    return {"groups": out, "totals": {"table_banking": total_tb, "merry_go_round_this_cycle": total_mgr}}

# ───────────────────────────── Table Banking summary (savings + loan of ONE group) ─────────────────────────────
def _security_given(db, m, loan=None):
    q = db.query(ChamaLoanSecurity).filter(ChamaLoanSecurity.member_id == m.id, ChamaLoanSecurity.status.in_(tbs.LIVE))
    return [tbs.row_view(db, r) for r in q.order_by(ChamaLoanSecurity.created_at)]

def _app_view(db, g, a):
    rows = db.query(ChamaLoanSecurity).filter_by(application_id=a.id).order_by(ChamaLoanSecurity.created_at).all()
    return {"id": str(a.id), "reference": a.reference, "amount": a.amount, "months": a.months, "purpose": a.purpose,
            "interest": a.interest, "total": a.total, "installment": a.installment, "status": a.status,
            "security": tbs.status_of(db, g, a), "securities": [tbs.row_view(db, r) for r in rows]}

@router.get("/summary")
def summary(group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    m, g, cfg = _ctx(db, rider, "tb", group_id)
    cat = db.get(ChamaCategory, m.category_id) if m.category_id else None
    b = borrowing(db, m, cfg); loan = active_loan(db, m.id)
    int_paid = interest_paid(db, loan.id) if loan else ZERO
    pend = db.query(ChamaContribution).filter_by(member_id=m.id, status="pending").all()
    app = db.query(ChamaLoanApplication).filter_by(member_id=m.id, status="pending").first()
    hist = db.query(ChamaContribution).filter_by(member_id=m.id).order_by(ChamaContribution.submitted_at.desc()).limit(30).all()
    pays = db.query(ChamaLoanPayment).filter_by(member_id=m.id).order_by(ChamaLoanPayment.submitted_at.desc()).limit(30).all()
    sec = tbs.sec_of(db, g.id)
    return {"group_id": str(g.id), "group": g.group_name, "treasurer": {"name": g.treasurer_name, "phone": g.treasurer_phone},
        "category": cat and {"freq": cat.freq, "amount": cat.amount},
        "rules": {"rate": cfg.interest_rate_pct, "multiple": cfg.max_loan_multiple,
                  "max_months": cfg.max_loan_months, "min_amount": cfg.min_loan_amount,
                  "meeting": {"week": cfg.meeting_week, "day": cfg.meeting_day, "cycle_month": cfg.cycle_month}},
        "security_rules": tbs.sec_dict(sec),
        "opening": {"savings": m.opening_savings},
        "eligibility": eligibility(db, m, cfg, g),
        "savings": b["savings"], "locked": tbs.locked_savings(db, m.id), "free": tbs.free_savings(db, m),
        "savings_pledge_max": tbs.savings_pledge_max(db, m, sec),
        "limit": b["limit"], "available": b["available"],
        "pending_contributions_total": sum((Decimal(c.amount) for c in pend), ZERO),
        "loan": loan and {"reference": loan.reference, "principal": loan.principal, "interest": loan.interest,
            "total": loan.total, "paid": loan.paid, "balance": loan.total - loan.paid,
            "installment": loan.installment, "months": loan.months, "migrated": loan.is_migrated,
            "due_date": loan.due_date.isoformat() if loan.due_date else None,
            "overdue": bool(loan.due_date and loan.due_date < date.today() and loan.total > loan.paid),
            "interest_balance": loan.interest - int_paid,
            "principal_balance": (loan.total - loan.paid) - (loan.interest - int_paid)},
        "pending_application": app and _app_view(db, g, app),
        "security_given": _security_given(db, m),
        "contributions": [{"id": str(c.id), "amount": c.amount, "method": c.method, "status": c.status,
            "reason": c.reject_reason, "at": c.submitted_at.isoformat()} for c in hist],
        "payments": [{"id": str(p.id), "amount": p.amount, "method": p.method, "status": p.status,
            "reason": p.reject_reason, "at": p.submitted_at.isoformat()} for p in pays]}

@router.get("/loans")
def my_loans(db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """My Loans tile: one entry per Table Banking group the rider belongs to (Table Banking 1, 2 ...)."""
    out = []
    for m in members_for_rider(db, rider.id):
        cfg = _cfg_of(db, m); g = db.get(BodaGroup, m.group_id)
        if not cfg or cfg.chama_type != "tb" or g.status != "active": continue
        loan = active_loan(db, m.id)
        app = db.query(ChamaLoanApplication).filter_by(member_id=m.id, status="pending").first()
        el = eligibility(db, m, cfg, g)
        out.append({"group_id": str(g.id), "group_name": g.group_name, "member_id": str(m.id),
                    "loan": loan and {"reference": loan.reference, "balance": loan.total - loan.paid, "installment": loan.installment,
                                      "due_date": loan.due_date.isoformat() if loan.due_date else None},
                    "pending_application": app and _app_view(db, g, app),
                    "available": el["available"], "eligible": el["eligible"], "savings": el["savings"]})
    return {"groups": out}

@router.get("/group-loans")
def group_loans(group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Who in my Table Banking group is borrowing (names, balances and due dates) so members can see the fund working."""
    m, g, cfg = _ctx(db, rider, "tb", group_id)
    rows = db.query(ChamaLoan, GroupMember).join(GroupMember, GroupMember.id == ChamaLoan.member_id)\
             .filter(ChamaLoan.group_id == g.id, ChamaLoan.status == "active").order_by(ChamaLoan.disbursed_at).all()
    return {"group": g.group_name, "pool": pool_cash(db, g.id, cfg),
            "loans": [{"member": x.full_name, "mine": x.id == m.id, "principal": l.principal, "balance": l.total - l.paid,
                       "due_date": l.due_date.isoformat() if l.due_date else None,
                       "overdue": bool(l.due_date and l.due_date < date.today())} for l, x in rows]}

# ───────────────────────────── paying in ─────────────────────────────
@router.post("/contributions", status_code=201)
def pay_contribution(b: PayIn, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    m, g, cfg = _ctx(db, rider, None, group_id)
    if g.status != "active": raise HTTPException(403, "This group is inactive.")
    who = approvers(db, g, rider.id)                     # the group's Treasurer
    round_id, label = None, ""
    if cfg.chama_type == "mgr":
        circles = []
        for c in eng.circles_of(db, g.id):
            if any(mm.id == m.id for _, mm in eng.hands_of(db, c)) and eng.open_round(db, c): circles.append(c)
        if b.circle_id: circles = [c for c in circles if c.id == b.circle_id]
        if not circles: raise HTTPException(409, "No round is open yet. Ask your Treasurer to start the Merry-Go-Round.")
        if len(circles) > 1: raise HTTPException(422, "Choose which circle this payment is for.")
        c = circles[0]; rnd = eng.open_round(db, c, lock=True)
        owes = eng.member_owes(db, c, rnd, m.id)
        if owes <= 0: raise HTTPException(409, "It is your turn to receive. You do not contribute this round.")
        paid = mgr_paid_by_member(db, rnd.id).get(m.id, ZERO)
        pend = sum((Decimal(x.amount) for x in db.query(ChamaContribution).filter_by(
                    round_id=rnd.id, member_id=m.id, status="pending")), ZERO)
        left = owes - paid - pend
        if left <= 0: raise HTTPException(409, "You have already paid for this round.")
        if b.amount > left: raise HTTPException(422, f"The most you can pay this round is KSh {left:,.0f}.")
        round_id, label = rnd.id, f" ({c.name})"
    c_ = ChamaContribution(reference=new_ref("CSH" if b.method == "cash" else "TRS"), group_id=g.id, member_id=m.id,
                           amount=b.amount, method=b.method, channel=_channel(b), round_id=round_id)
    db.add(c_); db.flush()
    for rid_ in who:
        notify(db, "rider", rid_, "contribution_pending", "Contribution to confirm",
               f"{m.full_name} paid KSh {b.amount:,.0f}{label} ({'cash' if b.method == 'cash' else 'M-Pesa'}).", "contribution", c_.id)
    db.commit()
    return {"id": str(c_.id), "reference": c_.reference, "status": "pending"}

# ───────────────────────────── loans, security, guarantors ─────────────────────────────
@router.post("/loan-applications", status_code=201)
def apply_loan(b: LoanAppIn, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    m, g, cfg = _ctx(db, rider, "tb", group_id)
    who = approvers(db, g, rider.id)
    if active_loan(db, m.id): raise HTTPException(409, "You already have an active loan.")
    if db.query(ChamaLoanApplication.id).filter_by(member_id=m.id, status="pending").first():
        raise HTTPException(409, "You already have an application awaiting your Treasurer.")
    if b.months > cfg.max_loan_months: raise HTTPException(422, f"Maximum repayment period is {cfg.max_loan_months} months.")
    if b.amount < cfg.min_loan_amount: raise HTTPException(422, f"Minimum loan is KSh {cfg.min_loan_amount:,.0f}.")
    el = eligibility(db, m, cfg, g)
    if cfg.min_contributions_for_loan and el["confirmed_contributions"] < cfg.min_contributions_for_loan:
        raise HTTPException(422, f"You need at least {cfg.min_contributions_for_loan} confirmed contributions before borrowing.")
    av = borrowing(db, m, cfg)["available"]
    if b.amount > av: raise HTTPException(422, f"That is above your available limit of KSh {av:,.0f}.")
    sec = tbs.sec_of(db, g.id)
    need = tbs.required(sec, b.amount)
    rows = tbs.validate_offers(db, g, m, b.amount, b.securities)
    offered = sum((tbs.counted(sec, r.kind, r.value, r.guarantor_form) for r in rows), ZERO)     # guarantors count toward the cover
    if need and offered < need:
        raise HTTPException(422, f"Your group asks for security worth KSh {need:,.0f}. Add KSh {need - offered:,.0f} more.")
    interest, total, inst = calc_loan(b.amount, b.months, cfg.interest_rate_pct)
    a = ChamaLoanApplication(reference=new_ref("TBA"), group_id=g.id, member_id=m.id, amount=b.amount,
        months=b.months, purpose=b.purpose, rate_pct=cfg.interest_rate_pct, interest=interest, total=total, installment=inst)
    db.add(a); db.flush()
    for r in rows: r.application_id = a.id; db.add(r)
    db.flush()
    for r in rows:
        if r.kind == "guarantor":
            gm = db.get(GroupMember, r.guarantor_member_id)
            notify(db, "rider", gm.linked_rider_id, "guarantee_request", "Will you back a loan?",
                   f"{m.full_name} asks you to back a loan of KSh {b.amount:,.0f} with KSh {r.value:,.0f}. Open Guarantee requests to say yes.",
                   "loan_security", r.id)
    if not any(r.kind == "guarantor" for r in rows):         # nothing to wait for: the Treasurer can start straight away
        for rid_ in who:
            notify(db, "rider", rid_, "loan_request_pending", "Loan request to review",
                   f"{m.full_name} requests KSh {b.amount:,.0f} for {b.months} month(s).", "loan_application", a.id)
    db.commit()
    return {"id": str(a.id), "status": "pending", "security": tbs.status_of(db, g, a)}

@router.get("/loan-applications/{aid}")
def get_application(aid: RowId, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    a = db.get(ChamaLoanApplication, aid)
    m = db.get(GroupMember, a.member_id) if a else None
    if not a or not m or m.linked_rider_id != rider.id: raise HTTPException(404, "Application not found.")
    return _app_view(db, db.get(BodaGroup, a.group_id), a)

@router.post("/loan-applications/{aid}/cancel")
def cancel_loan_app(aid: RowId, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    a0 = db.get(ChamaLoanApplication, aid)
    m = db.get(GroupMember, a0.member_id) if a0 else None
    if not a0 or not m or m.linked_rider_id != rider.id: raise HTTPException(404, "Application not found.")
    a = db.query(ChamaLoanApplication).filter_by(id=aid, member_id=m.id, status="pending").with_for_update().first()
    if not a: raise HTTPException(409, "This application can no longer be cancelled.")
    a.status = "cancelled"; complete(db, "loan_application", a.id, "cancelled")
    for r in db.query(ChamaLoanSecurity).filter_by(application_id=a.id): complete(db, "loan_security", r.id, "cancelled")
    tbs.release_if_open(db, a.id, "withdrawn")
    db.commit()
    return {"ok": True}

@router.get("/guarantor-candidates")
def guarantor_candidates(group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Other members of MY Table Banking group who can say yes to a guarantee (they must have signed in).
    Only a name and the last 3 characters of the bike number are shown: riders cannot browse the member list."""
    m, g, cfg = _ctx(db, rider, "tb", group_id)
    rows = db.query(GroupMember).filter(GroupMember.group_id == g.id, GroupMember.status == "active",
                                        GroupMember.id != m.id, GroupMember.linked_rider_id.isnot(None))\
             .order_by(GroupMember.full_name).all()
    return [{"member_id": str(x.id), "name": x.full_name, "phone_hint": mask_phone(x.phone)} for x in rows]

@router.get("/guarantee-requests")
def guarantee_requests(status: str = "waiting_guarantor", db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Requests from members of my groups asking ME to back their loan."""
    mine = [m.id for m in members_for_rider(db, rider.id)]
    if not mine: return []
    q = db.query(ChamaLoanSecurity, GroupMember).join(GroupMember, GroupMember.id == ChamaLoanSecurity.member_id)\
          .filter(ChamaLoanSecurity.guarantor_member_id.in_(mine), ChamaLoanSecurity.kind == "guarantor")
    q = q.filter(ChamaLoanSecurity.status == status) if status != "all" else q
    out = []
    for r, b in q.order_by(ChamaLoanSecurity.created_at.desc()).all():
        app = db.get(ChamaLoanApplication, r.application_id)
        out.append({"id": str(r.id), "borrower": b.full_name, "group": db.get(BodaGroup, r.group_id).group_name,
                    "group_id": str(r.group_id), "loan_amount": app.amount if app else None, "months": app.months if app else None,
                    "value": r.value, "form": r.guarantor_form, "status": r.status,
                    "my_free_savings": tbs.guarantee_capacity(db, db.get(GroupMember, r.guarantor_member_id)),
                    "at": r.created_at.isoformat()})
    return out

def _my_guarantee(db, rider, rid):
    r = db.query(ChamaLoanSecurity).filter_by(id=rid, kind="guarantor").with_for_update().first()
    gm = db.get(GroupMember, r.guarantor_member_id) if r else None
    if not r or not gm or gm.linked_rider_id != rider.id: raise HTTPException(404, "Request not found.")
    if r.status != "waiting_guarantor": raise HTTPException(409, "You have already answered this request.")
    app = db.get(ChamaLoanApplication, r.application_id)
    if not app or app.status != "pending":
        r.status = "withdrawn"; db.commit(); raise HTTPException(409, "This loan request is no longer open.")
    return r, gm, app

@router.post("/guarantee-requests/{rid}/accept")
def accept_guarantee(rid: RowId, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    r, gm, app = _my_guarantee(db, rider, rid)
    if r.guarantor_form == "savings":
        cap = tbs.guarantee_capacity(db, gm)
        if Decimal(r.value) > cap:
            if tbs.loan_balance(db, gm.id) > 0:
                raise HTTPException(409, f"You have a running loan, so you can only back this with savings above your remaining loan balance. You can back at most KSh {cap:,.0f}.")
            raise HTTPException(409, f"You can back this with at most KSh {cap:,.0f} of free savings.")
    r.status, r.answered_at = "submitted", now_()
    complete(db, "loan_security", r.id, "decided")
    b = db.get(GroupMember, r.member_id); g = db.get(BodaGroup, r.group_id)
    if b.linked_rider_id:
        notify(db, "rider", b.linked_rider_id, "guarantee_accepted", "Guarantor said yes",
               f"{gm.full_name} agreed to back your loan.", "loan_application", app.id)
    waiting = db.query(ChamaLoanSecurity).filter_by(application_id=app.id, status="waiting_guarantor").count()
    if not waiting:                                          # every guarantor has answered: now the Treasurer can start checking
        for rid_ in approvers(db, g, b.linked_rider_id):
            notify(db, "rider", rid_, "loan_request_pending", "Loan request to review",
                   f"{b.full_name} requests KSh {app.amount:,.0f} for {app.months} month(s). Guarantors have said yes.", "loan_application", app.id)
    db.commit()
    return {"ok": True}

@router.post("/guarantee-requests/{rid}/decline")
def decline_guarantee(rid: RowId, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """A guarantor may say no. The borrower is told and can add someone else or cancel."""
    r, gm, app = _my_guarantee(db, rider, rid)
    r.status, r.answered_at = "declined", now_()
    complete(db, "loan_security", r.id, "decided")
    b = db.get(GroupMember, r.member_id)
    if b.linked_rider_id:
        notify(db, "rider", b.linked_rider_id, "guarantee_declined", "A guarantor said no",
               f"{gm.full_name} cannot back your loan. Add another guarantor or add other security.", "loan_application", app.id)
    db.commit()
    return {"ok": True}

@router.post("/loan-applications/{aid}/securities", status_code=201)
def add_security(aid: RowId, b: SecurityIn, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Add more security (or replace a guarantor who said no) while the application is still waiting."""
    a0 = db.get(ChamaLoanApplication, aid); m = db.get(GroupMember, a0.member_id) if a0 else None
    if not a0 or not m or m.linked_rider_id != rider.id: raise HTTPException(404, "Application not found.")
    a = db.query(ChamaLoanApplication).filter_by(id=aid, status="pending").with_for_update().first()
    if not a: raise HTTPException(409, "This application is no longer open.")
    g = db.get(BodaGroup, a.group_id)
    existing = db.query(ChamaLoanSecurity).filter_by(application_id=a.id).all()
    rows = tbs.validate_offers(db, g, m, a.amount, [b], existing)
    for r in rows:
        r.application_id = a.id; db.add(r); db.flush()
        if r.kind == "guarantor":
            gm = db.get(GroupMember, r.guarantor_member_id)
            notify(db, "rider", gm.linked_rider_id, "guarantee_request", "Will you back a loan?",
                   f"{m.full_name} asks you to back a loan of KSh {a.amount:,.0f} with KSh {r.value:,.0f}.", "loan_security", r.id)
    db.commit()
    return _app_view(db, g, a)

@router.post("/loan-payments", status_code=201)
def pay_loan(b: PayIn, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    m, g, cfg = _ctx(db, rider, "tb", group_id)
    who = approvers(db, g, rider.id)
    loan = active_loan(db, m.id)
    if not loan: raise HTTPException(409, "You have no active loan.")
    bal = loan.total - loan.paid
    pending = sum((Decimal(p.amount) for p in db.query(ChamaLoanPayment).filter_by(loan_id=loan.id, status="pending")), ZERO)
    if b.amount < 100: raise HTTPException(422, "The minimum repayment is KSh 100.")
    if b.amount + pending > bal: raise HTTPException(422, f"That is more than your remaining balance of KSh {bal - pending:,.0f}.")
    p = ChamaLoanPayment(reference=new_ref("CSH" if b.method == "cash" else "TRS"), loan_id=loan.id,
        group_id=g.id, member_id=m.id, amount=b.amount, method=b.method, channel=_channel(b))
    db.add(p); db.flush()
    for rid_ in who:
        notify(db, "rider", rid_, "loan_payment_pending", "Loan repayment to confirm",
               f"{m.full_name} paid KSh {b.amount:,.0f} towards {loan.reference}.", "loan_payment", p.id)
    db.commit()
    return {"id": str(p.id), "reference": p.reference, "status": "pending"}

def now_():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)
