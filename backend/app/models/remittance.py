from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Remittance(Base):
    __tablename__ = "remittances"
    
    id = Column(String(50), primary_key=True)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    recipient = Column(String(120), nullable=False)
    recipient_relationship = Column(String(50), nullable=True)  # ✓ FIXED: Renamed from "relationship" (reserved keyword)
    amount = Column(Float, nullable=False)
    channel = Column(String(50), nullable=False)
    ts = Column(DateTime, nullable=False, default=datetime.utcnow)
    sync_status = Column(String(20), nullable=False, default="pending")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Foreign key relationships
    rider = relationship("Rider", back_populates="remittances")
    
    __table_args__ = (
        Index("ix_remittances_rider_id", "rider_id"),
        Index("ix_remittances_ts", "ts"),
        Index("ix_remittances_recipient", "recipient"),
    )
    
    def to_dict(self):
        return {
            "id": self.id,
            "rider_id": self.rider_id,
            "recipient": self.recipient,
            "recipient_relationship": self.recipient_relationship,  # ✓ FIXED: Updated key name
            "amount": self.amount,
            "channel": self.channel,
            "ts": self.ts.isoformat() if self.ts else None,
            "sync_status": self.sync_status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }