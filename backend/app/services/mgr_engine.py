# backend/app/services/mgr_engine.py
"""Merry-Go-Round engine: circles, turns, rounds and payouts.

Vocabulary
  group   one Treasurer's Chama (boda_group). It has a type, "mgr" for a Merry-Go-Round.
  circle  a Merry-Go-Round inside the group. A group can run several (for example Daily and Weekly). Each has its own
          amount, payout schedule, people, turn order, rounds and pot.
  hand    one turn per cycle. Every person has exactly one hand (hand_no is always 1): there are no double turns.
  round   one payout. The recipient is whoever holds the current turn.

Money rules: the pot is the confirmed contributions of the round; a round is paid out only once everyone who owes has paid
(or the Treasurer has noted an exception). By default the recipient does not pay for the turn being received; a circle can
switch that on (recipient_pays).

A circle has TWO schedules. `sched` is when the pool is paid out. `contrib_sched` is when members contribute (optional;
missing = once per payout). A round covers the period since the previous payout and each hand owes
unit amount x contribution dates in that period. Members are "behind" when they have paid (counting payments that wait for the
Treasurer) less than the contribution dates that have already passed.

Turn order, amount, both schedules and the two switches are fixed while a cycle runs. They can be changed only BEFORE a cycle
starts: when the circle is first saved, and again when a cycle has ended and the next one is waiting for the Treasurer.
A new cycle NEVER starts by itself: after the last turn is paid the circle waits (needs_season_setup) until the Treasurer has
reviewed the settings and confirmed (start_circle).
"""
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.boda_group import BodaGroup, GroupMember, AppNotification
from app.models.chama_finance import (ChamaContribution, ChamaMgrRound, ChamaMgrCircle,
                                      ChamaMgrHand, ChamaMgrException)
from app.services import mgr_schedule as sch
from app.services.chama_finance_service import mgr_paid_by_member, post, ZERO
from app.services.notification_service import notify

EXC_REASONS = ["Passed away", "Sickness or emergency", "Accident", "Other (group agreed)"]
now = lambda: datetime.now(timezone.utc)

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
    """True while the circle is mid-cycle: the money rules and the turn order may not change until the cycle has ended."""
    if circle.status != "active": return False
    rnd = rnd or open_round(db, circle)
    return rnd is not None and not order_editable(db, circle, rnd)

def apply_pending(circle):
    """Legacy: rule changes that an older version saved mid-cycle (pending_cfg) are folded in when the cycle ends.
    Nothing creates pending_cfg any more; rules are now changed before the next cycle starts."""
    for k, v in (circle.pending_cfg or {}).items():
        if k in CFG_KEYS: setattr(circle, k, Decimal(str(v)) if k == "amount" else v)
    circle.pending_cfg = None

def effective(circle) -> dict:
    """The rules that apply to the cycle that is about to start (any legacy pending change laid over the current ones)."""
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
    """The turn order may be rewritten until the FIRST payout of a cycle: before the circle starts, between two cycles, or while
    the open round is turn 1 and nobody has paid into it. After that the order is fixed until the cycle ends."""
    if rnd is None: return True
    if rnd.turn_no != 1: return False
    return db.query(ChamaContribution.id).filter(ChamaContribution.round_id == rnd.id,
                                                  ChamaContribution.status != "rejected").first() is None

def close_gaps(db, circle):
    """After someone leaves, number the remaining turns 1, 2, 3 ... again (in their old order)."""
    rest = sorted([h for h in db.query(ChamaMgrHand).filter_by(circle_id=circle.id) if h.turn_no is not None], key=lambda h: h.turn_no)
    for h in rest: h.turn_no = None
    db.flush()                                                   # clear first so the unique index never clashes
    for i, h in enumerate(rest, 1): h.turn_no = i
    db.flush()

def remove_from_circle(db, circle, member_id):
    """Take a member out of a circle. Allowed before the circle starts, for someone who has not started yet (joins the next cycle),
    and BETWEEN cycles, while the Treasurer prepares the next round. Never while a cycle is running: the turns are fixed."""
    hs = db.query(ChamaMgrHand).filter_by(circle_id=circle.id, member_id=member_id).all()
    if not hs: raise HTTPException(404, "That member is not in this circle.")
    rnd = open_round(db, circle)
    if circle.status == "active" and rnd is not None and any(not h.joins_next_cycle for h in hs):
        raise HTTPException(409, "This member cannot be removed while the round is running. You can do it when the round ends, before the next round starts.")
    for h in hs: db.delete(h)
    db.flush()
    if circle.status == "draft" or rnd is None: close_gaps(db, circle)       # keep turns 1, 2, 3 ...

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
        roster.append({"member_id": str(mid), "name": m.full_name, "phone": m.phone, "turns": turns,
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
        out.append({"turn": h.turn_no, "hand_no": h.hand_no, "member_id": str(m.id), "name": m.full_name, "phone": m.phone,
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
                        "pending": p["pending"], "behind_count": p["behind_count"], "unit_amount": rnd.unit_amount, "contrib_count": rnd.contrib_count or 1,
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
    """Start the circle (first time) or the NEXT cycle. Only ever called by the Treasurer, after reviewing the settings."""
    if circle.status == "active" and open_round(db, circle): raise HTTPException(409, "This circle has already started.")
    hs = check_ready(db, circle)
    for h, _ in hs: h.joins_next_cycle = False
    if circle.status == "draft": circle.started_at = now()
    circle.status = "active"
    last = db.query(func.max(ChamaMgrRound.round_no)).filter_by(circle_id=circle.id).scalar() or 0
    paid_today = db.query(ChamaMgrRound.id).filter(ChamaMgrRound.circle_id == circle.id, ChamaMgrRound.status == "paid_out",
                                                   func.date(ChamaMgrRound.paid_out_at) == date.today()).first() is not None
    new_round(db, circle, 1, last + 1, hs[0][1].id, after_today=paid_today)

def pay_out(db, circle, rnd, plan_, treasurer_id):
    """Close the round and post the payout. The next TURN of the same cycle opens at once. When the last turn of the cycle is
    paid, the cycle ends and NO new round is opened: the Treasurer reviews the settings and starts the next cycle herself/himself
    (state needs_season_setup). Returns (recipient, pot, cycle_ended, next_turn)."""
    rec = db.get(GroupMember, rnd.recipient_member_id); pot = plan_["pot"]
    rnd.status, rnd.paid_out_amount, rnd.paid_out_at, rnd.paid_out_by_rider_id = "paid_out", pot, now(), treasurer_id
    rnd.self_paid = bool(rec.linked_rider_id and rec.linked_rider_id == treasurer_id)       # the Treasurer paid THEMSELVES
    post(db, circle.group_id, rec.id, treasurer_id, "mgr_payout", "out", pot, "mgr_round", rnd.id, circle_id=circle.id)
    hs = hands_of(db, circle); with_turn = [(h, m) for h, m in hs if h.turn_no is not None]
    nxt, cycle_ended = rnd.turn_no + 1, False
    if nxt > len(with_turn):                                    # last turn done: the cycle is over
        nxt, cycle_ended = 1, True; circle.cycle_no += 1
        apply_pending(circle)
        notify_start_review(db, circle)
    else:
        nm = next(m for h, m in with_turn if h.turn_no == nxt)
        new_round(db, circle, nxt, rnd.round_no + 1, nm.id, after_today=True)
    if rec.linked_rider_id:
        notify(db, "rider", rec.linked_rider_id, "mgr_payout_received", "Your Merry-Go-Round payout",
               f"KSh {pot:,.0f} has been paid out to you from {circle.name} by your Treasurer.", "mgr_round", rnd.id)
    db.flush()
    return rec, pot, cycle_ended, nxt

def notify_start_review(db, circle):
    """Tell the Treasurer that the cycle is over and the next one is waiting for their review. Nothing starts by itself."""
    g = db.get(BodaGroup, circle.group_id)
    if g and g.treasurer_rider_id:
        notify(db, "rider", g.treasurer_rider_id, "mgr_cycle_ended", "Ready for the next round",
               f"{circle.name} has finished. Check the settings and start the next round when you are ready.", "mgr_circle", circle.id)