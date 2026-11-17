# backend/app/models/vehicle_type_log.py
# SMART CABZ: one row each time a Super Admin changes a person's vehicle type (who, when, from, to, why).
import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class VehicleTypeChangeLog(Base):
    __tablename__ = "vehicle_type_change_log"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id", ondelete="CASCADE"), nullable=False)
    changed_by = Column(UUID(as_uuid=True), ForeignKey("admin_user.id", ondelete="SET NULL"))
    from_type = Column(String(12), nullable=False)
    to_type = Column(String(12), nullable=False)
    reason = Column(String(200), nullable=False)
    changed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
