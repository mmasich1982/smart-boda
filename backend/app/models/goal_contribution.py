# backend/app/models/goal_contribution.py
import uuid
from sqlalchemy import Column, Numeric, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class GoalContribution(Base):
    __tablename__ = "goal_contribution"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id = Column(UUID(as_uuid=True), ForeignKey("goal.id"), nullable=False)
    amount = Column(Numeric(8, 2), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=False)
