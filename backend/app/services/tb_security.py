# backend/app/services/tb_security.py
"""Table Banking loan security and guarantors, configurable per group (chama_tb_security).

Use case in one line: security is what a borrower puts up so the group's money is safe. The app records what was put up,
who has checked it, and gives it back when the loan is repaid.

Kinds       savings (the borrower's own locked savings) | logbook | title (land title deed) | chattel (household item) |
            guarantor (another member of the SAME group who vouches, with their savings, logbook, title or item)
Statuses    waiting_guarantor -> submitted -> held -> released     (declined / withdrawn end a pledge early)
Rules       * security is OFF until the Treasurer picks a preset (None | Savings only | Assets) or sets the mode:
                none      nothing is asked and nothing can be offered
                optional  a borrower may offer security, but none is needed
                required  loans at or above `from_amount` need cover worth `cover_pct`% of the loan
              Savings count in full; logbook / title / household item count at `haircut_pct`% of their value;
            * ONE ITEM SECURES ONE LOAN: an item (by its number) cannot be put up twice while it is held;
            * GUARANTORS are a separate, OPTIONAL block (guar_on). They are never mandatory and have no minimum. When the group
              allows them, a guarantor's backing counts toward the cover like any other security;
            * a guarantor must say yes first; the Treasurer then checks and HOLDS each item;
            * a loan cannot be approved until everything offered is held and the cover is reached;
            * the Treasurer gives the security back once the loan is cleared.
"""
import math
from decimal import Decimal, ROUND_DOWN
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.boda_group import GroupMember
from app.models.chama_finance import ChamaTbSecurity, ChamaLoanSecurity, ChamaLoan
from app.services.chama_finance_service import savings_of, ZERO

KINDS = ("savings", "logbook", "title", "chattel", "guarantor")
LIVE = ("waiting_guarantor", "submitted", "held")            # statuses that still count as "put up"

# What each preset switches on. Guarantors are NOT part of a preset: they are their own optional block.
PRESETS = {
    "none":    dict(mode="none"),
    "savings": dict(mode="required", savings_on=True, allow_title=False, allow_logbook=False, allow_chattel=False),
    "assets":  dict(mode="required", savings_on=True, allow_title=True, allow_logbook=True, allow_chattel=True),
}
PRESET_FIELDS = ("mode", "savings_on", "allow_title", "allow_logbook", "allow_chattel")

def preset_of(s) -> str:
    """Which preset the saved rules match ("custom" when none does)."""
    cur = {k: getattr(s, k) for k in PRESET_FIELDS}
    for name, p in PRESETS.items():
        want = {**{"mode": "none"}, **p}
        if name == "none":
            if s.mode == "none": return "none"
        elif all(cur[k] == v for k, v in p.items()) and cur["mode"] == "required": return name
    return "custom"

def apply_preset(s, name):
    if name not in PRESETS: raise HTTPException(422, "Choose None, Savings only or Assets.")
    for k, v in PRESETS[name].items(): setattr(s, k, v)

def sec_of(db: Session, group_id) -> ChamaTbSecurity:
    s = db.get(ChamaTbSecurity, group_id)
    if s: return s
    return ChamaTbSecurity(group_id=group_id, mode="none", from_amount=0, haircut_pct=70, cover_pct=100, savings_on=True, savings_pct=100,
                           allow_title=False, allow_logbook=False, allow_chattel=False, guar_on=False, guar_max=1,
                           guar_savings=True, guar_title=False, guar_logbook=False, guar_chattel=False, keeper="Treasurer",
                           valuation="Treasurer and one official", verify="Check the original document or serial number",
                           release_rule="Released when the loan is fully repaid")

def sec_dict(s: ChamaTbSecurity) -> dict:
    return {"mode": s.mode, "mandatory": s.mode == "required", "preset": preset_of(s), "from_amount": s.from_amount,
            "haircut_pct": s.haircut_pct, "cover_pct": s.cover_pct,
            "savings": {"on": bool(s.savings_on), "pct": s.savings_pct},
            "cats": {"title": bool(s.allow_title), "logbook": bool(s.allow_logbook), "chattel": bool(s.allow_chattel)},
            "guar": {"on": bool(s.guar_on), "max": s.guar_max,
                     "forms": {"savings": bool(s.guar_savings), "title": bool(s.guar_title),
                               "logbook": bool(s.guar_logbook), "chattel": bool(s.guar_chattel)}},
            "keeper": s.keeper, "valuation": s.valuation, "verify": s.verify, "release": s.release_rule,
            "allowed": allowed_kinds(s)}

def allowed_kinds(s) -> list:
    a = []
    if s.mode == "none": return a                                  # security is off: nothing can be offered
    if s.savings_on: a.append("savings")
    if s.allow_logbook: a.append("logbook")
    if s.allow_title: a.append("title")
    if s.allow_chattel: a.append("chattel")
    if s.guar_on and s.guar_max > 0: a.append("guarantor")
    return a

def required(s, amount) -> Decimal:
    """Security worth at least this much (0 when the group does not insist on it, or the loan is below the threshold)."""
    if s.mode != "required" or Decimal(amount) < Decimal(s.from_amount or 0): return ZERO
    return Decimal(math.ceil(Decimal(amount) * s.cover_pct / 100))

def counted(s, kind, value, form=None) -> Decimal:
    """What an item is worth toward the cover. Savings (the borrower's, or a guarantor's savings) count in full;
    a logbook, title or household item counts at haircut_pct% of its value."""
    v = Decimal(value)
    saving = kind == "savings" or (kind == "guarantor" and (form or "savings") == "savings")
    return v if saving else (v * (s.haircut_pct or 100) / 100).quantize(Decimal("1"), rounding=ROUND_DOWN)

def item_in_use(db, group_id, ref, exclude_ids=()):
    """ONE ITEM SECURES ONE LOAN: is this item (logbook / title / serial number) already put up in the group?"""
    ref = (ref or "").strip().upper()
    if not ref: return None
    q = db.query(ChamaLoanSecurity).filter(ChamaLoanSecurity.group_id == group_id, func.upper(ChamaLoanSecurity.ref) == ref,
                                           ChamaLoanSecurity.status.in_(LIVE))
    return next((r for r in q.all() if r.id not in exclude_ids), None)

def locked_savings(db: Session, member_id) -> Decimal:
    """Savings a member cannot use for anything else: their own pledge, plus savings they have promised as a guarantor."""
    own = db.query(func.coalesce(func.sum(ChamaLoanSecurity.value), 0)).filter(
        ChamaLoanSecurity.member_id == member_id, ChamaLoanSecurity.kind == "savings",
        ChamaLoanSecurity.status.in_(("submitted", "held"))).scalar()
    guar = db.query(func.coalesce(func.sum(ChamaLoanSecurity.value), 0)).filter(
        ChamaLoanSecurity.guarantor_member_id == member_id, ChamaLoanSecurity.kind == "guarantor",
        ChamaLoanSecurity.guarantor_form == "savings", ChamaLoanSecurity.status.in_(("submitted", "held"))).scalar()
    return Decimal(own) + Decimal(guar)

def free_savings(db: Session, member) -> Decimal:
    return max(ZERO, savings_of(db, member.id) - locked_savings(db, member.id))

def loan_balance(db: Session, member_id) -> Decimal:
    """What a member still owes on their running loan (0 when they have none)."""
    loan = db.query(ChamaLoan).filter_by(member_id=member_id, status="active").first()
    return max(ZERO, Decimal(loan.total) - Decimal(loan.paid or 0)) if loan else ZERO

def guarantee_capacity(db: Session, member) -> Decimal:
    """Most savings a member can promise as a guarantor.
    No running loan  -> all their free savings.
    Running loan     -> only what is left after the remaining loan balance is taken off their available savings, so their
                        savings must be MORE than the balance (if savings <= balance, they can back nobody with savings)."""
    return max(ZERO, free_savings(db, member) - loan_balance(db, member.id))

def savings_pledge_max(db, member, s) -> Decimal:
    return (free_savings(db, member) * s.savings_pct / 100).quantize(Decimal("1"), rounding=ROUND_DOWN)

def validate_offers(db: Session, g, member, amount, offers, existing=()) -> list:
    """Check what a borrower wants to put up against the group's rules. Returns ChamaLoanSecurity rows (not yet added)."""
    s = sec_of(db, g.id); ok = allowed_kinds(s)
    live = [x for x in existing if x.status in LIVE]
    rows, new_savings, guar_n = [], ZERO, sum(1 for x in live if x.kind == "guarantor")
    guar_taken = {x.guarantor_member_id for x in live if x.kind == "guarantor"}
    seen_refs = set()
    for o in offers:
        if o.kind not in ok:
            raise HTTPException(422, "Your group does not accept that kind of security.")
        if o.value is None or Decimal(o.value) <= 0: raise HTTPException(422, "Enter the amount or what it is worth.")
        if o.kind == "savings":
            new_savings += Decimal(o.value)
            if new_savings > savings_pledge_max(db, member, s):
                raise HTTPException(422, f"You can lock at most KSh {savings_pledge_max(db, member, s):,.0f} of your savings.")
            rows.append(ChamaLoanSecurity(group_id=g.id, member_id=member.id, kind="savings", value=o.value,
                                          description="Locked until you finish paying", ref="", status="submitted"))
        elif o.kind in ("logbook", "title", "chattel"):
            if not (o.description or "").strip(): raise HTTPException(422, "Please fill in the details.")
            if not (o.ref or "").strip():
                raise HTTPException(422, {"logbook": "Please add the registration number from the logbook.", "title": "Please add the title deed number.",
                                          "chattel": "Please add the serial number."}[o.kind])
            if item_in_use(db, g.id, o.ref) or (o.ref.strip().upper() in seen_refs):
                raise HTTPException(409, "That item is already securing a loan. One item can secure one loan at a time.")
            seen_refs.add(o.ref.strip().upper())
            rows.append(ChamaLoanSecurity(group_id=g.id, member_id=member.id, kind=o.kind, value=o.value,
                                          description=o.description.strip()[:120], ref=(o.ref or "").strip()[:60], status="submitted"))
        else:                                                    # guarantor
            guar_n += 1
            if guar_n > s.guar_max: raise HTTPException(422, f"Your group allows at most {s.guar_max} guarantor(s).")
            gm = db.query(GroupMember).filter_by(id=o.guarantor_member_id, group_id=g.id, status="active").first()
            if not gm or gm.id == member.id: raise HTTPException(422, "Choose another member of your group as guarantor.")
            if gm.id in guar_taken: raise HTTPException(422, "You already asked that member.")
            if not gm.linked_rider_id: raise HTTPException(422, "That member has not signed in yet, so they cannot say yes.")
            form = o.guarantor_form or "savings"
            if form not in ("savings", "title", "logbook", "chattel") or not getattr(s, "guar_" + form):
                raise HTTPException(422, "Your group does not accept that kind of guarantee.")
            if form == "savings" and Decimal(o.value) > guarantee_capacity(db, gm):
                raise HTTPException(422, f"{gm.full_name.split(' ')[0]} can back you with at most KSh {guarantee_capacity(db, gm):,.0f}.")
            gref = (o.ref or "").strip()[:60]
            if form != "savings":
                if not gref: raise HTTPException(422, "Please add the number of the item your guarantor is putting up.")
                if item_in_use(db, g.id, gref) or gref.upper() in seen_refs:
                    raise HTTPException(409, "That item is already securing a loan. One item can secure one loan at a time.")
                seen_refs.add(gref.upper())
            guar_taken.add(gm.id)
            lbl = {"savings": "their savings", "logbook": "their logbook", "title": "their title deed", "chattel": "their household item"}[form]
            rows.append(ChamaLoanSecurity(group_id=g.id, member_id=member.id, kind="guarantor", value=o.value,
                        description=f"{gm.full_name} backs you with {lbl}", ref=gref if form != "savings" else "", guarantor_member_id=gm.id,
                        guarantor_form=form, status="waiting_guarantor"))
    return rows

def status_of(db: Session, g, application) -> dict:
    """Where an application stands on security. Drives the borrower's tracker and the Treasurer's approve button."""
    s = sec_of(db, g.id)
    rows = db.query(ChamaLoanSecurity).filter(ChamaLoanSecurity.application_id == application.id,
                                              ChamaLoanSecurity.status.in_(LIVE)).all()
    need = required(s, application.amount)
    cnt = lambda r: counted(s, r.kind, r.value, r.guarantor_form)
    held = sum((cnt(r) for r in rows if r.status == "held"), ZERO)          # guarantors' backing counts when held
    offered = sum((cnt(r) for r in rows), ZERO)
    waiting = [r for r in rows if r.status == "waiting_guarantor"]
    to_check = [r for r in rows if r.status == "submitted"]
    g_held = sum(1 for r in rows if r.kind == "guarantor" and r.status == "held")
    blockers = []
    if waiting: blockers.append(f"{len(waiting)} guarantor(s) have not said yes yet.")
    if to_check: blockers.append(f"{len(to_check)} item(s) of security still need to be checked and held.")
    if held < need: blockers.append(f"Security held counts for KSh {held:,.0f}; the group needs KSh {need:,.0f}.")
    return {"required": need, "offered": offered, "held": held, "waiting_guarantors": len(waiting),
            "to_check": len(to_check), "guarantors_held": g_held, "ok": not blockers, "blockers": blockers,
            "mandatory": s.mode == "required", "mode": s.mode}

def row_view(db, r: ChamaLoanSecurity) -> dict:
    gm = db.get(GroupMember, r.guarantor_member_id) if r.guarantor_member_id else None
    return {"id": str(r.id), "kind": r.kind, "description": r.description, "ref": r.ref, "value": r.value,
            "status": r.status, "guarantor": gm.full_name if gm else None, "guarantor_form": r.guarantor_form,
            "created_at": r.created_at.isoformat() if r.created_at else None}

def release_if_open(db, application_id, to_status, only_live=True):
    """Free everything tied to an application that did not become a loan (cancelled / rejected)."""
    from datetime import datetime, timezone
    for r in db.query(ChamaLoanSecurity).filter(ChamaLoanSecurity.application_id == application_id,
                                                ChamaLoanSecurity.status.in_(LIVE)):
        r.status = "released" if r.status == "held" else to_status
        r.released_at = datetime.now(timezone.utc)

def attach_to_loan(db, application_id, loan_id):
    for r in db.query(ChamaLoanSecurity).filter(ChamaLoanSecurity.application_id == application_id):
        r.loan_id = loan_id

def loan_cleared(db, row) -> bool:
    if not row.loan_id: return False
    loan = db.get(ChamaLoan, row.loan_id)
    return bool(loan and loan.status == "cleared")
