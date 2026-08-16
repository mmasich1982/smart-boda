# backend/app/models/other_expense.py
# UPDATED: Model for tracking other expenses logged by riders (RA-07-C)
# FIX: Changed foreign key from "riders.id" to "rider.id" and rider_id type to UUID
# ✓ FIXED: Removed Pydantic Config class from SQLAlchemy model (not needed for ORM models)

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class OtherExpense(Base):
    """
    Represents a custom expense entry logged by a rider.
    These are expenses beyond fuel and maintenance.
    """
    __tablename__ = "other_expenses"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False, index=True)
    category = Column(String(100), nullable=False, index=True)  # e.g., 'Food', 'Phone', 'Transport', etc.
    amount_ksh = Column(Float, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    sync_status = Column(String(20), default="pending", nullable=False)  # pending | synced | error
    
    # Relationships
    rider = relationship("Rider", back_populates="other_expenses")
    
    # ✓ FIXED: Removed Config class - not needed for SQLAlchemy ORM models