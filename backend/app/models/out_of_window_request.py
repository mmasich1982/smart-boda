# backend/app/models/out_of_window_request.py
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from app.database import Base


class OutOfWindowRequest(Base):
    """Model for out-of-window correction requests (after 24-hour window)"""
    __tablename__ = "out_of_window_requests"
    
    id = Column(Integer, primary_key=True)
    trip_id = Column(UUID(as_uuid=True), ForeignKey("trip.id"), nullable=False)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    requested_amount = Column(Float, nullable=False)
    reason = Column(String(500), nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # pending, approved, rejected, resolved
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Admin review fields
    reviewed_by_admin_id = Column(String(60))
    reviewed_at = Column(DateTime)
    resolution_note = Column(String(300))
    
    def to_dict(self):
        return {
            "id": self.id,
            "trip_id": self.trip_id,
            "rider_id": self.rider_id,
            "requested_amount": self.requested_amount,
            "reason": self.reason,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "reviewed_by_admin_id": self.reviewed_by_admin_id,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "resolution_note": self.resolution_note,
        }