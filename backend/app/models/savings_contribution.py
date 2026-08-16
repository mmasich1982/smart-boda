# backend/app/models/savings_contribution.py
import uuid
from sqlalchemy import Column, Numeric, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class SavingsContribution(Base):
    __tablename__ = "savings_contribution"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id = Column(UUID(as_uuid=True), ForeignKey("savings_account.id"), nullable=False)
    amount = Column(Numeric(8, 2), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=False)
