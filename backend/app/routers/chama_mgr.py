# backend/app/routers/chama_mgr.py
"""Merry-Go-Round: circles, people and turns, rounds, payouts and exceptions.
See services/mgr_engine.py for the rules."""
from typing import Literal, Optional
from uuid import UUID                  # request bodies
from uuid import UUID as RowId   # NOT "UUID": star-imports of the models bring SQLAlchemy's UUID column type into scope
from datetime import date, datetime, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, tuple_
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_rider
from app.models.rider import Rider
from app.models.boda_group import BodaGroup, GroupMember
from app.models.chama_finance import (ChamaConfig, ChamaContribution, ChamaMgrRound, ChamaMgrCircle,
                                      ChamaMgrHand, ChamaMgrException)
from app.services import mgr_schedule as sch
from app.services import mgr_engine as eng
from app.services.group_roles import actor_group
from app.services.chama_finance_service import members_for_rider, mgr_paid_by_member, ZERO

router = APIRouter(prefix="/chama/mgr", tags=["chama-mgr"])
GID = Query(None, description="Which group, when the rider runs or belongs to several. Omit for the first one.")

# ───────────────────────────── bodies ─────────────────────────────
class CircleIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=40)
    amount: Optional[Decimal] = Field(default=None, ge=0, le=1000000)   # (decimal_places on an Optional breaks pydantic 2.5, so it is checked below)
    sched: Optional[dict] = None                  # PAYOUT schedule (when the pool is paid out)
    contrib_sched: Optional[dict] = None          # when members contribute; {"type": "same"} = once per payout, as before
    recipient_pays: Optional[bool] = None         # does the person receiving the pool also contribute that round?
    treasurer_joins: Optional[bool] = None        # does the Treasurer also contribute and receive a payout?

    @field_validator("amount")
    @classmethod
    def _two_places(cls, v):
        if v is not None and v != v.quantize(Decimal("0.01")):
            raise ValueError("Use at most 2 decimal places.")
        return v

class PreviewIn(BaseModel):
    amount: Decimal = Field(ge=0, le=1000000)
    sched: dict
    contrib_sched: Optional[dict] = None
    recipient_pays: bool = False
    hands: int = Field(default=0, ge=0, le=1000)  # number of turns in the circle (0 = not known yet)

class TurnIn(BaseModel):
    member_id: UUID
    hand_no: Literal[1] = 1                                   # one turn per person
    turn: int = Field(ge=1, le=1000)

class OrderIn(BaseModel):
    turns: list[TurnIn]

class ExcIn(BaseModel):
    member_id: UUID
    reason: Literal["Passed away", "Sickness or emergency", "Accident", "Other (group agreed)"]
    note: Optional[str] = Field(default=None, max_length=80)

# ───────────────────────────── helpers ─────────────────────────────
def _mgr(db, rider, group_id, lock=False, treasurer_only=False):
    g, role = actor_group(db, rider, lock, group_id)
    if treasurer_only and role != "treasurer": raise HTTPException(403, "Only the Treasurer can do this.")
    cfg = db.get(ChamaConfig, g.id)
    if (cfg and cfg.chama_type != "mgr") or (not cfg and g.group_type != "mgr"):
        raise HTTPException(409, "This group is not a Merry-Go-Round.")
    return g, role

def _circle(db, g, cid, lock=False):
    return eng.get_circle(db, g.id, cid, lock)

def _clean_contrib(raw, payout):
    """Validate a contribution schedule against the payout schedule. {"type": "same"} (or null) = once per payout."""
    if raw is None or raw.get("type") == "same": return None
    try:
        cs = sch.validate(raw, "contribution"); sch.check_periods(payout, cs)
    except ValueError as e: raise HTTPException(422, str(e))
    return cs

def _treasurer_in(db, g, c) -> bool:
    tm = eng.treasurer_member_ids(db, g)
    return any(m.id in tm for _, m in eng.hands_of(db, c))

def _people(db, circle) -> list:
    out = []
    for h, m in eng.hands_of(db, circle):
        out.append({"member_id": str(m.id), "name": m.full_name, "phone": m.phone, "linked": bool(m.linked_rider_id),
                    "turns": [h.turn_no], "joins_next_cycle": bool(h.joins_next_cycle)})
    return sorted(out, key=lambda p: (p["turns"][0] if p["turns"][0] is not None else 10**6, p["name"]))

def _detail(db, g, role, circle) -> dict:
    card = eng.circle_card(db, circle)
    rnd = eng.open_round(db, circle)
    hs = eng.hands_of(db, circle)
    n = len(hs)
    order_ok = n >= 2 and len({m.id for _, m in hs}) >= 2 and sorted(h.turn_no or 0 for h, _ in hs) == list(range(1, n + 1))
    out = {**card, "role": role, "people": _people(db, circle), "order_complete": order_ok,
           "order_editable": eng.order_editable(db, circle, rnd),
           "new_season": bool(rnd and rnd.cycle_no > 1 and rnd.turn_no == 1),
           "monthly_flags": sch.monthly_flags(circle.sched),
           "effective": {**eng.effective(circle), "amount": str(eng.effective(circle)["amount"])},   # the rules the next cycle will run on
           "treasurer_in_circle": _treasurer_in(db, g, circle)}
    if rnd:
        p = eng.plan(db, circle, rnd)
        rec = db.get(GroupMember, rnd.recipient_member_id)
        out["round"] = {"round_no": rnd.round_no, "cycle_no": rnd.cycle_no, "turn_no": rnd.turn_no,
                        "amount_per_member": rnd.amount_per_member, "deadline": rnd.deadline.isoformat(),
                        "recipient": rec.full_name, "recipient_member_id": str(rec.id),
                        "recipient_is_treasurer": rec.linked_rider_id is not None and rec.linked_rider_id == g.treasurer_rider_id,
                        "roster": p["roster"], "pot": p["pot"], "expected": p["expected"], "short": p["short"],
                        "pending": p["pending"], "block": p["block"], "paid_count": p["paid_count"],
                        "behind_count": p["behind_count"], "unit_amount": rnd.unit_amount or rnd.amount_per_member,
                        "contrib_count": rnd.contrib_count or 1, "period_start": rnd.period_start.isoformat() if rnd.period_start else None,
                        "member_count": p["member_count"],
                        "can_pay": p["can_pay"],
                        "unpaid": [{"member_id": r["member_id"], "name": r["name"], "owed": r["owed"]} for r in p["unpaid"]],
                        "noted": [{"member_id": r["member_id"], "name": r["name"], "reason": r["note_reason"],
                                   "note": r["note_text"], "owed": r["owed"]} for r in p["excused"]],
                        "role": role}
    out["turns"] = eng.turn_table(db, circle, rnd)
    done = db.query(ChamaMgrRound, GroupMember).join(GroupMember, GroupMember.id == ChamaMgrRound.recipient_member_id)\
             .filter(ChamaMgrRound.circle_id == circle.id, ChamaMgrRound.status == "paid_out")\
             .order_by(ChamaMgrRound.round_no.desc()).limit(5).all()
    out["payouts"] = [{"round_no": r.round_no, "cycle_no": r.cycle_no, "turn_no": r.turn_no, "to": m.full_name,
                       "amount": r.paid_out_amount, "at": r.paid_out_at.isoformat(), "self_paid": bool(r.self_paid)} for r, m in done]
    out["exception_reasons"] = eng.EXC_REASONS
    return out

# ───────────────────────────── Treasurer: circles ─────────────────────────────
@router.get("/circles")
def list_circles(group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = _mgr(db, rider, group_id)
    members = db.query(GroupMember).filter(GroupMember.group_id == g.id, GroupMember.status == "active")\
                .order_by(GroupMember.created_at).all()
    return {"group_id": str(g.id), "group_name": g.group_name, "role": role,
            "circles": [eng.circle_card(db, c) for c in eng.circles_of(db, g.id)],
            "members": [{"member_id": str(m.id), "name": m.full_name, "phone": m.phone,
                         "linked": bool(m.linked_rider_id),
                         "is_treasurer": bool(m.linked_rider_id and m.linked_rider_id == g.treasurer_rider_id)} for m in members]}

@router.post("/preview")
def preview(b: PreviewIn, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """The live summary on the New circle form: for the next payouts, how many contribution days each period holds, what each
    person pays and what the recipient receives. Never saves anything. `error` explains an impossible combination."""
    _mgr(db, rider, group_id)
    try:
        payout = sch.validate(b.sched)
        contrib = None if b.contrib_sched is None or b.contrib_sched.get("type") == "same" else sch.validate(b.contrib_sched, "contribution")
        if contrib: sch.check_periods(payout, contrib)
    except ValueError as e:
        return {"ok": False, "error": str(e), "periods": []}
    today, start, periods = date.today(), date.today(), []
    for p in sch.generate(payout, today, today + timedelta(days=900))[:3]:
        n = max(1, sch.count_between(contrib, start, p)) if contrib else 1
        per = Decimal(b.amount) * n
        periods.append({"payout": p.isoformat(), "from": start.isoformat(), "contributions": n, "per_person": per,
                        "pool": (per * (b.hands if b.recipient_pays else max(0, b.hands - 1))) if b.hands else None})
        start = p + timedelta(days=1)
    horizon = today + timedelta(days=400)                     # for the schedule screen's calendar and "Upcoming payouts"
    return {"ok": True, "error": None, "periods": periods, "hands": b.hands, "recipient_pays": b.recipient_pays,
            "contrib_label": sch.label(contrib) if contrib else None, "payout_label": sch.label(payout),
            "payout_dates": [d.isoformat() for d in sch.generate(payout, today, horizon)],
            "contrib_dates": [d.isoformat() for d in sch.generate(contrib, today, horizon)] if contrib else []}

@router.post("/circles", status_code=201)
def create_circle(b: CircleIn, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = _mgr(db, rider, group_id, lock=True, treasurer_only=True)
    n = len(eng.circles_of(db, g.id))
    name = (b.name or f"Circle {n + 1}").strip()
    if db.query(ChamaMgrCircle.id).filter(ChamaMgrCircle.group_id == g.id, func.lower(ChamaMgrCircle.name) == name.lower()).first():
        raise HTTPException(409, "You already have a circle with that name.")
    try: sched = sch.validate(b.sched or {"type": "weekly", "day": 6})
    except ValueError as e: raise HTTPException(422, str(e))
    contrib = _clean_contrib(b.contrib_sched, sched)
    c = ChamaMgrCircle(group_id=g.id, name=name, amount=b.amount or 0, sched=sched, contrib_sched=contrib,
                       recipient_pays=bool(b.recipient_pays), treasurer_joins=bool(b.treasurer_joins), status="draft", cycle_no=1)
    db.add(c); db.commit()
    return eng.circle_card(db, c)

@router.get("/circles/{cid}")
def get_circle(cid: RowId, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = _mgr(db, rider, group_id)
    c = _circle(db, g, cid)
    return _detail(db, g, role, c)

@router.put("/circles/{cid}")
def update_circle(cid: RowId, b: CircleIn, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = _mgr(db, rider, group_id, lock=True, treasurer_only=True)
    c = _circle(db, g, cid, lock=True)
    if b.name is not None:
        nm = b.name.strip()
        if db.query(ChamaMgrCircle.id).filter(ChamaMgrCircle.group_id == g.id, ChamaMgrCircle.id != c.id,
                                              func.lower(ChamaMgrCircle.name) == nm.lower()).first():
            raise HTTPException(409, "You already have a circle with that name.")
        c.name = nm
    # Money rules (amount, both schedules, the two switches) can only change BEFORE a cycle starts: when the circle is first set up,
    # and between two cycles, while the Treasurer reviews the next round. While a cycle runs they are fixed.
    change = {}
    if b.amount is not None: change["amount"] = b.amount
    if b.sched is not None:
        try: change["sched"] = sch.validate(b.sched)
        except ValueError as e: raise HTTPException(422, str(e))
    if b.recipient_pays is not None: change["recipient_pays"] = bool(b.recipient_pays)
    if b.treasurer_joins is not None: change["treasurer_joins"] = bool(b.treasurer_joins)
    if change.get("treasurer_joins") is False and _treasurer_in(db, g, c):
        raise HTTPException(409, "You are in this circle as a member. Remove yourself from the circle first, then switch this off.")
    if b.contrib_sched is not None or "sched" in change:
        pay = change.get("sched", eng.effective(c)["sched"])
        raw = b.contrib_sched if b.contrib_sched is not None else eng.effective(c)["contrib_sched"]
        change["contrib_sched"] = _clean_contrib(raw, pay)       # also re-checks the payout/contribution combination
    if change:
        rnd = eng.open_round(db, c, lock=True)
        if eng.cycle_locked(db, c, rnd):
            raise HTTPException(409, "These settings can be changed when this round ends, before the next round starts.")
        eng.apply_pending(c)                                      # (legacy saved changes, if any, are folded in first)
        for k, v in change.items(): setattr(c, k, v)
        if rnd and not db.query(ChamaContribution.id).filter(ChamaContribution.round_id == rnd.id).first():
            eng.refresh_open_round(db, c, rnd)                    # turn 1 of a cycle and nobody has paid yet: re-work the open round too
    db.commit()
    return _detail(db, g, role, c)

@router.delete("/circles/{cid}")
def delete_circle(cid: RowId, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = _mgr(db, rider, group_id, lock=True, treasurer_only=True)
    c = _circle(db, g, cid, lock=True)
    if c.status != "draft" or db.query(ChamaMgrRound.id).filter_by(circle_id=c.id).first():
        raise HTTPException(409, "A circle that has started cannot be deleted.")
    db.query(ChamaMgrHand).filter_by(circle_id=c.id).delete(); db.delete(c); db.commit()
    return {"ok": True}

# ---- people (one turn each) ----
@router.put("/circles/{cid}/people/{member_id}")
def set_person(cid: RowId, member_id: RowId, group_id: Optional[RowId] = GID,
               db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Put a member of the group in the circle. Everyone has exactly one turn."""
    g, role = _mgr(db, rider, group_id, lock=True, treasurer_only=True)
    c = _circle(db, g, cid, lock=True)
    m = db.query(GroupMember).filter_by(id=member_id, group_id=g.id, status="active").first()
    if not m: raise HTTPException(404, "That member is not in this group.")
    if m.id in eng.treasurer_member_ids(db, g) and not eng.effective(c)["treasurer_joins"]:
        raise HTTPException(409, "To put yourself in this circle, switch on \"Treasurer also takes part\" in the circle settings first.")
    if db.query(ChamaMgrHand.id).filter_by(circle_id=c.id, member_id=m.id).first():
        return _detail(db, g, role, c)                          # already in: nothing to do
    running = c.status == "active"
    top = db.query(func.max(ChamaMgrHand.turn_no)).filter_by(circle_id=c.id).scalar() or 0
    if running:                                                 # joins from the next cycle; gets a turn when the next round is set up
        db.add(ChamaMgrHand(circle_id=c.id, member_id=m.id, hand_no=1, turn_no=None, joins_next_cycle=True))
    else:
        db.add(ChamaMgrHand(circle_id=c.id, member_id=m.id, hand_no=1, turn_no=top + 1))
    db.commit()
    return _detail(db, g, role, c)

@router.delete("/circles/{cid}/people/{member_id}")
def remove_person(cid: RowId, member_id: RowId, group_id: Optional[RowId] = GID,
                  db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Take a member out of this circle (they stay in the group). Not possible while the cycle is running."""
    g, role = _mgr(db, rider, group_id, lock=True, treasurer_only=True)
    c = _circle(db, g, cid, lock=True)
    eng.remove_from_circle(db, c, member_id)
    db.commit()
    return _detail(db, g, role, c)

@router.put("/circles/{cid}/order")
def set_order(cid: RowId, b: OrderIn, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = _mgr(db, rider, group_id, lock=True, treasurer_only=True)
    c = _circle(db, g, cid, lock=True)
    rnd = eng.open_round(db, c, lock=True)
    editable = eng.order_editable(db, c, rnd)
    hands = {(m.id, h.hand_no): h for h, m in eng.hands_of(db, c)}
    if not editable:                                          # mid-cycle: only hands that already have a turn are in play
        hands = {k: h for k, h in hands.items() if h.turn_no is not None}
    keys = [(t.member_id, t.hand_no) for t in b.turns]
    if len(keys) != len(hands) or set(keys) != set(hands):
        raise HTTPException(422, "Give a turn to every person in this circle, once each.")
    if sorted(t.turn for t in b.turns) != list(range(1, len(hands) + 1)):
        raise HTTPException(422, "Turns must run 1, 2, 3 ... with no gaps or repeats.")
    if rnd and not editable:
        for t in b.turns:
            old = hands[(t.member_id, t.hand_no)].turn_no
            if old is not None and old <= rnd.turn_no and t.turn != old:
                raise HTTPException(422, "Turns that have already started cannot change.")
    for h in hands.values(): h.turn_no = None                # clear first so the unique index never clashes mid-update
    db.flush()
    for t in b.turns: hands[(t.member_id, t.hand_no)].turn_no = t.turn
    db.flush()
    if rnd and editable:                                      # new season: whoever now holds turn 1 receives this round
        rnd.recipient_member_id = next(h.member_id for h in hands.values() if h.turn_no == 1)
    db.commit()
    return _detail(db, g, role, c)

@router.post("/circles/{cid}/start")
def start(cid: RowId, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = _mgr(db, rider, group_id, lock=True, treasurer_only=True)
    c = _circle(db, g, cid, lock=True)
    eng.start_circle(db, c); db.commit()
    return _detail(db, g, role, c)

@router.post("/circles/{cid}/payout")
def payout(cid: RowId, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = _mgr(db, rider, group_id, lock=True)
    c = _circle(db, g, cid, lock=True)
    rnd = eng.open_round(db, c, lock=True)
    if not rnd: raise HTTPException(409, "There is no open round.")
    p = eng.plan(db, c, rnd)
    if not p["can_pay"]: raise HTTPException(409, p["block"])
    rec = db.get(GroupMember, rnd.recipient_member_id)
    rec, pot, cycle_ended, nxt = eng.pay_out(db, c, rnd, p, rider.id)
    db.commit()
    return {"paid": pot, "to": rec.full_name, "cycle_ended": cycle_ended, "next_turn": nxt, "short": p["short"],
            "self_paid": bool(rec.linked_rider_id and rec.linked_rider_id == rider.id)}

# ---- exceptions: the Treasurer notes a member who cannot pay (death / emergency); members can see the note ----
@router.post("/circles/{cid}/exceptions", status_code=201)
def note_exception(cid: RowId, b: ExcIn, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = _mgr(db, rider, group_id, lock=True, treasurer_only=True)
    c = _circle(db, g, cid, lock=True)
    rnd = eng.open_round(db, c, lock=True)
    if not rnd: raise HTTPException(409, "There is no open round.")
    if eng.member_owes(db, c, rnd, b.member_id) - mgr_paid_by_member(db, rnd.id).get(b.member_id, ZERO) <= 0:
        raise HTTPException(409, "This member does not owe anything this round.")
    e = db.query(ChamaMgrException).filter_by(round_id=rnd.id, member_id=b.member_id).first()
    if not e:
        e = ChamaMgrException(round_id=rnd.id, member_id=b.member_id); db.add(e)
    e.reason, e.note, e.created_by_rider_id = b.reason, (b.note or "").strip() or None, rider.id
    db.commit()
    return {"ok": True}

@router.delete("/circles/{cid}/exceptions/{member_id}")
def undo_exception(cid: RowId, member_id: RowId, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = _mgr(db, rider, group_id, lock=True, treasurer_only=True)
    c = _circle(db, g, cid, lock=True); rnd = eng.open_round(db, c)
    if rnd: db.query(ChamaMgrException).filter_by(round_id=rnd.id, member_id=member_id).delete()
    db.commit()
    return {"ok": True}

@router.get("/activity")
def activity(circle_id: Optional[RowId] = None, group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Activity history of the group's circles: payouts, newest first."""
    g, role = _mgr(db, rider, group_id)
    return _activity(db, g, circle_id, None, role)

def _activity(db, g, circle_id, member_ids, role=None):
    items = []
    pq = db.query(ChamaMgrRound, GroupMember, ChamaMgrCircle).join(GroupMember, GroupMember.id == ChamaMgrRound.recipient_member_id)\
           .join(ChamaMgrCircle, ChamaMgrCircle.id == ChamaMgrRound.circle_id)\
           .filter(ChamaMgrRound.group_id == g.id, ChamaMgrRound.status == "paid_out")
    if circle_id: pq = pq.filter(ChamaMgrRound.circle_id == circle_id)
    for r, m, c in pq.order_by(ChamaMgrRound.paid_out_at.desc()).limit(50).all():
        items.append({"kind": "payout", "at": r.paid_out_at.isoformat(), "circle": c.name, "circle_id": str(c.id),
                      "to": m.full_name, "amount": r.paid_out_amount, "turn_no": r.turn_no, "self_paid": bool(r.self_paid)})
    if member_ids is not None:   # the rider's own payments: confirmed, waiting, or rejected (with the Treasurer's reason)
        cq = db.query(ChamaContribution, ChamaMgrRound.circle_id).join(ChamaMgrRound, ChamaMgrRound.id == ChamaContribution.round_id)\
               .filter(ChamaContribution.group_id == g.id, ChamaContribution.member_id.in_(list(member_ids)))
        if circle_id: cq = cq.filter(ChamaMgrRound.circle_id == circle_id)
        for c, cid_ in cq.order_by(ChamaContribution.submitted_at.desc()).limit(50).all():
            items.append({"kind": "contribution", "id": str(c.id), "circle_id": str(cid_), "reference": c.reference,
                          "amount": c.amount, "method": c.method, "status": c.status, "reason": c.reject_reason,
                          "self_confirmed": bool(c.self_confirmed),
                          "at": (c.decided_at or c.submitted_at).isoformat()})
    return sorted(items, key=lambda x: x["at"], reverse=True)

# ───────────────────────────── Rider: my circles ─────────────────────────────
def _my_mgr_members(db, rider, group_id):
    out = []
    for m in members_for_rider(db, rider.id):
        if group_id and m.group_id != group_id: continue
        cfg = db.get(ChamaConfig, m.group_id); g = db.get(BodaGroup, m.group_id)
        if cfg and cfg.chama_type == "mgr" and g.status == "active": out.append((m, g))
    return out

def _my_circle_view(db, g, m, c) -> Optional[dict]:
    hs = eng.hands_of(db, c)
    mine = [h for h, mm in hs if mm.id == m.id]
    if not mine: return None
    rnd = eng.open_round(db, c); th = eng.turn_hands(db, c)
    table = eng.turn_table(db, c, rnd, m.id)
    my_turns = [{"turn": r["turn"], "date": r["date"], "status": r["status"]} for r in table if r["mine"]]
    out = {"id": str(c.id), "name": c.name, "amount": c.amount, "sched_label": sch.label(c.sched), "status": c.status,
           "cycle_no": c.cycle_no, "total_turns": len(th), "my_turns": my_turns,
           "joins_next_cycle": any(h.joins_next_cycle for h in mine),
           "current_turn": rnd.turn_no if rnd else None, "schedule": table,
           "payout_label": sch.label(c.sched), "contrib_label": sch.label(c.contrib_sched) if c.contrib_sched else None,
           "contrib_sched": c.contrib_sched, "recipient_pays": bool(c.recipient_pays), "treasurer_joins": bool(c.treasurer_joins),
           "payout_estimate": eng.pool_size(c, rnd.amount_per_member if rnd else c.amount, len(th)),
           "waiting_for_treasurer": c.status == "active" and rnd is None}
    saved = db.query(func.coalesce(func.sum(ChamaContribution.amount), 0)).join(ChamaMgrRound, ChamaMgrRound.id == ChamaContribution.round_id)\
              .filter(ChamaContribution.member_id == m.id, ChamaContribution.status == "confirmed",
                      ChamaMgrRound.circle_id == c.id, ChamaMgrRound.cycle_no == c.cycle_no).scalar()
    out["saved_this_cycle"] = Decimal(saved)
    if rnd:
        paid = mgr_paid_by_member(db, rnd.id).get(m.id, ZERO)
        owes = eng.member_owes(db, c, rnd, m.id); i_rec = rnd.turn_no in [h.turn_no for h in mine]
        pend = sum((Decimal(x.amount) for x in db.query(ChamaContribution).filter_by(round_id=rnd.id, member_id=m.id, status="pending")), ZERO)
        rec = db.get(GroupMember, rnd.recipient_member_id)
        p = eng.plan(db, c, rnd)
        hw = eng.hands_owing(db, c, rnd, m.id); bh = eng.behind_info(c, rnd, hw, paid, pend)
        today = date.today()
        self_conf = db.query(func.coalesce(func.sum(ChamaContribution.amount), 0)).filter(
            ChamaContribution.round_id == rnd.id, ChamaContribution.status == "confirmed", ChamaContribution.self_confirmed.is_(True)).scalar()
        nxt = sch.next_contribution(c.contrib_sched, today) if c.contrib_sched else None
        out["round"] = {"round_no": rnd.round_no, "turn_no": rnd.turn_no, "deadline": rnd.deadline.isoformat(),
                        "amount": rnd.amount_per_member, "recipient": rec.full_name, "i_receive": i_rec,
                        "unit_amount": rnd.unit_amount or rnd.amount_per_member, "contrib_count": rnd.contrib_count or 1,
                        "period_start": rnd.period_start.isoformat() if rnd.period_start else None,
                        "behind": bh["behind"], "behind_amount": bh["behind_amount"], "days_behind": bh["days_behind"],
                        "due_to_date": bh["due_to_date"], "next_contribution": nxt.isoformat() if nxt else None,
                        "contribute_today": bool(c.contrib_sched and sch.is_contribution_day(c.contrib_sched, today)),
                        "treasurer_self_confirmed": Decimal(self_conf),
                        "hands_owing": hw, "owes_total": owes, "paid": paid, "pending": pend,
                        "owed": max(ZERO, owes - paid), "pot": p["pot"], "expected": p["expected"],
                        "paid_count": p["paid_count"], "member_count": p["member_count"]}
        out["notes"] = [{"name": r["name"], "reason": r["note_reason"], "note": r["note_text"]} for r in p["roster"] if r["noted"]]
    return out

@router.get("/me")
def my_view(group_id: Optional[RowId] = GID, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Everything a rider needs for their Merry-Go-Rounds: one entry per group, one per circle in it."""
    rows = _my_mgr_members(db, rider, group_id)
    if group_id and not rows: raise HTTPException(404, "You are not a member of that Merry-Go-Round.")
    if not rows: raise HTTPException(404, "Ask your Treasurer to add your bike registration number to the group.")
    groups = []
    for m, g in rows:
        circles = []
        for c in eng.circles_of(db, g.id):
            v = _my_circle_view(db, g, m, c)
            if v: circles.append(v)
        groups.append({"group_id": str(g.id), "group_name": g.group_name, "member_id": str(m.id),
                       "treasurer": {"name": g.treasurer_name, "phone": g.treasurer_phone}, "circles": circles})
    db.commit()
    return {"groups": groups}

# ----------------------------- Rider: my contribution history -----------------------------
def _my_contribution_query(db, rider, group_id, circle_id, only_status=None):
    """The rider's own payments into Merry-Go-Round circles (all of them, newest decision or submission time as `upd`)."""
    mine = _my_mgr_members(db, rider, group_id)
    if not mine: return None, None
    upd = func.coalesce(ChamaContribution.decided_at, ChamaContribution.submitted_at)
    q = db.query(ChamaContribution, ChamaMgrRound.circle_id, upd.label("upd"))\
          .join(ChamaMgrRound, ChamaMgrRound.id == ChamaContribution.round_id)\
          .filter(ChamaContribution.member_id.in_([m.id for m, _ in mine]))
    if circle_id: q = q.filter(ChamaMgrRound.circle_id == circle_id)
    if only_status: q = q.filter(ChamaContribution.status == only_status)
    return q, upd

def _contribution_item(c, cid_, upd, names):
    return {"id": str(c.id), "circle_id": str(cid_), "circle_name": names.get(cid_), "reference": c.reference, "amount": c.amount,
            "method": c.method, "status": c.status, "reason": c.reject_reason, "self_confirmed": bool(c.self_confirmed),
            "submitted_at": c.submitted_at.isoformat() if c.submitted_at else None, "at": upd.isoformat()}

@router.get("/me/contributions")
def my_contributions(group_id: Optional[RowId] = GID, circle_id: Optional[RowId] = None,
                     since: Optional[str] = Query(None, description="Cursor from the previous page: 'iso-time|id'. Only payments that changed after it."),
                     from_ts: Optional[datetime] = Query(None, description="Skip anything not touched since this moment (the phone's six-month window)"),
                     order: Literal["asc", "desc"] = "asc", status: Optional[Literal["pending", "confirmed", "rejected"]] = None,
                     limit: int = Query(100, ge=1, le=200), offset: int = Query(0, ge=0),
                     db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """The rider's own payments, with NO cap on how far back they go.
    Two ways to read it:
      • sync (order=asc, since=cursor): what is new or changed since the phone last asked, 100 at a time, with a cursor to continue from.
        `from_ts` keeps the phone from downloading what its six-month window would throw away.
      • browse (order=desc, offset): the whole history page by page, for "Since Joining" and anything older than the phone keeps."""
    q, upd = _my_contribution_query(db, rider, group_id, circle_id, status)
    if q is None: return {"items": [], "next_cursor": since, "has_more": False, "total": 0}
    if from_ts: q = q.filter(upd >= from_ts)
    if since:
        try: t, _, i = since.partition("|"); after = (datetime.fromisoformat(t), UUID(i))
        except Exception: raise HTTPException(422, "That cursor is not valid.")
        q = q.filter(tuple_(upd, ChamaContribution.id) > tuple_(after[0], after[1]))
    total = q.count()
    key = (upd, ChamaContribution.id)
    q = q.order_by(*(k.desc() for k in key)) if order == "desc" else q.order_by(*key)
    rows = q.offset(offset).limit(limit + 1).all()
    more, rows = len(rows) > limit, rows[:limit]
    names = {c.id: c.name for c in db.query(ChamaMgrCircle).filter(ChamaMgrCircle.id.in_({r[1] for r in rows}))} if rows else {}
    items = [_contribution_item(c, cid_, u, names) for c, cid_, u in rows]
    return {"items": items, "next_cursor": f"{rows[-1][2].isoformat()}|{rows[-1][0].id}" if rows else since, "has_more": more, "total": total}

@router.get("/me/contributions/summary")
def my_contributions_summary(group_id: Optional[RowId] = GID, circle_id: Optional[RowId] = None,
                             db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Everything the rider has paid in (confirmed) since joining: the figure for the "Since Joining" tile, however old it is."""
    q, upd = _my_contribution_query(db, rider, group_id, circle_id, "confirmed")
    if q is None: return {"count": 0, "total": 0, "first_at": None}
    sub = q.with_entities(ChamaContribution.amount, upd.label("u")).subquery()
    n, tot, first = db.query(func.count(), func.coalesce(func.sum(sub.c.amount), 0), func.min(sub.c.u)).select_from(sub).one()
    return {"count": int(n), "total": tot, "first_at": first.isoformat() if first else None}

@router.get("/me/activity")
def my_activity(group_id: Optional[RowId] = GID, circle_id: Optional[RowId] = None, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """The rider's own payments and the payouts of their circles."""
    out = []
    for m, g in _my_mgr_members(db, rider, group_id):
        out += _activity(db, g, circle_id, [m.id])
    db.commit()
    return sorted(out, key=lambda x: x["at"], reverse=True)