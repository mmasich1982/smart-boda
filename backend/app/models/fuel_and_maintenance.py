# backend/app/models/fuel_and_maintenance.py
# UPDATED: Models for Fuel and Maintenance tracking (RA-05, RA-06)
# ✓ FIXED: Removed Pydantic Config classes from SQLAlchemy models (not needed for ORM models)

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class FuelEntry(Base):
    """
    Represents a fuel purchase, battery swap, charging session, or odometer reading.
    Modes: petrol, swap, charging, odometer
    """
    __tablename__ = "fuel_entries"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False, index=True)
    bike_id = Column(Integer, ForeignKey("bikes.id"), nullable=False, index=True)
    
    mode = Column(String(20), nullable=False)  # petrol | swap | charging | odometer
    cost_ksh = Column(Float, nullable=True)  # Cost in KSh
    litres = Column(Float, nullable=True)  # For petrol purchases (optional as per UAT)
    # REMOVED (UAT #2_Fuel_Battery_and_Service_Related.docx): cost_per_litre field — no longer calculated or stored
    network = Column(String(100), nullable=True)  # Battery swap network (Swoop, Opcharge, etc)
    odometer_km = Column(Float, nullable=True)  # Current odometer reading
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    sync_status = Column(String(20), default="pending", nullable=False)

    # Relationships
    rider = relationship("Rider", back_populates="fuel_entries")
    bike = relationship("Bike", back_populates="fuel_entries")

    # ✓ FIXED: Removed Config class - not needed for SQLAlchemy ORM models


class MaintenanceEntry(Base):
    """
    Represents a maintenance service performed on a bike.
    Service types: Oil Change, Chain & Sprocket, Filters, Brake Pads, Tyres, etc.
    """
    __tablename__ = "maintenance_entries"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False, index=True)
    bike_id = Column(Integer, ForeignKey("bikes.id"), nullable=False, index=True)
    
    service_type = Column(String(100), nullable=False, index=True)
    cost_ksh = Column(Float, nullable=False)
    # UPDATED (UAT #2_Fuel_Battery_and_Service_Related.docx): odometer_km is now optional (only required for Oil Change and General Service)
    odometer_km = Column(Float, nullable=True)  # Odometer reading at service (optional for non-dated services)
    oil_type = Column(String(100), nullable=True)  # For Oil Change services only
    next_service_odometer = Column(Float, nullable=True)  # Projected next service km (only for dated services)
    # REMOVED (UAT #2_Fuel_Battery_and_Service_Related.docx): notes field removed entirely
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    sync_status = Column(String(20), default="pending", nullable=False)

    # Relationships
    rider = relationship("Rider", back_populates="maintenance_entries")
    bike = relationship("Bike", back_populates="maintenance_entries")

    # ✓ FIXED: Removed Config class - not needed for SQLAlchemy ORM models