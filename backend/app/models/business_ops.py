# backend/app/models/business_ops.py
# SMART BIZNA day-to-day records (journeys D to O of the scope document). Smart Bizna keeps no money: it records what the
# business sells, buys and spends, and works out the profit.
#
#   business_sale / business_purchase / business_expense    three tables, one per kind of record (same lifecycle columns)
#   business_statement_request   Owner asks the Smart Bizna Admin for a statement older than the six months kept on the phone
# Lipa Later has its own business tables (models/business_lipa_later.py): the rider's rules, no rider or trip columns. It covers both what customers
# owe the business (sales) and what the business owes its suppliers (purchases). The supplier directory of release 2 is retired (v48).
import uuid
from sqlalchemy import (Column, Integer, String, DateTime, Date, Numeric, ForeignKey, Index, CheckConstraint, UniqueConstraint, func)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.declarative import declared_attr
from app.database import Base

SALE, PURCHASE, EXPENSE = "SALE", "PURCHASE", "EXPENSE"
CASH, MPESA, CARD, LIPA_LATER = "CASH", "MPESA", "CARD", "LIPA_LATER"
ACTIVE, CORRECTED, VOIDED = "active", "corrected", "voided"
REQUESTED, READY = "requested", "ready"


class _Lifecycle:
    """Columns every record has: who recorded it, the phone's time, the server's time, and its correct / void history."""
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(String(64), nullable=False)                      # makes every retry safe (unique per business)
    trading_at = Column(DateTime(timezone=True), nullable=False)        # the phone's own time
    received_at = Column(DateTime(timezone=True), server_default=func.now())   # the server's time
    status = Column(String(10), nullable=False, default=ACTIVE)
    version = Column(Integer, nullable=False, default=1)
    corrected_at = Column(DateTime(timezone=True))
    void_reason = Column(String(120))
    voided_at = Column(DateTime(timezone=True))
    last_change_client_id = Column(String(64))                          # the last correction / void applied: a retry of it is answered as a duplicate
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    summarized_at = Column(DateTime(timezone=True))                     # set when the end-of-day consolidation has counted this line in the business's daily summary

    @declared_attr
    def business_id(cls):
        return Column(UUID(as_uuid=True), ForeignKey("business.id", ondelete="CASCADE"), nullable=False)

    @declared_attr
    def user_id(cls):
        return Column(UUID(as_uuid=True), ForeignKey("business_user.id", ondelete="RESTRICT"), nullable=False)   # who recorded it

    @declared_attr
    def corrected_by(cls):
        return Column(UUID(as_uuid=True), ForeignKey("business_user.id", ondelete="SET NULL"))

    @declared_attr
    def voided_by(cls):
        return Column(UUID(as_uuid=True), ForeignKey("business_user.id", ondelete="SET NULL"))


class BusinessSale(_Lifecycle, Base):
    __tablename__ = "business_sale"
    kind = SALE
    items = Column(JSONB, nullable=False, default=list)                 # [{"label": "...", "amount": 150.0}]
    total = Column(Numeric(14, 2), nullable=False)
    payment_method = Column(String(12), nullable=False)                 # CASH | MPESA | CARD | LIPA_LATER
    __table_args__ = (UniqueConstraint("business_id", "client_id", name="uq_business_sale_client"),
                      Index("ix_business_sale_biz_time", "business_id", "trading_at"),
                      Index("ix_business_sale_biz_updated", "business_id", "updated_at"),
                      CheckConstraint("status IN ('active','corrected','voided')", name="ck_business_sale_status"),
                      CheckConstraint("payment_method IN ('CASH','MPESA','CARD','LIPA_LATER')", name="ck_business_sale_pm"),
                      CheckConstraint("total > 0", name="ck_business_sale_total"))


class BusinessPurchase(_Lifecycle, Base):
    __tablename__ = "business_purchase"
    kind = PURCHASE
    items = Column(JSONB, nullable=False, default=list)
    total = Column(Numeric(14, 2), nullable=False)
    payment_method = Column(String(12), nullable=False)                 # CASH | MPESA | CARD | LIPA_LATER (a Lipa Later purchase is owed, not a cost, until paid)
    __table_args__ = (UniqueConstraint("business_id", "client_id", name="uq_business_purchase_client"),
                      Index("ix_business_purchase_biz_time", "business_id", "trading_at"),
                      Index("ix_business_purchase_biz_updated", "business_id", "updated_at"),
                      CheckConstraint("status IN ('active','corrected','voided')", name="ck_business_purchase_status"),
                      CheckConstraint("payment_method IN ('CASH','MPESA','CARD','LIPA_LATER')", name="ck_business_purchase_pm"),
                      CheckConstraint("total > 0", name="ck_business_purchase_total"))


class BusinessExpense(_Lifecycle, Base):
    __tablename__ = "business_expense"
    kind = EXPENSE
    details = Column(String(120), nullable=False)                       # Rent, Electricity ...
    total = Column(Numeric(14, 2), nullable=False)
    __table_args__ = (UniqueConstraint("business_id", "client_id", name="uq_business_expense_client"),
                      Index("ix_business_expense_biz_time", "business_id", "trading_at"),
                      Index("ix_business_expense_biz_updated", "business_id", "updated_at"),
                      CheckConstraint("status IN ('active','corrected','voided')", name="ck_business_expense_status"),
                      CheckConstraint("total > 0", name="ck_business_expense_total"))


MODEL_OF = {SALE: BusinessSale, PURCHASE: BusinessPurchase, EXPENSE: BusinessExpense}


class BusinessStatementRequest(Base):
    __tablename__ = "business_statement_request"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), ForeignKey("business.id", ondelete="CASCADE"), nullable=False)
    requested_by = Column(UUID(as_uuid=True), ForeignKey("business_user.id", ondelete="SET NULL"))
    client_id = Column(String(64), nullable=False)
    statement_type = Column(String(10), nullable=False)                 # summary | detailed
    period_from = Column(Date, nullable=False)
    period_to = Column(Date, nullable=False)
    purpose = Column(String(120))
    fee_ksh = Column(Numeric(10, 2))                                    # the fee shown to the customer when the request was made (configurable by the Administrator)
    status = Column(String(10), nullable=False, default=REQUESTED)
    statement = Column(JSONB)                                           # prepared by the Admin from the server records; the phone renders the PDF
    prepared_by_admin_id = Column(UUID(as_uuid=True), ForeignKey("admin_user.id", ondelete="SET NULL"))
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    ready_at = Column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint("business_id", "client_id", name="uq_business_stmt_req_client"),
                      CheckConstraint("statement_type IN ('summary','detailed')", name="ck_business_stmt_type"),
                      CheckConstraint("status IN ('requested','ready')", name="ck_business_stmt_status"))
