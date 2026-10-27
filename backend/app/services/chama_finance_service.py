# backend/app/services/chama_finance_service.py
import math, secrets
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.boda_group import GroupMember, BodaGroup
from app.models.chama_finance import (ChamaConfig, ChamaContribution, ChamaLoan, ChamaLedger)
from datetime import date
from app.models.chama_finance import ChamaLoanApplication, ChamaLoanPayment

ZERO = Decimal("0")

def new_ref(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(4).upper()}"

def calc_loan(amount, months: int, rate):
    """Same formula as the prototype's lnCalc: simple interest, equal monthly instalments."""
    a, r = Decimal(amount), Decimal(rate)
    interest = (a * r / 100 * months).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    total = a + interest
    return interest, total, Decimal(math.ceil(total / months))

def members_for_rider(db: Session, rider_id):
    """EVERY active membership of a signed-in rider (oldest first). A rider can belong to several groups at once."""
    return db.query(GroupMember).filter(GroupMember.linked_rider_id == rider_id, GroupMember.status == "active")\
             .order_by(GroupMember.created_at, GroupMember.id).all()

def member_for_rider(db: Session, rider_id, group_id=None):
    """The rider's membership in ONE group. Pass group_id to pick it; without it the oldest membership is used
    (older app versions never send a group)."""
    q = db.query(GroupMember).filter(GroupMember.linked_rider_id == rider_id, GroupMember.status == "active")
    if group_id is not None: q = q.filter(GroupMember.group_id == group_id)
    return q.order_by(GroupMember.created_at, GroupMember.id).first()

def savings_of(db: Session, member_id) -> Decimal:
    """Opening balance (set once at onboarding) + every confirmed Table Banking contribution."""
    m = db.get(GroupMember, member_id)
    confirmed = db.query(func.coalesce(func.sum(ChamaContribution.amount), 0)).filter(
        ChamaContribution.member_id == member_id, ChamaContribution.status == "confirmed",
        ChamaContribution.round_id.is_(None)).scalar()
    return Decimal(m.opening_savings or 0) + Decimal(confirmed)

def active_loan(db: Session, member_id):
    return db.query(ChamaLoan).filter_by(member_id=member_id, status="active").first()

def borrowing(db: Session, member, cfg: ChamaConfig) -> dict:
    """Borrowing power. Savings a member has COMMITTED as loan security (their own pledge, or savings they back someone else with)
    cannot be borrowed against, so only the uncommitted part of their savings counts toward the limit:
        limit     = (savings - committed savings) x borrowing multiple
        available = limit - balance still owed on a running loan
    e.g. savings 30,000, all of it pledged to their own loan -> limit 0.  Savings 20,000 with 10,000 backing another member -> the limit
    is worked out on 10,000."""
    from app.services.tb_security import locked_savings        # imported here: tb_security imports this module
    sav = Decimal(savings_of(db, member.id))
    committed = min(sav, Decimal(locked_savings(db, member.id)))
    limit = (sav - committed) * Decimal(cfg.max_loan_multiple)
    loan = active_loan(db, member.id)
    balance = (loan.total - loan.paid) if loan else ZERO
    return {"savings": sav, "committed": committed, "limit": limit, "balance": balance, "available": max(ZERO, limit - balance)}

def pool_cash(db: Session, group_id, cfg: ChamaConfig) -> Decimal:
    """Cash the group can lend now = opening pool + money in - money out."""
    def s(d): return db.query(func.coalesce(func.sum(ChamaLedger.amount), 0)).filter(
        ChamaLedger.group_id == group_id, ChamaLedger.direction == d).scalar()
    return Decimal(cfg.opening_pool) + Decimal(s("in")) - Decimal(s("out"))

def post(db: Session, group_id, member_id, treasurer_id, entry_type, direction, amount, ref_type, ref_id, circle_id=None):
    db.add(ChamaLedger(group_id=group_id, member_id=member_id, treasurer_rider_id=treasurer_id, circle_id=circle_id,
        entry_type=entry_type, direction=direction, amount=amount, ref_type=ref_type, ref_id=ref_id))

def eligibility(db: Session, member, cfg, group) -> dict:
    b = borrowing(db, member, cfg)
    count = db.query(func.count(ChamaContribution.id)).filter(
        ChamaContribution.member_id == member.id, ChamaContribution.status == "confirmed",
        ChamaContribution.round_id.is_(None)).scalar()
    last = db.query(func.max(ChamaContribution.decided_at)).filter(
        ChamaContribution.member_id == member.id, ChamaContribution.status == "confirmed").scalar()
    why = []
    if group.status != "active": why.append("Your group is inactive.")
    if active_loan(db, member.id): why.append("You have an active loan. Repay it before applying again.")
    if db.query(ChamaLoanApplication.id).filter_by(member_id=member.id, status="pending").first():
        why.append("You already have an application awaiting your Treasurer.")
    if cfg.min_contributions_for_loan and count < cfg.min_contributions_for_loan:
        why.append(f"You need at least {cfg.min_contributions_for_loan} confirmed contributions (you have {count}).")
    if b["available"] < cfg.min_loan_amount:
        why.append(f"Your available limit is below the minimum loan of KSh {cfg.min_loan_amount:,.0f}."
                   + (f" KSh {b['committed']:,.0f} of your savings is committed as loan security, so it does not count toward your limit." if b["committed"] > 0 else ""))
    return {"eligible": not why, "blockers": why, "savings": b["savings"], "opening_savings": member.opening_savings,
            "limit": b["limit"], "multiple": cfg.max_loan_multiple, "available": b["available"], "committed_savings": b["committed"],
            "confirmed_contributions": count, "required_contributions": cfg.min_contributions_for_loan,
            "last_contribution_at": last.isoformat() if last else None}

def mgr_paid_by_member(db: Session, round_id) -> dict:
    rows = db.query(ChamaContribution.member_id, func.sum(ChamaContribution.amount)).filter(
        ChamaContribution.round_id == round_id, ChamaContribution.status == "confirmed"
    ).group_by(ChamaContribution.member_id).all()
    return {mid: Decimal(total) for mid, total in rows}

def mgr_pot(db: Session, rnd) -> Decimal:
    return sum(mgr_paid_by_member(db, rnd.id).values(), ZERO)

def interest_paid(db: Session, loan_id) -> Decimal:
    """Interest already collected on a Table Banking loan (confirmed repayments only)."""
    return Decimal(db.query(func.coalesce(func.sum(ChamaLoanPayment.interest_part), 0)).filter(
        ChamaLoanPayment.loan_id == loan_id, ChamaLoanPayment.status == "confirmed").scalar())

def ensure_config(db: Session, g):
    """The group's Chama settings. When the administrator chose the group type, the settings exist from day one with
    sensible defaults, so the Treasurer is never asked to "choose a Chama type"."""
    cfg = db.get(ChamaConfig, g.id)
    if not cfg and g.group_type in ("mgr", "tb"):
        cfg = ChamaConfig(group_id=g.id, chama_type=g.group_type)
        db.add(cfg); db.flush()
    return cfg
