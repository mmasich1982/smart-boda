# backend/app/models/bike_profile.py
import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base

class BikeProfile(Base):
    __tablename__ = "bike_profile"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    number_plate = Column(String(12), nullable=False)
    fuel_type_code = Column(String(20), ForeignKey("fuel_type_master.code"), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=False)
    sync_status = Column(String(20), default="pending_sync")
    is_active = Column(Boolean, default=True)
    # AUDIT FIX (found while removing the docx #4 auto-trigger feature): sb11_odometer.py has
    # always read/written `bike.current_odometer_km` -- this column never existed on the
    # model at all, so every odometer-reading save would crash with AttributeError.
    current_odometer_km = Column(Integer, default=0)
    # AUDIT FIX (found during full-codebase sweep): battery_range_service.py has always read
    # `bike.battery_range_km` as a per-bike override of the fleet-wide default (e.g. after a
    # battery upgrade) -- this column never existed at all. Nullable: falls back to
    # FuelMaintenanceRuleConfig.default_battery_range_km when not set.
    battery_range_km = Column(Integer, nullable=True)
    
    # ✅ Relationships
    rider = relationship("Rider")

class DuplicatePlateCase(Base):
    __tablename__ = "duplicate_plate_case"
    id = Column(String(12), primary_key=True)
    number_plate = Column(String(12), nullable=False)
    rider_a_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"))
    rider_b_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"))
    status = Column(String(20), default="pending_review")
    resolution_decision = Column(String(30))
    reviewed_by_admin_id = Column(String(60))
    reviewed_at = Column(DateTime(timezone=True))