# backend/app/models/savings_account.py
import uuid
from sqlalchemy import Column, String, DateTime, Numeric, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class SavingsAccount(Base):
    __tablename__ = "savings_account"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    type = Column(String(10), nullable=False)  # sacco | chama
    name = Column(String(60), nullable=False)
    frequency = Column(String(10), default="weekly")  # informational only, BR-SB16-007
    # ADDED: stored running total, kept in sync by services/savings_service.py's
    # add_savings_contribution -- BR-SB16-009 (period filter never changes this).
    lifetime_total = Column(Numeric(10, 2), default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
