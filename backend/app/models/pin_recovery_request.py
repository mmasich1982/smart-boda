# backend/app/models/pin_recovery_request.py
import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class PinRecoveryRequest(Base):
    __tablename__ = "pin_recovery_request"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    mobile_number = Column(String(15), nullable=False)
    status = Column(String(20), default="pending")  # pending | approved
    reviewed_by_admin_id = Column(String(60))
    reviewed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
