# backend/app/models/business_daily.py
# SMART BIZNA DAILY SUMMARIES and the app settings.
# DURING THE DAY the detailed tables (business_sale / business_purchase / business_expense and the Lipa Later tables) are the operational source of truth: every phone sends
# its lines as they are recorded. AT THE END OF THE DAY the server consolidates every user's lines of that day into ONE row of business_daily_summary (exactly one per
# business per day), then deletes the lines (open Lipa Later records and their payments stay until settled). Reports, statements, analytics, restore on another phone
# and the Owner's view of the whole team all read these daily rows (plus today's lines). Kept for one year.
#   business_daily_summary    one row per (business, EAT day): totals, payment-method / cost breakdowns, and by_person with every person's own figures
#   business_record_tombstone the client ids of lines already consolidated and deleted (kept 7 days) so a phone re-sending one after a lost reply cannot count it twice
#   app_setting               small key/value settings the Administrator can change (the statement fees; the support phone number)
import uuid
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Numeric, ForeignKey, Index, UniqueConstraint, CheckConstraint, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class BusinessDailySummary(Base):
    __tablename__ = "business_daily_summary"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), ForeignKey("business.id", ondelete="CASCADE"), nullable=False)
    day = Column(Date, nullable=False)                                   # the East Africa Time day
    income = Column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    purchases = Column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    expenses = Column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    net_profit = Column(Numeric(14, 2), nullable=False, default=0, server_default="0")        # income - (purchases + expenses), checked on every write
    sales_made = Column(Integer, nullable=False, default=0, server_default="0")               # the day has sales when this is above 0 (the "days with sales" count)
    purchases_count = Column(Integer, nullable=False, default=0, server_default="0")
    expenses_count = Column(Integer, nullable=False, default=0, server_default="0")
    detail = Column(JSONB, nullable=False, default=dict, server_default="{}")                 # { by_payment_method, cost_breakdown, by_person }
    consolidated_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (
        UniqueConstraint("business_id", "day", name="uq_business_daily_summary_day"),
        Index("ix_business_daily_summary_day_only", "day"),
        CheckConstraint("income >= 0 AND purchases >= 0 AND expenses >= 0", name="ck_bds_non_negative"),
        CheckConstraint("net_profit = income - purchases - expenses", name="ck_bds_net"),
    )


class BusinessRecordTombstone(Base):
    __tablename__ = "business_record_tombstone"
    business_id = Column(UUID(as_uuid=True), ForeignKey("business.id", ondelete="CASCADE"), primary_key=True)
    client_id = Column(String(64), primary_key=True)
    purged_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (Index("ix_business_record_tombstone_purged", "purged_at"),)


class AppSetting(Base):
    __tablename__ = "app_setting"
    key = Column(String(60), primary_key=True)
    value = Column(JSONB, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
