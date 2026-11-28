# backend/app/models/business_lipa_later.py
# SMART BIZNA Lipa Later: the business's OWN tables. The rules are the rider app's (see services/business_lipa_later_service.py), but nothing here
# is rider-shaped: there is no rider_id and no trip_id. A credit sale is a row of business_lipa_later_record (linked to its business_sale), every
# customer payment a row of business_lipa_later_payment, and both name the business and the business user (seller / person who took the payment).
# v48: the same two tables again for what the business OWES its suppliers (a Lipa Later purchase): business_supplier_lipa_record / _payment.
import uuid
from sqlalchemy import Column, String, Numeric, Date, DateTime, ForeignKey, Index, CheckConstraint, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class BusinessLipaLaterRecord(Base):
    __tablename__ = "business_lipa_later_record"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), ForeignKey("business.id", ondelete="CASCADE"), nullable=False)
    sale_id = Column(UUID(as_uuid=True), ForeignKey("business_sale.id", ondelete="CASCADE"), nullable=False, unique=True)
    business_user_id = Column(UUID(as_uuid=True), ForeignKey("business_user.id", ondelete="RESTRICT"), nullable=False)   # who made the credit sale
    customer_name = Column(String(80), nullable=False)
    customer_mobile = Column(String(20), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    sale_date = Column(DateTime(timezone=True), nullable=False)          # the phone's time of the sale, never typed
    due_date = Column(Date, nullable=False)
    status = Column(String(10), nullable=False, default="pending")       # pending | paid | voided
    paid_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (Index("ix_business_lipa_record_biz", "business_id", "status"),
                      CheckConstraint("status IN ('pending','paid','voided')", name="ck_business_lipa_record_status"),
                      CheckConstraint("amount > 0", name="ck_business_lipa_record_amount"))


class BusinessLipaLaterPayment(Base):
    __tablename__ = "business_lipa_later_payment"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), ForeignKey("business.id", ondelete="CASCADE"), nullable=False)
    lipa_later_id = Column(UUID(as_uuid=True), ForeignKey("business_lipa_later_record.id", ondelete="CASCADE"), nullable=False)
    business_user_id = Column(UUID(as_uuid=True), ForeignKey("business_user.id", ondelete="RESTRICT"), nullable=False)  # who took the payment
    client_id = Column(String(64), nullable=False)                       # makes a retried payment safe
    amount_ksh = Column(Numeric(14, 2), nullable=False)
    payment_date = Column(Date, nullable=False)                          # EAT calendar day of the payment
    paid_at = Column(DateTime(timezone=True), nullable=False)            # the phone's time: income lands on this day
    pay_type = Column(String(8), nullable=False)                         # full | partial
    reference = Column(String(255), default="")                          # notes, e.g. an M-Pesa code
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    summarized_at = Column(DateTime(timezone=True))                      # counted in the business's daily summary
    __table_args__ = (UniqueConstraint("business_id", "client_id", name="uq_business_lipa_payment_client"),
                      Index("ix_business_lipa_payment_record", "lipa_later_id"),
                      CheckConstraint("amount_ksh > 0", name="ck_business_lipa_payment_amount"),
                      CheckConstraint("pay_type IN ('full','partial')", name="ck_business_lipa_payment_type"))


class BusinessSupplierLipaRecord(Base):
    """A Lipa Later PURCHASE: what the business owes a supplier. Owed, not a cost, until paid (only the payments made count as a cost)."""
    __tablename__ = "business_supplier_lipa_record"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), ForeignKey("business.id", ondelete="CASCADE"), nullable=False)
    purchase_id = Column(UUID(as_uuid=True), ForeignKey("business_purchase.id", ondelete="CASCADE"), nullable=False, unique=True)
    business_user_id = Column(UUID(as_uuid=True), ForeignKey("business_user.id", ondelete="RESTRICT"), nullable=False)   # who recorded the purchase
    supplier_name = Column(String(80), nullable=False)
    supplier_mobile = Column(String(20), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    purchase_date = Column(DateTime(timezone=True), nullable=False)      # the phone's time of the purchase
    due_date = Column(Date, nullable=False)
    status = Column(String(10), nullable=False, default="pending")       # pending | paid | voided
    paid_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (Index("ix_business_supplier_lipa_record_biz", "business_id", "status"),
                      CheckConstraint("status IN ('pending','paid','voided')", name="ck_business_supplier_lipa_record_status"),
                      CheckConstraint("amount > 0", name="ck_business_supplier_lipa_record_amount"))


class BusinessSupplierLipaPayment(Base):
    """A payment the business made to a supplier. THIS is the cost: it counts as a purchase cost on the day it is paid."""
    __tablename__ = "business_supplier_lipa_payment"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), ForeignKey("business.id", ondelete="CASCADE"), nullable=False)
    lipa_later_id = Column(UUID(as_uuid=True), ForeignKey("business_supplier_lipa_record.id", ondelete="CASCADE"), nullable=False)
    business_user_id = Column(UUID(as_uuid=True), ForeignKey("business_user.id", ondelete="RESTRICT"), nullable=False)  # who paid the supplier
    client_id = Column(String(64), nullable=False)
    amount_ksh = Column(Numeric(14, 2), nullable=False)
    payment_date = Column(Date, nullable=False)
    paid_at = Column(DateTime(timezone=True), nullable=False)            # the phone's time: the cost lands on this day
    pay_type = Column(String(8), nullable=False)                         # full | partial
    reference = Column(String(255), default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    summarized_at = Column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint("business_id", "client_id", name="uq_business_supplier_lipa_payment_client"),
                      Index("ix_business_supplier_lipa_payment_record", "lipa_later_id"),
                      CheckConstraint("amount_ksh > 0", name="ck_business_supplier_lipa_payment_amount"),
                      CheckConstraint("pay_type IN ('full','partial')", name="ck_business_supplier_lipa_payment_type"))
