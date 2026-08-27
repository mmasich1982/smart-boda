"""
CORRECTED Payment Model
Aligns with actual database schema
"""

from sqlalchemy import Column, String, Numeric, DateTime, Integer, Boolean, Text, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
import uuid

from app.database import Base


class Payment(Base):
    """
    Payment model - stores payment transactions from riders
    
    Database columns:
    - id: Unique payment identifier (UUID)
    - rider_id: Reference to rider (FK)
    - type: Payment type (e.g., 'subscription', 'topup')
    - amount: Payment amount in KES
    - currency: Currency code (default: KES)
    - status: Payment status (e.g., 'Success', 'Pending', 'Failed')
    - channel: Payment channel (e.g., 'M-Pesa', 'Card')
    - mpesa_code: M-Pesa confirmation code
    - plan: Subscription plan (e.g., 'biweekly', 'monthly')
    - data: Additional metadata as JSON
    - sync_id: Idempotency key from mobile app (X-Sync-ID header)
    - created_at: When record was created
    - synced_at: When payment was synced/confirmed
    """
    
    __tablename__ = "payment"
    
    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Foreign Keys
    rider_id = Column(
        UUID(as_uuid=True),
        ForeignKey("rider.id"),
        nullable=False,
        index=True
    )
    
    # Payment Details
    type = Column(String(100), nullable=True)
    amount = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(5), default="KES", nullable=True)
    status = Column(String(50), nullable=True, index=True)
    channel = Column(String(100), nullable=True)
    mpesa_code = Column(String(100), nullable=True)
    plan = Column(String(50), nullable=True)
    
    # Metadata
    data = Column(JSON, nullable=True)
    sync_id = Column(String(255), nullable=True, unique=True, index=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    synced_at = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self):
        return f"<Payment(id={self.id}, rider_id={self.rider_id}, amount={self.amount}, status={self.status})>"