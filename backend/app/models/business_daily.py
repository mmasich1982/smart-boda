# backend/app/models/business_daily.py
# SMART BIZNA DAILY SUMMARIES and the app settings. The server no longer stores every sale, purchase and expense line: each person's phone sends ONE summary
# per day (and a running one while the day is open). The server keeps summaries for ONE YEAR (purged by services/business_daily_service.purge_old).
#   business_daily_summary   one row per (business, person, EAT day): the totals, the payment-method / cost / person breakdowns
#   app_setting              small key/value settings the Administrator can change (the statement fees; later the support phone number)
import uuid
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Numeric, ForeignKey, Index, UniqueConstraint, CheckConstraint, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class BusinessDailySummary(Base):
    __tablename__ = "business_daily_summary"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), ForeignKey("business.id", ondelete="CASCADE"), nullable=False)
    business_user_id = Column(UUID(as_uuid=True), ForeignKey("business_user.id", ondelete="CASCADE"), nullable=False)
    day = Column(Date, nullable=False)                                   # the East Africa Time day
    final = Column(Boolean, nullable=False, default=False, server_default="false")               # False while the day is still open (a running summary); True once the phone closed the day
    income = Column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    purchases = Column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    expenses = Column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    net_profit = Column(Numeric(14, 2), nullable=False, default=0, server_default="0")       # income - (purchases + expenses), checked on every write
    sales_made = Column(Integer, nullable=False, default=0, server_default="0")
    purchases_count = Column(Integer, nullable=False, default=0, server_default="0")
    expenses_count = Column(Integer, nullable=False, default=0, server_default="0")
    detail = Column(JSONB, nullable=False, default=dict, server_default="{}")                 # { by_payment_method:[...], cost_breakdown:[...], by_person:[...] }
    received_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (
        UniqueConstraint("business_id", "business_user_id", "day", name="uq_business_daily_summary"),
        Index("ix_business_daily_summary_day", "business_id", "day"),
        CheckConstraint("income >= 0 AND purchases >= 0 AND expenses >= 0", name="ck_bds_non_negative"),
        CheckConstraint("net_profit = income - purchases - expenses", name="ck_bds_net"),
    )


class AppSetting(Base):
    __tablename__ = "app_setting"
    key = Column(String(60), primary_key=True)
    value = Column(JSONB, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
