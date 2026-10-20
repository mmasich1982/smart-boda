# backend/app/models/chama_finance.py
import uuid
from sqlalchemy import Column, String, Integer, SmallInteger, Boolean, Text, Date, DateTime, Numeric, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base

def _pk(): return Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
def _fk(t, **k): return Column(UUID(as_uuid=True), ForeignKey(t), **k)
M = Numeric(12, 2)

class ChamaConfig(Base):
    __tablename__ = "chama_config"
    group_id = Column(UUID(as_uuid=True), ForeignKey("boda_group.id"), primary_key=True)
    chama_type = Column(String(5), nullable=False)
    interest_rate_pct = Column(Numeric(5, 2), nullable=False, default=5)
    max_loan_multiple = Column(Numeric(4, 1), nullable=False, default=3)
    max_loan_months = Column(SmallInteger, nullable=False, default=4)
    min_loan_amount = Column(M, nullable=False, default=1000)
    opening_pool = Column(M, nullable=False, default=0)
    min_contributions_for_loan = Column(SmallInteger, nullable=False, default=0)
    meeting_week = Column(String(5), nullable=False, default='2nd')
    meeting_day = Column(String(9), nullable=False, default='Sunday')
    cycle_month = Column(String(3), nullable=False, default='Dec')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class ChamaCategory(Base):
    __tablename__ = "chama_category"
    id = _pk(); group_id = _fk("boda_group.id", nullable=False)
    freq = Column(String(10), nullable=False); amount = Column(M, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class ChamaContribution(Base):
    __tablename__ = "chama_contribution"
    id = _pk(); reference = Column(String(24), unique=True, nullable=False)
    group_id = _fk("boda_group.id", nullable=False); member_id = _fk("group_member.id", nullable=False)
    round_id = _fk("chama_mgr_round.id")
    amount = Column(M, nullable=False); method = Column(String(6), nullable=False); channel = Column(String(10))
    status = Column(String(10), nullable=False, default="pending"); reject_reason = Column(Text)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    decided_at = Column(DateTime(timezone=True)); decided_by_rider_id = _fk("rider.id")

class ChamaLoanApplication(Base):
    __tablename__ = "chama_loan_application"
    id = _pk(); reference = Column(String(24), unique=True, nullable=False)
    group_id = _fk("boda_group.id", nullable=False); member_id = _fk("group_member.id", nullable=False)
    amount = Column(M, nullable=False); months = Column(SmallInteger, nullable=False); purpose = Column(String(80))
    rate_pct = Column(Numeric(5, 2), nullable=False)
    interest = Column(M, nullable=False); total = Column(M, nullable=False); installment = Column(M, nullable=False)
    status = Column(String(10), nullable=False, default="pending"); reject_reason = Column(Text)
    loan_id = _fk("chama_loan.id")
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    decided_at = Column(DateTime(timezone=True)); decided_by_rider_id = _fk("rider.id")

class ChamaLoan(Base):
    __tablename__ = "chama_loan"
    id = _pk(); reference = Column(String(24), unique=True, nullable=False)
    application_id = _fk("chama_loan_application.id", nullable=True, unique=True)
    group_id = _fk("boda_group.id", nullable=False); member_id = _fk("group_member.id", nullable=False)
    principal = Column(M, nullable=False); rate_pct = Column(Numeric(5, 2), nullable=False)
    months = Column(SmallInteger, nullable=False)
    interest = Column(M, nullable=False); total = Column(M, nullable=False); installment = Column(M, nullable=False)
    paid = Column(M, nullable=False, default=0); status = Column(String(10), nullable=False, default="active")
    is_migrated = Column(Boolean, nullable=False, default=False)
    opening_principal = Column(M)
    opening_interest = Column(M)
    due_date = Column(Date)
    disbursed_at = Column(DateTime(timezone=True), server_default=func.now()); cleared_at = Column(DateTime(timezone=True))
    

class ChamaLoanPayment(Base):
    __tablename__ = "chama_loan_payment"
    id = _pk(); reference = Column(String(24), unique=True, nullable=False)
    loan_id = _fk("chama_loan.id", nullable=False)
    group_id = _fk("boda_group.id", nullable=False); member_id = _fk("group_member.id", nullable=False)
    amount = Column(M, nullable=False); method = Column(String(6), nullable=False); channel = Column(String(10))
    status = Column(String(10), nullable=False, default="pending")
    interest_part = Column(M); reject_reason = Column(Text)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    decided_at = Column(DateTime(timezone=True)); decided_by_rider_id = _fk("rider.id")

class ChamaLedger(Base):
    __tablename__ = "chama_ledger"
    id = _pk(); group_id = _fk("boda_group.id", nullable=False); member_id = _fk("group_member.id")
    circle_id = _fk("chama_mgr_circle.id")
    treasurer_rider_id = _fk("rider.id", nullable=False)
    entry_type = Column(String(30), nullable=False); direction = Column(String(3), nullable=False)
    amount = Column(M, nullable=False); ref_type = Column(String(30), nullable=False)
    ref_id = Column(UUID(as_uuid=True), nullable=False)
    posted_at = Column(DateTime(timezone=True), server_default=func.now())

class ChamaStatementLog(Base):
    __tablename__ = "chama_statement_log"
    id = _pk(); reference = Column(String(24), unique=True, nullable=False)
    group_id = _fk("boda_group.id", nullable=False); generated_by_rider_id = _fk("rider.id", nullable=False)
    period_start = Column(Date, nullable=False); period_end = Column(Date, nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
 
class ChamaMgrRound(Base):
    __tablename__ = "chama_mgr_round"
    id = _pk(); group_id = _fk("boda_group.id", nullable=False); circle_id = _fk("chama_mgr_circle.id", nullable=False)
    cycle_no = Column(SmallInteger, nullable=False, default=1); round_no = Column(Integer, nullable=False)
    turn_no = Column(SmallInteger, nullable=False); recipient_member_id = _fk("group_member.id", nullable=False)
    amount_per_member = Column(M, nullable=False); deadline = Column(Date, nullable=False)
    status = Column(String(10), nullable=False, default="open")
    paid_out_amount = Column(M); paid_out_at = Column(DateTime(timezone=True)); paid_out_by_rider_id = _fk("rider.id")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ChamaMgrSwap(Base):
    """A request to swap two TURNS in a circle. Stages: member (waiting for the other rider to agree) -> treasurer
    (waiting for approval) -> done | declined (by the Treasurer only) | cancelled | expired. The other rider can only
    agree: there is no decline from them, so a refusal has no state."""
    __tablename__ = "chama_mgr_swap"
    id = _pk(); reference = Column(String(24), unique=True, nullable=False)
    group_id = _fk("boda_group.id", nullable=False); circle_id = _fk("chama_mgr_circle.id", nullable=False)
    requester_member_id = _fk("group_member.id", nullable=False)
    target_member_id = _fk("group_member.id", nullable=False)
    turn_a = Column(SmallInteger, nullable=False); turn_b = Column(SmallInteger, nullable=False)       # requester's turn, the other turn
    reason = Column(String(120)); stage = Column(String(10), nullable=False, default="member"); note = Column(Text)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    agreed_at = Column(DateTime(timezone=True)); decided_at = Column(DateTime(timezone=True))
    closed_at = Column(DateTime(timezone=True))
    decided_by_rider_id = _fk("rider.id")

class ChamaMgrCircle(Base):
    __tablename__ = "chama_mgr_circle"
    id = _pk(); group_id = _fk("boda_group.id", nullable=False)
    name = Column(String(40), nullable=False); amount = Column(M, nullable=False, default=0)
    sched = Column(JSONB, nullable=False, default=lambda: {"type": "weekly", "day": 6})
    status = Column(String(8), nullable=False, default="draft"); cycle_no = Column(SmallInteger, nullable=False, default=1)
    started_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class ChamaMgrHand(Base):
    """One hand = one turn per cycle. A double-turn person has two hands."""
    __tablename__ = "chama_mgr_hand"
    id = _pk(); circle_id = _fk("chama_mgr_circle.id", nullable=False); member_id = _fk("group_member.id", nullable=False)
    hand_no = Column(SmallInteger, nullable=False, default=1); turn_no = Column(SmallInteger)
    joins_next_cycle = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ChamaMgrException(Base):
    __tablename__ = "chama_mgr_exception"
    id = _pk(); round_id = _fk("chama_mgr_round.id", nullable=False); member_id = _fk("group_member.id", nullable=False)
    reason = Column(String(40), nullable=False); note = Column(String(80)); created_by_rider_id = _fk("rider.id")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ChamaTbSecurity(Base):
    __tablename__ = "chama_tb_security"
    group_id = Column(UUID(as_uuid=True), ForeignKey("boda_group.id"), primary_key=True)
    mode = Column(String(8), nullable=False, default="none")                      # none | optional | required (off by default)
    from_amount = Column(M, nullable=False, default=0)                            # security only asked for loans at or above this amount
    haircut_pct = Column(SmallInteger, nullable=False, default=70)                # papers/items count at this % of their value (savings count in full)
    cover_pct = Column(SmallInteger, nullable=False, default=100)
    savings_on = Column(Boolean, nullable=False, default=True); savings_pct = Column(SmallInteger, nullable=False, default=100)
    allow_title = Column(Boolean, nullable=False, default=False); allow_logbook = Column(Boolean, nullable=False, default=False)
    allow_chattel = Column(Boolean, nullable=False, default=False)
    guar_on = Column(Boolean, nullable=False, default=False)
    guar_max = Column(SmallInteger, nullable=False, default=1)                    # guarantors are optional: there is no minimum
    guar_savings = Column(Boolean, nullable=False, default=True); guar_title = Column(Boolean, nullable=False, default=False)
    guar_logbook = Column(Boolean, nullable=False, default=False); guar_chattel = Column(Boolean, nullable=False, default=False)
    keeper = Column(String(12), nullable=False, default="Treasurer")
    valuation = Column(String(80), nullable=False, default="Treasurer and one official")
    verify = Column(String(80), nullable=False, default="Check the original document or serial number")
    release_rule = Column(String(80), nullable=False, default="Released when the loan is fully repaid")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class ChamaLoanSecurity(Base):
    """One thing a borrower puts up for a loan: locked savings, a logbook, a title deed, a household item, or a guarantor."""
    __tablename__ = "chama_loan_security"
    id = _pk(); group_id = _fk("boda_group.id", nullable=False); member_id = _fk("group_member.id", nullable=False)
    application_id = _fk("chama_loan_application.id"); loan_id = _fk("chama_loan.id")
    kind = Column(String(10), nullable=False); description = Column(String(120), nullable=False, default="")
    ref = Column(String(60), nullable=False, default=""); value = Column(M, nullable=False)
    guarantor_member_id = _fk("group_member.id"); guarantor_form = Column(String(10))
    status = Column(String(20), nullable=False, default="submitted")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    answered_at = Column(DateTime(timezone=True)); checked_at = Column(DateTime(timezone=True))
    checked_by_rider_id = _fk("rider.id"); released_at = Column(DateTime(timezone=True))
