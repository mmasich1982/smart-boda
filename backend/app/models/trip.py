# backend/app/models/trip.py
# CORRECTED: Column names now match the database schema from 0002_module_b_trip_tracking migration
# ✓ FIXED: Using payment_channel_code instead of payment_method (matches database)
# ✓ FIXED: Table name correctly set to 'trip' (matches migration)
# ✓ FIXED: Foreign key correctly references rider table with UUID
# ✓ FIXED: UUID default using text() function instead of string literal

import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Date, func, Numeric, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Trip(Base):
    """
    Represents a trip taken by a rider and the income generated.
    Payment channels: Cash, MPesa, LipaLater (from payment_channel_master)
    Status: active, voided
    """
    __tablename__ = "trip"

    # ✓ FIXED: Use text() to wrap the PostgreSQL function call
    id = Column(UUID(as_uuid=True), primary_key=True, index=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False, index=True)
    
    # Main trip data
    amount = Column(Numeric(10, 2), nullable=False)  # Trip fare/income in KSh
    payment_channel_code = Column(String(20), ForeignKey("payment_channel_master.code"), nullable=False)  # Cash | MPesa | LipaLater
    status = Column(String(10), default="active", nullable=False)  # active | voided
    
    # Timestamps
    recorded_at = Column(DateTime(timezone=True), nullable=False, index=True)  # When the trip was recorded (client timestamp)
    
    # Optional note
    note = Column(String(140), nullable=True)
    
    # Correction tracking fields (BR-SB07-004)
    original_amount = Column(Numeric(10, 2), nullable=True)  # Set only on first correction
    original_payment_channel_code = Column(String(20), nullable=True)
    correction_reason_code = Column(String(30), ForeignKey("correction_reason_master.code"), nullable=True)
    corrected_at = Column(DateTime(timezone=True), nullable=True)
    voided_at = Column(DateTime(timezone=True), nullable=True)
    
    # Data consistency
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    sync_status = Column(String(20), default="pending", nullable=False)  # pending | synced

    # Relationships
    rider = relationship("Rider", back_populates="trips")