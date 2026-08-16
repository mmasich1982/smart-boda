# backend/app/models/payment.py
# COMPREHENSIVE FIX: Extended Payment model to support Lipa Later payments
# ✓ FIXED: Added lipa_later_id foreign key for payment tracking
# ✓ FIXED: Added payment_date for Lipa Later payment history
# ✓ FIXED: Added reference field for transaction tracking
# ✓ FIXED: Added amount_ksh for consistency with other financial models

import uuid
from sqlalchemy import Column, String, Numeric, DateTime, ForeignKey, Date, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Payment(Base):
    """
    Represents payments made by riders.
    Supports:
    - Subscription payments (payment plan subscriptions)
    - Lipa Later payments (individual customer payments)
    """
    __tablename__ = "payment"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    
    # Subscription payment fields (optional)
    amount = Column(Numeric(10, 2), nullable=True)
    label = Column(String(255), nullable=True)  # e.g. "Weekly Plan", "7-Day Prepayment"
    channel = Column(String(100), default="Manual (Lipa na M-Pesa / Pochi / Send Money)", nullable=True)
    mpesa_code = Column(String(50), nullable=True)  # rider-entered M-Pesa confirmation code
    status = Column(String(20), default="Success")  # self-declared success is immediate
    reconciliation = Column(String(50), default="Pending Super Admin Review")  # "Verified" only via back-office
    reconciled_at = Column(DateTime(timezone=True), nullable=True)
    reconciled_by_admin = Column(String(100), nullable=True)
    
    # Lipa Later payment fields (optional)
    lipa_later_id = Column(UUID(as_uuid=True), ForeignKey("lipa_later_record.id"), nullable=True)
    amount_ksh = Column(Numeric(10, 2), nullable=True)  # For Lipa Later payments
    payment_date = Column(Date, nullable=True)  # When the payment was made
    reference = Column(String(255), nullable=True)  # Optional payment reference/note
    
    # Common tracking fields
    sync_status = Column(String(20), default="pending", nullable=False)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    rider = relationship("Rider")
    lipa_later = relationship("LipaLaterRecord")