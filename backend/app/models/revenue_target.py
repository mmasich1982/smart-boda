# backend/app/models/revenue_target.py
# UPDATED: Model for revenue targets (RA-09, RA-10)
# FIX: Changed foreign key from "riders.id" to "rider.id" and rider_id type to UUID
# ✓ FIXED: Removed Pydantic Config class from SQLAlchemy model (not needed for ORM models)

from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class RevenueTarget(Base):
    """
    Represents a revenue target set by a rider for a specific period.
    Periods: daily, weekly, monthly
    """
    __tablename__ = "revenue_targets"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False, index=True)
    period = Column(String(20), nullable=False)  # daily, weekly, monthly
    target_amount_ksh = Column(Float, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    rider = relationship("Rider", back_populates="revenue_targets")

    # ✓ FIXED: Removed Config class - not needed for SQLAlchemy ORM models