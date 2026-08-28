# backend/app/models/payment.py
# ============================================================================
# PAYMENT MODEL - SQLAlchemy ORM
# ✅ FIXED: Proper cascade rules, timestamps, and constraints
# ============================================================================

from sqlalchemy import Column, String, NUMERIC, DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid

from app.database import Base


class Payment(Base):
    """
    ✅ Payment model for subscription payments
    
    Stores all payment transactions with:
    - Idempotency via sync_id (UNIQUE constraint)
    - Foreign key to Rider
    - JSON metadata storage
    - Comprehensive timestamps
    """
    
    __tablename__ = "payment"
    
    # ========================================================================
    # CORE FIELDS
    # ========================================================================
    
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
        doc="Unique payment identifier (UUID)"
    )
    
    rider_id = Column(
        UUID(as_uuid=True),
        ForeignKey("rider.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        doc="Foreign key to rider"
    )
    
    type = Column(
        String(100),
        nullable=True,
        default="subscription",
        doc="Payment type (subscription, prepay, etc)"
    )
    
    amount = Column(
        NUMERIC(10, 2),
        nullable=True,
        doc="Payment amount in base currency"
    )
    
    currency = Column(
        String(5),
        nullable=True,
        default="KES",
        doc="Currency code (KES, USD, etc)"
    )
    
    status = Column(
        String(50),
        nullable=True,
        default="Success",
        index=True,
        doc="Payment status (Success, Pending, Failed)"
    )
    
    channel = Column(
        String(100),
        nullable=True,
        index=True,
        doc="Payment channel (M-Pesa, Bank Transfer, etc)"
    )
    
    mpesa_code = Column(
        String(100),
        nullable=True,
        doc="M-Pesa transaction code"
    )
    
    plan = Column(
        String(50),
        nullable=True,
        doc="Subscription plan (biweekly, monthly)"
    )
    
    # ========================================================================
    # SYNC & AUDIT FIELDS
    # ========================================================================
    
    sync_id = Column(
        String(255),
        nullable=True,
        unique=True,
        index=True,
        doc="Unique sync ID for idempotency (from mobile app X-Sync-ID header)"
    )
    
    data = Column(
        JSONB,
        nullable=True,
        doc="Additional metadata as JSON"
    )
    
    # ========================================================================
    # TIMESTAMPS
    # ========================================================================
    
    created_at = Column(
        DateTime(timezone=True),
        nullable=True,
        default=lambda: datetime.now(timezone.utc),
        index=True,
        doc="Payment creation timestamp"
    )
    
    synced_at = Column(
        DateTime(timezone=True),
        nullable=True,
        doc="When payment was synced to server"
    )
    
    verified_at = Column(
        DateTime(timezone=True),
        nullable=True,
        doc="When payment was verified"
    )
    
    # ========================================================================
    # RELATIONSHIPS
    # ========================================================================
    
    rider = relationship(
        "Rider",
        back_populates="payments",
        foreign_keys=[rider_id]
    )
    
    # ========================================================================
    # INDEXES
    # ========================================================================
    
    __table_args__ = (
        Index('idx_payment_rider_id', 'rider_id'),
        Index('idx_payment_sync_id', 'sync_id'),
        Index('idx_payment_status', 'status'),
        Index('idx_payment_channel', 'channel'),
        Index('idx_payment_created_at_desc', 'created_at'),
    )
    
    # ========================================================================
    # METHODS
    # ========================================================================
    
    def __repr__(self):
        return f"<Payment(id={self.id}, rider_id={self.rider_id}, amount={self.amount}, status={self.status})>"
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            "id": str(self.id),
            "riderId": str(self.rider_id),
            "type": self.type,
            "amount": float(self.amount) if self.amount else 0,
            "currency": self.currency,
            "status": self.status,
            "channel": self.channel,
            "mpesaCode": self.mpesa_code,
            "plan": self.plan,
            "syncId": self.sync_id,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "syncedAt": self.synced_at.isoformat() if self.synced_at else None,
            "verifiedAt": self.verified_at.isoformat() if self.verified_at else None,
        }


# ============================================================================
# MIGRATION SQL (If using raw SQL instead of Alembic)
# ============================================================================

"""
CREATE TABLE IF NOT EXISTS payment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES rider(id) ON DELETE RESTRICT,
    type VARCHAR(100) DEFAULT 'subscription',
    amount NUMERIC(10, 2),
    currency VARCHAR(5) DEFAULT 'KES',
    status VARCHAR(50) DEFAULT 'Success',
    channel VARCHAR(100),
    mpesa_code VARCHAR(100),
    plan VARCHAR(50),
    sync_id VARCHAR(255) UNIQUE,
    data JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    synced_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ
);

CREATE INDEX idx_payment_rider_id ON payment(rider_id);
CREATE INDEX idx_payment_sync_id ON payment(sync_id);
CREATE INDEX idx_payment_status ON payment(status);
CREATE INDEX idx_payment_channel ON payment(channel);
CREATE INDEX idx_payment_created_at_desc ON payment(created_at DESC);

ALTER TABLE payment OWNER TO smartboda;
GRANT SELECT, INSERT, UPDATE ON payment TO smartboda;
"""