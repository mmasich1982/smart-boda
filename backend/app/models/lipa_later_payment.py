# backend/app/models/lipa_later_payment.py
# ADDED: Payment records for "Lipa Later" deferred payment method
# Records individual payments made against Lipa Later records for tracking and reconciliation

import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Numeric, Date, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class LipaLaterPayment(Base):
    """
    LipaLaterPayment model for tracking payments made against Lipa Later records
    
    One LipaLaterRecord can have multiple LipaLaterPayment entries as the customer
    pays the amount over time (partial payments).
    """
    
    __tablename__ = "lipa_later_payment"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    lipa_later_id = Column(UUID(as_uuid=True), ForeignKey("lipa_later_record.id"), nullable=False)
    amount_ksh = Column(Numeric(10, 2), nullable=False)  # Amount paid in KES
    payment_date = Column(Date, nullable=False)  # Date payment was made
    reference = Column(String(255), default="")  # Payment reference/note (e.g., M-Pesa code)
    sync_status = Column(String(20), default="pending")  # pending | synced
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationship back to LipaLaterRecord
    lipa_later_record = relationship("LipaLaterRecord", back_populates="payments")
    
    def __repr__(self):
        return f"<LipaLaterPayment(id={self.id}, lipa_later_id={self.lipa_later_id}, amount_ksh={self.amount_ksh})>"
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            "id": str(self.id),
            "riderId": str(self.rider_id),
            "lipaLaterId": str(self.lipa_later_id),
            "amountKsh": float(self.amount_ksh),
            "paymentDate": self.payment_date.isoformat() if self.payment_date else None,
            "reference": self.reference,
            "syncStatus": self.sync_status,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }