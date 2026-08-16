# backend/app/models/target_streak.py
from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class TargetStreak(Base):
    __tablename__ = "target_streak"
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), primary_key=True)
    period_type = Column(String(10), primary_key=True)
    current_streak = Column(Integer, default=0)
    longest_streak = Column(Integer, default=0)
    lifetime_targets_achieved = Column(Integer, default=0)  # BR-SB15-010: combined across all 3 period types
