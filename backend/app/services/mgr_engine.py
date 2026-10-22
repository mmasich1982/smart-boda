# backend/app/services/mgr_engine.py
"""Merry-Go-Round engine: circles, hands (turns), rounds, payouts and turn swaps.

Vocabulary
  group   one Treasurer's Chama (boda_group). It has a type, "mgr" for a Merry-Go-Round.
  circle  a Merry-Go-Round inside the group. A group can run several (for example Daily and Weekly). Each has its own
          amount, payout schedule, people, turn order, rounds and pot.
  hand    one turn per cycle. A person with a double turn has two hands. Each hand pays the circle amount every round
          except in its own turn.
  round   one payout. The recipient is whoever holds the current turn.

Money rules: the pot is the confirmed contributions of the round; a round is paid out only once everyone who owes has paid
(or the Treasurer has noted an exception). By default the recipient does not pay for the turn being received; a circle can
switch that on (recipient_pays).

Stage 1: a circle has TWO schedules. `sched` is when the pool is paid out. `contrib_sched` is when members contribute (optional;
missing = once per payout, as before). A round covers the period since the previous payout and each hand owes
unit amount x contribution dates in that period. Members are "behind" when they have paid (counting payments that wait for the
Treasurer) less than the contribution dates that have already passed. Changes to amount, schedules and the two switches are
locked for the cycle: they wait in `pending_cfg` and apply when the next cycle starts.

Swap rules (new)
  1. Only turns that have not come yet can be swapped, and only between two different people.
  2. The other rider can only AGREE. There is no decline, so a refusal has no state.
  3. The requester can cancel until the Treasurer has approved.
  4. A request left waiting too long EXPIRES, and it is cancelled automatically when either turn becomes the current one.
  5. Approval shows the effect and warns about back-to-back turns, and everyone involved is notified and it is recorded.
"""
import os
from app.services.group_member_link_service import mask_phone
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.models.boda_group import BodaGroup, GroupMember, AppNotification
from app.models.chama_finance import (ChamaContribution, ChamaMgrRound, ChamaMgrSwap, ChamaMgrCircle,
                                      ChamaMgrHand, ChamaMgrException)
from app.services import mgr_schedule as sch
from app.services.chama_finance_service import mgr_paid_by_member, new_ref, post, ZERO
from app.services.notification_service import notify, complete

SWAP_WAIT_DAYS = int(os.getenv("MGR_SWAP_EXPIRY_DAYS", "7"))       # days a request may wait at each stage
EXC_REASONS = ["Passed away", "Sickness or emergency", "Accident", "Other (group agreed)"]
now = lambda: datetime.now(timezone.utc)
first = lambda name: (name or "").split(" ")[0]

# ───────────────────────────── circles, hands, rounds ─────────────────────────────
def get_circle(db: Session, group_id, circle_id, lock=False) -> ChamaMgrCircle:
    q = db.query(ChamaMgrCircle).filter(ChamaMgrCircle.id == circle_id, ChamaMgrCircle.group_id == group_id)
    c = (q.with_for_update() if lock else q).first()
    if not c: raise HTTPException(404, "Circle not found.")
    return c

def circles_of(db: Session, group_id) -> list:
    return db.query(ChamaMgrCircle).filter_by(group_id=group_id).order_by(ChamaMgrCircle.created_at, ChamaMgrCircle.id).all()

def hands_of(db: Session, circle) -> list:
    """[(hand, member)] ordered by turn (hands without a turn last)."""
    rows = db.query(ChamaMgrHand, GroupMember).join(GroupMember, GroupMember.id == ChamaMgrHand.member_id)\
             .filter(ChamaMgrHand.circle_id == circle.id).all()
    return sorted(rows, key=lambda r: (r[0].turn_no is None, r[0].turn_no or 0, r[1].created_at, r[0].hand_no))

def turn_hands(db: Session, circle) -> list:
    return [(h, m) for h, m in hands_of(db, circle) if h.turn_no is not None]

def open_round(db: Session, circle, lock=False) -> Optional[ChamaMgrRound]:
    q = db.query(ChamaMgrRound).filter_by(circle_id=circle.id, status="open")
    return (q.with_for_update() if lock else q).first()

def current_turn(db: Session, circle) -> Optional[int]:
    r = open_round(db, circle)
    return r.turn_no if r else None

def deadline_after(circle, after_today=False) -> date:
    return sch.next_on_or_after(circle.sched, date.today(), after=after_today)

def round_period_start(db, circle, deadline) -> date:
    """First day of a new round's contribution period: the day after the previous round's payout date (today for the first round)."""
    prev = db.query(func.max(ChamaMgrRound.deadline)).filter(ChamaMgrRound.circle_id == circle.id).scalar()
    return prev + timedelta(days=1) if prev and prev < deadline else date.today()

def round_amounts(circle, start, deadline) -> tuple:
    """(contribution count, unit amount, target per hand) for a round whose period runs start..deadline."""
    unit = Decimal(circle.amount)
    if not circle.contrib_sched: return 1, unit, unit                     # one contribution per payout, as before Stage 1
    n = max(1, sch.count_between(circle.contrib_sched, start, deadline))
    return n, unit, unit * n

def new_round(db, circle, turn_no, round_no, recipient_member_id, after_today=False):
    deadline = deadline_after(circle, after_today)
    start = round_period_start(db, circle, deadline)
    n, unit, target = round_amounts(circle, start, deadline)
    db.add(ChamaMgrRound(group_id=circle.group_id, circle_id=circle.id, cycle_no=circle.cycle_no, round_no=round_no,
                         turn_no=turn_no, recipient_member_id=recipient_member_id, amount_per_member=target,
                         unit_amount=unit, contrib_count=n, period_start=start, deadline=deadline))

def refresh_open_round(db, circle, rnd):
    """Re-work the open round after the circle's amount or schedules changed (only allowed while nobody has paid into it)."""
    rnd.deadline = deadline_after(circle)
    rnd.period_start = rnd.period_start if rnd.period_start and rnd.period_start < rnd.deadline else date.today()
    rnd.contrib_count, rnd.unit_amount, rnd.amount_per_member = round_amounts(circle, rnd.period_start, rnd.deadline)

CFG_KEYS = ("amount", "sched", "contrib_sched", "recipient_pays", "treasurer_joins")

def cycle_locked(db, circle, rnd=None) -> bool:
    """True while the circle is mid-cycle: money rules may not change now, they wait for the next cycle."""
    if circle.status != "active": return False
    rnd = rnd or open_round(db, circle)
    return rnd is not None and not order_editable(db, circle, rnd)

def apply_pending(circle):
    """A new cycle begins: the changes the Treasurer saved mid-cycle take effect."""
    for k, v in (circle.pending_cfg or {}).items():
        if k in CFG_KEYS: setattr(circle, k, Decimal(str(v)) if k == "amount" else v)
    circle.pending_cfg = None

def effective(circle) -> dict:
    """The rules that will apply from the next cycle (the saved changes laid over the current ones)."""
    out = {k: getattr(circle, k) for k in CFG_KEYS}
    for k, v in (circle.pending_cfg or {}).items():
        if k in CFG_KEYS: out[k] = v
    return out

def treasurer_member_ids(db, g) -> set:
    """Member rows of this group that are the Treasurer's own (the Treasurer added as a member of their own group)."""
    if not g or not g.treasurer_rider_id: return set()
    return {m.id for m in db.query(GroupMember).filter(GroupMember.group_id == g.id, GroupMember.linked_rider_id == g.treasurer_rider_id)}

def pool_size(circle, per_member, hands) -> Decimal:
    """What the recipient receives: every hand pays, except the recipient's own when recipient_pays is off."""
    return Decimal(per_member) * (hands if circle.recipient_pays else max(0, hands - 1))

def order_editable(db, circle, rnd) -> bool:
    """The turn order may be rewritten until the FIRST payout of a season: before the circle starts, or while the open round
    is turn 1 and nobody has paid into it. After that a turn can only move through an approved swap."""
    if rnd is None: return True
    if rnd.turn_no != 1: return False
    return db.query(ChamaContribution.id).filter(ChamaContribution.round_id == rnd.id,
                                                  ChamaContribution.status != "rejected").first() is None

def hands_owing(db, circle, rnd, member_id) -> int:
    """How many hands of this member pay into this round: every hand with a turn, except the one being paid out
    (unless the circle says the recipient also contributes)."""
    pay_all = bool(circle.recipient_pays)
    return sum(1 for h, m in turn_hands(db, circle) if m.id == member_id and (pay_all or h.turn_no != rnd.turn_no))

def member_owes(db, circle, rnd, member_id) -> Decimal:
    return Decimal(rnd.amount_per_member) * hands_owing(db, circle, rnd, member_id)

def _treasurer_rider(db, circle):
    g = getattr(circle, "_grp", None)
    if g is None:
        g = db.get(BodaGroup, circle.group_id); circle._grp = g
    return g.treasurer_rider_id if g else None

def pending_by_member(db, round_id) -> dict:
    """Money each member has sent that still waits for the Treasurer."""
    rows = db.query(ChamaContribution.member_id, func.sum(ChamaContribution.amount)).filter(
        ChamaContribution.round_id == round_id, ChamaContribution.status == "pending").group_by(ChamaContribution.member_id).all()
    return {mid: Decimal(t) for mid, t in rows}

def behind_info(circle, rnd, hands, paid, pending, today=None) -> dict:
    """Is this member behind on the contribution dates that have already passed this round?
    Payments that wait for the Treasurer count as paid, so nobody is flagged while their money is on its way.
    Circles without a contribution schedule (one payment per payout) are never "behind"."""
    base = {"behind": False, "behind_amount": ZERO, "days_behind": 0, "due_to_date": ZERO}
    if not circle.contrib_sched or not rnd.period_start or not rnd.unit_amount or hands <= 0: return base
    today = today or date.today()
    n = sch.count_between(circle.contrib_sched, rnd.period_start, min(today, rnd.deadline))
    unit_all = Decimal(rnd.unit_amount) * hands
    due = min(unit_all * n, Decimal(rnd.amount_per_member) * hands)
    gap = max(ZERO, due - Decimal(paid) - Decimal(pending))
    days = -int(-gap // unit_all) if gap > 0 and unit_all > 0 else 0          # ceiling
    return {"behind": gap > 0, "behind_amount": gap, "days_behind": days, "due_to_date": due}

def exceptions_of(db, rnd) -> dict:
    return {x.member_id: x for x in db.query(ChamaMgrException).filter_by(round_id=rnd.id)}

def plan(db: Session, circle, rnd) -> dict:
    """Who has paid, who still owes, and whether the pool can be paid out."""
    paid = mgr_paid_by_member(db, rnd.id)
    pending = db.query(func.count(ChamaContribution.id)).filter_by(round_id=rnd.id, status="pending").scalar()
    sent = pending_by_member(db, rnd.id)
    pay_all = bool(circle.recipient_pays)
    ex = exceptions_of(db, rnd)
    th = turn_hands(db, circle)
    per = defaultdict(list)
    for h, m in th: per[m.id].append((h, m))
    amount, roster = Decimal(rnd.amount_per_member), []
    for mid, hs in sorted(per.items(), key=lambda kv: min(h.turn_no for h, _ in kv[1])):
        m = hs[0][1]; turns = sorted(h.turn_no for h, _ in hs)
        owing = len(turns) if pay_all else sum(1 for t in turns if t != rnd.turn_no); owed_total = amount * owing
        p = paid.get(mid, ZERO); remaining = max(ZERO, owed_total - p)
        is_rec = rnd.turn_no in turns
        e = ex.get(mid)
        bh = behind_info(circle, rnd, owing, p, sent.get(mid, ZERO))
        roster.append({"member_id": str(mid), "name": m.full_name, "phone": mask_phone(m.phone), "turns": turns,
                       "is_recipient": is_rec, "hands": len(turns), "owed_total": owed_total, "paid": p,
                       "owed": remaining, "complete": remaining == 0,
                       "noted": bool(e and remaining > 0), "note_reason": e.reason if e else None,
                       "note_text": e.note if e else None, "sent": sent.get(mid, ZERO),
                       "behind": bh["behind"] and remaining > 0 and not bool(e), "behind_amount": bh["behind_amount"],
                       "days_behind": bh["days_behind"], "is_treasurer": m.linked_rider_id is not None and m.linked_rider_id == _treasurer_rider(db, circle)})
    pot = sum(paid.values(), ZERO)
    unpaid = [r for r in roster if r["owed"] > 0 and not r["noted"]]
    excused = [r for r in roster if r["owed"] > 0 and r["noted"]]
    short = sum((r["owed"] for r in excused), ZERO)
    block = None
    if pot <= 0: block = "The pool is empty. There is nothing to pay out yet."
    elif unpaid: block = f"{len(unpaid)} member(s) have not paid yet. The pool is paid out once every member has paid."
    elif pending: block = f"{pending} contribution(s) still await your confirmation. Confirm them first."
    return {"roster": roster, "pot": pot, "can_pay": block is None, "block": block, "pending": pending,
            "unpaid": unpaid, "excused": excused, "short": short,
            "expected": pool_size(circle, amount, len(th)), "paid_count": sum(1 for r in roster if r["complete"] or r["noted"]),
            "behind_count": sum(1 for r in roster if r["behind"]),
            "member_count": len(roster)}

def turn_table(db, circle, rnd=None, me_member_id=None) -> list:
    """The group's schedule: one row per turn with its date, holder and status."""
    rnd = rnd or open_round(db, circle)
    th = turn_hands(db, circle)
    cur = rnd.turn_no if rnd else None
    dates = sch.turn_dates(circle.sched, rnd.deadline, max(1, len(th) - (cur or 1) + 1)) if rnd else []
    cycle = rnd.cycle_no if rnd else circle.cycle_no
    done = {r.turn_no: r for r in db.query(ChamaMgrRound).filter_by(circle_id=circle.id, cycle_no=cycle, status="paid_out")}
    out = []
    for h, m in th:
        d = dates[h.turn_no - cur] if rnd and h.turn_no >= cur and h.turn_no - cur < len(dates) else None
        r = done.get(h.turn_no)
        out.append({"turn": h.turn_no, "hand_no": h.hand_no, "member_id": str(m.id), "name": m.full_name, "phone": mask_phone(m.phone),
                    "mine": bool(me_member_id and m.id == me_member_id),
                    "date": d.isoformat() if d else None,
                    "paid_at": r.paid_out_at.date().isoformat() if r and r.paid_out_at else None,
                    "self_paid": bool(r and r.self_paid),
                    "status": None if not rnd else "paid" if h.turn_no < cur else "current" if h.turn_no == cur else "upcoming"})
    return out

def circle_card(db, circle) -> dict:
    """One line per circle for tabs and lists."""
    hs = hands_of(db, circle); th = [x for x in hs if x[0].turn_no is not None]
    rnd = open_round(db, circle)
    out = {"id": str(circle.id), "name": circle.name, "amount": circle.amount, "sched": circle.sched,
           "sched_label": sch.label(circle.sched), "status": circle.status,
           "cycle_no": circle.cycle_no, "people": len({m.id for _, m in hs}), "hands": len(hs), "turns": len(th),
           "needs_season_setup": circle.status == "active" and rnd is None,
           "contrib_sched": circle.contrib_sched, "contrib_label": sch.label(circle.contrib_sched) if circle.contrib_sched else None,
           "recipient_pays": bool(circle.recipient_pays), "treasurer_joins": bool(circle.treasurer_joins),
           "pending_cfg": circle.pending_cfg, "locked": cycle_locked(db, circle, rnd)}
    if rnd:
        p = plan(db, circle, rnd); rec = db.get(GroupMember, rnd.recipient_member_id)
        out["round"] = {"round_no": rnd.round_no, "turn_no": rnd.turn_no, "deadline": rnd.deadline.isoformat(),
                        "recipient": rec.full_name, "pot": p["pot"], "expected": p["expected"],
                        "paid_count": p["paid_count"], "member_count": p["member_count"], "can_pay": p["can_pay"],
                        "behind_count": p["behind_count"], "unit_amount": rnd.unit_amount, "contrib_count": rnd.contrib_count or 1,
                        "amount_per_member": rnd.amount_per_member}
    return out

# ───────────────────────────── starting and paying out ─────────────────────────────
def check_ready(db, circle) -> list:
    hs = hands_of(db, circle)
    if circle.amount <= 0: raise HTTPException(409, "Set the contribution amount for this circle first.")
    try:
        sch.validate(circle.sched)
        if circle.contrib_sched:
            sch.validate(circle.contrib_sched, "contribution"); sch.check_periods(circle.sched, circle.contrib_sched)
    except ValueError as e: raise HTTPException(409, str(e))
    if len({m.id for _, m in hs}) < 2: raise HTTPException(409, "Add at least 2 people to this circle first.")
    tm = treasurer_member_ids(db, db.get(BodaGroup, circle.group_id))
    if not circle.treasurer_joins and any(m.id in tm for _, m in hs):
        raise HTTPException(409, "The Treasurer is in this circle, but \"Treasurer also takes part\" is switched off in the circle settings.")
    if sorted(h.turn_no or 0 for h, _ in hs) != list(range(1, len(hs) + 1)):
        raise HTTPException(409, "Give every turn a number first (1, 2, 3 ...).")
    return hs

def start_circle(db, circle):
    if circle.status == "active" and open_round(db, circle): raise HTTPException(409, "This circle has already started.")
    hs = check_ready(db, circle)
    for h, _ in hs: h.joins_next_cycle = False
    if circle.status == "draft": circle.started_at = now()
    circle.status = "active"
    last = db.query(func.max(ChamaMgrRound.round_no)).filter_by(circle_id=circle.id).scalar() or 0
    new_round(db, circle, 1, last + 1, hs[0][1].id)

def pay_out(db, circle, rnd, plan_, treasurer_id):
    """Close the round, post the payout and open the next one. Returns (recipient, pot, new_cycle, next_turn)."""
    rec = db.get(GroupMember, rnd.recipient_member_id); pot = plan_["pot"]
    rnd.status, rnd.paid_out_amount, rnd.paid_out_at, rnd.paid_out_by_rider_id = "paid_out", pot, now(), treasurer_id
    rnd.self_paid = bool(rec.linked_rider_id and rec.linked_rider_id == treasurer_id)       # the Treasurer paid THEMSELVES
    post(db, circle.group_id, rec.id, treasurer_id, "mgr_payout", "out", pot, "mgr_round", rnd.id, circle_id=circle.id)
    hs = hands_of(db, circle); with_turn = [(h, m) for h, m in hs if h.turn_no is not None]
    nxt, new_cycle = rnd.turn_no + 1, False
    if nxt > len(with_turn):                                    # last turn done: a new cycle (season) begins
        nxt, new_cycle = 1, True; circle.cycle_no += 1
        apply_pending(circle)                                   # changes saved mid-cycle take effect now
        if len(with_turn) == len(hs):                           # nobody joined meanwhile: same order, round opens straight away
            nm = with_turn[0][1]
            new_round(db, circle, 1, rnd.round_no + 1, nm.id, after_today=True)
        # otherwise the Treasurer gives the new people their turns and starts the new season (state: needs_season_setup)
    else:
        nm = next(m for h, m in with_turn if h.turn_no == nxt)
        new_round(db, circle, nxt, rnd.round_no + 1, nm.id, after_today=True)
    if rec.linked_rider_id:
        notify(db, "rider", rec.linked_rider_id, "mgr_payout_received", "Your Merry-Go-Round payout",
               f"KSh {pot:,.0f} has been paid out to you from {circle.name} by your Treasurer.", "mgr_round", rnd.id)
    db.flush()
    expire_stale_swaps(db, circle)                              # a turn became current: swaps that need it are cancelled
    return rec, pot, new_cycle, nxt

# ───────────────────────────── swaps ─────────────────────────────
OPEN = ("member", "treasurer")

def hand_at(db, circle, turn):
    return next(((h, m) for h, m in turn_hands(db, circle) if h.turn_no == turn), (None, None))

def swap_approvers(db, g, s):
    """The group's Treasurer approves every swap."""
    return [g.treasurer_rider_id]

def _consecutive(turns) -> Optional[tuple]:
    t = sorted(turns)
    return next(((a, b) for a, b in zip(t, t[1:]) if b - a == 1), None)

def swap_effect(db, circle, s) -> dict:
    """Plain-language effect of a swap and warnings about double-turn riders ending up with back-to-back turns."""
    a, b = db.get(GroupMember, s.requester_member_id), db.get(GroupMember, s.target_member_id)
    ta, tb = s.turn_a, s.turn_b
    text = f"{first(a.full_name)} moves from Turn {ta} to Turn {tb} and {first(b.full_name)} from Turn {tb} to Turn {ta}"
    warnings, mine = [], defaultdict(list)
    for h, m in turn_hands(db, circle): mine[m.id].append(h.turn_no)
    for m, old, new in ((a, ta, tb), (b, tb, ta)):
        after = [new if t == old else t for t in mine[m.id]]
        pair = _consecutive(after) if len(after) > 1 else None
        if pair:
            warnings.append({"member": m.full_name, "turns": list(pair),
                             "text": f"{first(m.full_name)} would then have Turn {pair[0]} and Turn {pair[1]} back to back."})
    rnd = open_round(db, circle)
    dates = {}
    if rnd:
        for t in (ta, tb):
            ds = sch.turn_dates(circle.sched, rnd.deadline, max(1, t - rnd.turn_no + 1))
            d = ds[t - rnd.turn_no] if t >= rnd.turn_no and t - rnd.turn_no < len(ds) else None
            dates[t] = d.isoformat() if d else None
    return {"text": text, "warnings": warnings, "dates": {str(k): v for k, v in dates.items()}}

def swap_view(db, circle, s) -> dict:
    a, b = db.get(GroupMember, s.requester_member_id), db.get(GroupMember, s.target_member_id)
    out = {"id": str(s.id), "reference": s.reference, "circle_id": str(s.circle_id), "circle": circle.name, "stage": s.stage,
           "a": a.full_name, "b": b.full_name, "a_member_id": str(a.id), "b_member_id": str(b.id),
           "turn_a": s.turn_a, "turn_b": s.turn_b, "reason": s.reason, "note": s.note,
           "requested_at": s.requested_at.isoformat() if s.requested_at else None,
           "agreed_at": s.agreed_at.isoformat() if s.agreed_at else None,
           "closed_at": s.closed_at.isoformat() if s.closed_at else None,
           "expires_at": swap_deadline(s).isoformat() if s.stage in OPEN else None}
    out["effect"] = swap_effect(db, circle, s)
    return out

def swap_deadline(s) -> datetime:
    base = s.agreed_at if s.stage == "treasurer" and s.agreed_at else s.requested_at
    return base + timedelta(days=SWAP_WAIT_DAYS)

def _riders_to_tell(db, g, s, include_treasurer=True) -> list:
    ids = []
    for mid in (s.requester_member_id, s.target_member_id):
        r = db.get(GroupMember, mid).linked_rider_id
        if r: ids.append(r)
    if include_treasurer and g.treasurer_rider_id: ids.append(g.treasurer_rider_id)
    seen = []
    for r in ids:
        if r not in seen: seen.append(r)
    return seen

def close_swap(db, g, circle, s, stage, note, decided_by=None, tell=True):
    """Single place where a swap leaves the open states, so history and notifications are always written.
    The two riders are always told. The Treasurer is told when the swap was approved/declined or had reached them."""
    was = s.stage
    s.stage, s.note, s.closed_at = stage, note, now()
    if decided_by: s.decided_at, s.decided_by_rider_id = now(), decided_by
    complete(db, "mgr_swap", s.id, "decided")
    if not tell: return
    title = {"done": "Turn swap approved", "declined": "Turn swap not approved",
             "cancelled": "Turn swap cancelled", "expired": "Turn swap expired"}[stage]
    eff = swap_effect(db, circle, s)["text"] if stage == "done" else None
    body = f"{eff}. {note}" if eff else f"{circle.name}: Turn {s.turn_a} and Turn {s.turn_b}. {note}"
    for rid_ in _riders_to_tell(db, g, s, include_treasurer=(stage in ("done", "declined") or was == "treasurer")):
        notify(db, "rider", rid_, "swap_result", title, body, "mgr_swap", s.id)

def expire_stale_swaps(db, circle=None, group_id=None) -> list:
    """Lazy housekeeping, run whenever swaps are read or a round is paid out (so it needs no background job):
       * a request that waited longer than SWAP_WAIT_DAYS at its stage expires;
       * a request is cancelled when either of its turns is now the current turn (or already paid)."""
    q = db.query(ChamaMgrSwap).filter(ChamaMgrSwap.stage.in_(OPEN))
    if circle is not None: q = q.filter(ChamaMgrSwap.circle_id == circle.id)
    elif group_id is not None: q = q.filter(ChamaMgrSwap.group_id == group_id)
    changed = []
    for s in q.with_for_update().all():
        c = circle if circle is not None and circle.id == s.circle_id else db.get(ChamaMgrCircle, s.circle_id)
        g = db.get(BodaGroup, s.group_id); cur = current_turn(db, c)
        if cur is not None and min(s.turn_a, s.turn_b) <= cur:
            close_swap(db, g, c, s, "cancelled", f"Cancelled automatically: Turn {min(s.turn_a, s.turn_b)} is now the current turn.")
            changed.append(s)
        elif now() > swap_deadline(s):
            close_swap(db, g, c, s, "expired", f"No answer within {SWAP_WAIT_DAYS} days, so the request expired. You can send a new one.")
            changed.append(s)
    if changed: db.flush()
    return changed

def replace_member(db, g, circle, leaver_id, replacement_id):
    """REPLACE A MEMBER. The replacement takes every turn of the leaver (the turns keep their numbers) and, when the leaver holds
    the open round, that round. Money the leaver already paid into the open round stays in the pot and now counts for the
    replacement. Earlier rounds keep the leaver's name (history). Refused only while a swap involving the leaver is waiting."""
    if leaver_id == replacement_id: raise HTTPException(422, "Choose a different member as the replacement.")
    hands = db.query(ChamaMgrHand).filter_by(circle_id=circle.id, member_id=leaver_id).all()
    if not hands: raise HTTPException(404, "That member is not in this circle.")
    rep = db.query(GroupMember).filter_by(id=replacement_id, group_id=g.id, status="active").first()
    if not rep: raise HTTPException(404, "The replacement must be an active member of this group.")
    if db.query(ChamaMgrHand.id).filter_by(circle_id=circle.id, member_id=rep.id).first():
        raise HTTPException(409, "That member is already in this circle. Choose someone who is not.")
    waiting = db.query(ChamaMgrSwap.id).filter(
        ChamaMgrSwap.circle_id == circle.id, ChamaMgrSwap.stage.in_(OPEN),
        or_(ChamaMgrSwap.requester_member_id == leaver_id, ChamaMgrSwap.target_member_id == leaver_id)).first()
    if waiting:
        raise HTTPException(409, "A turn swap involving this member is still waiting. Let it finish or cancel it first.")
    for h in hands: h.member_id = rep.id
    rnd = open_round(db, circle, lock=True)
    if rnd:
        if rnd.recipient_member_id == leaver_id: rnd.recipient_member_id = rep.id
        db.query(ChamaContribution).filter(ChamaContribution.round_id == rnd.id, ChamaContribution.member_id == leaver_id,
                                           ChamaContribution.status != "rejected").update({"member_id": rep.id}, synchronize_session=False)
        db.query(ChamaMgrException).filter_by(round_id=rnd.id, member_id=leaver_id).update({"member_id": rep.id}, synchronize_session=False)
    # No notification: like adding a member, a replacement shows up in the rider's My Savings by itself.
    db.flush()

def swap_busy_turns(db, circle) -> set:
    out = set()
    for s in db.query(ChamaMgrSwap).filter(ChamaMgrSwap.circle_id == circle.id, ChamaMgrSwap.stage.in_(OPEN)):
        out |= {s.turn_a, s.turn_b}
    return out

def request_swap(db, circle, requester, my_turn, other_turn, reason):
    g = db.get(BodaGroup, circle.group_id); rnd = open_round(db, circle)
    if not rnd: raise HTTPException(409, "No round is open yet.")
    h_me, m_me = hand_at(db, circle, my_turn); h_ot, m_ot = hand_at(db, circle, other_turn)
    if not h_me or m_me.id != requester.id: raise HTTPException(409, "That is not your turn.")
    if my_turn <= rnd.turn_no: raise HTTPException(409, "Your turn has already come, so it cannot be swapped.")
    if not h_ot: raise HTTPException(404, "Choose another turn in this circle.")
    if other_turn <= rnd.turn_no: raise HTTPException(409, "That turn has already come.")
    if m_ot.id == requester.id: raise HTTPException(409, "Choose a turn that belongs to someone else.")
    if not m_ot.linked_rider_id: raise HTTPException(409, "That member has not signed in yet, so they cannot agree.")
    busy = swap_busy_turns(db, circle)
    if my_turn in busy or other_turn in busy:
        raise HTTPException(409, "One of these turns already has a swap request in progress.")
    s = ChamaMgrSwap(reference=new_ref("SWP"), group_id=g.id, circle_id=circle.id, requester_member_id=requester.id,
                     target_member_id=m_ot.id, turn_a=my_turn, turn_b=other_turn, reason=(reason or "").strip() or None, stage="member")
    db.add(s)
    try: db.flush()
    except Exception:
        db.rollback(); raise HTTPException(409, "One of these turns already has a swap request in progress.")
    eff = swap_effect(db, circle, s)["text"]
    notify(db, "rider", m_ot.linked_rider_id, "swap_request_incoming", "Turn swap request",
           f"{requester.full_name} asks to swap turns in {circle.name}: {eff}. Tap to agree.", "mgr_swap", s.id)
    return s

def agree_swap(db, g, circle, s, member):
    if s.stage != "member": raise HTTPException(409, "This request is no longer waiting for you.")
    h, m = hand_at(db, circle, s.turn_b)
    if not m or m.id != member.id: raise HTTPException(409, "That turn is no longer yours.")
    s.stage, s.agreed_at = "treasurer", now()
    complete(db, "mgr_swap", s.id, "decided", kind="swap_request_incoming")
    req = db.get(GroupMember, s.requester_member_id); eff = swap_effect(db, circle, s)
    for rid_ in swap_approvers(db, g, s):
        notify(db, "rider", rid_, "swap_needs_approval", "Turn swap to approve",
               f"{req.full_name} and {member.full_name} agreed. {eff['text']}." + (" " + " ".join(w["text"] for w in eff["warnings"]) if eff["warnings"] else ""),
               "mgr_swap", s.id)
    if req.linked_rider_id:
        notify(db, "rider", req.linked_rider_id, "swap_agreed", "Swap agreed",
               f"{first(member.full_name)} agreed. Waiting for the Treasurer to approve.", "mgr_swap", s.id)

def cancel_swap(db, g, circle, s):
    if s.stage not in OPEN: raise HTTPException(409, "This request can no longer be cancelled.")
    close_swap(db, g, circle, s, "cancelled", "Cancelled by the rider who asked.")

def decide_swap(db, g, circle, s, approve: bool, rider):
    if s.stage != "treasurer": raise HTTPException(409, "This was already decided or is not ready for approval.")
    who = "the Treasurer"
    rnd = open_round(db, circle)
    if approve:
        ha, ma = hand_at(db, circle, s.turn_a); hb, mb = hand_at(db, circle, s.turn_b)
        if rnd is None or s.turn_a <= rnd.turn_no or s.turn_b <= rnd.turn_no:
            close_swap(db, g, circle, s, "declined", "One of the turns has already been paid.", decided_by=rider.id)
            return False, "One of the turns has already been paid."
        if not ha or not hb or ma.id != s.requester_member_id or mb.id != s.target_member_id:
            close_swap(db, g, circle, s, "declined", "One of the turns changed hands since this was requested.", decided_by=rider.id)
            return False, "One of the turns changed hands since this was requested."
        ha.turn_no = hb.turn_no = None; db.flush()               # clear first: the unique index never clashes
        ha.turn_no, hb.turn_no = s.turn_b, s.turn_a
        db.flush()
        close_swap(db, g, circle, s, "done", f"Approved by {who}.", decided_by=rider.id)
        return True, None
    close_swap(db, g, circle, s, "declined", f"Declined by {who}.", decided_by=rider.id)
    return True, None

def cancel_open_swaps(db, circle, note):
    g = db.get(BodaGroup, circle.group_id)
    for s in db.query(ChamaMgrSwap).filter(ChamaMgrSwap.circle_id == circle.id, ChamaMgrSwap.stage.in_(OPEN)).with_for_update():
        close_swap(db, g, circle, s, "cancelled", note)