# backend/app/models/maintenance_entry.py
import uuid
from sqlalchemy import Column, String, Numeric, Integer, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base

class MaintenanceEntry(Base):
    __tablename__ = "maintenance_entry"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    service_type_code = Column(String(30), ForeignKey("service_type_master.code"), nullable=False)
    cost = Column(Numeric(8, 2), nullable=False)
    odometer_reading = Column(Integer)
    oil_type_code = Column(String(30), ForeignKey("oil_type_master.code"))
    next_service_odometer = Column(Integer)
    sync_status = Column(String(20), default="pending")
    submitted_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # ✅ Relationships
    rider = relationship("Rider", back_populates="maintenance_entries")