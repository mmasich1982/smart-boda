# backend/app/models/goal.py
import uuid
from sqlalchemy import Column, String, Numeric, Date, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class Goal(Base):
    __tablename__ = "goal"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    goal_type_code = Column(String(30), ForeignKey("goal_type_master.code"), nullable=False)
    name = Column(String(60))
    target_amount = Column(Numeric(9, 2), nullable=False)
    target_date = Column(Date)
    status = Column(String(20), default="active")  # active | achieved | archived
    created_at = Column(DateTime(timezone=True), server_default=func.now())
