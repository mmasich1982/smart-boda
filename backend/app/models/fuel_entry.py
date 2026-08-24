# backend/app/models/fuel_entry.py
import uuid
from sqlalchemy import Column, String, Numeric, Integer, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base

class FuelEntry(Base):
    __tablename__ = "fuel_entry"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    mode = Column(String(10), nullable=False)  # petrol | swap | charging
    litres = Column(Numeric(6, 1))
    cost = Column(Numeric(8, 2), nullable=False)
    # REMOVED (docx #4): cost_per_litre column dropped entirely -- see migration 0010.
    swap_partner_id = Column(UUID(as_uuid=True), ForeignKey("swap_partner_master.id"))
    odometer_reading = Column(Integer)
    sync_status = Column(String(20), default="pending")
    submitted_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # ✅ Relationships
    rider = relationship("Rider", back_populates="fuel_entries")