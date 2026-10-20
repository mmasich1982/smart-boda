# backend/app/models/bike_profile.py
import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base

class BikeProfile(Base):
    """The rider's fuel setup. It decides whether Home shows "Fuel Motorcycle" or "Charge Battery".
    (Table name kept so existing references keep working. There is no number plate: the rider is identified by mobile number.)"""
    __tablename__ = "bike_profile"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    fuel_type_code = Column(String(20), ForeignKey("fuel_type_master.code"), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=False)
    sync_status = Column(String(20), default="pending_sync")
    is_active = Column(Boolean, default=True)
    # sb11_odometer.py reads/writes `bike.current_odometer_km`.
    current_odometer_km = Column(Integer, default=0)
    # battery_range_service.py reads `bike.battery_range_km` as a per-bike override of the fleet default. Nullable.
    battery_range_km = Column(Integer, nullable=True)

    rider = relationship("Rider")
