# backend/app/models/statement.py
import uuid
from sqlalchemy import Column, String, Numeric, Date, Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class Statement(Base):
    __tablename__ = "statement"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    purpose_code = Column(String(30), ForeignKey("statement_purpose_master.code"))
    income = Column(Numeric(10, 2), nullable=False)
    total_expense = Column(Numeric(10, 2), nullable=False)
    net_profit = Column(Numeric(10, 2), nullable=False)
    verification_reference = Column(String(20))
    verified = Column(Boolean, default=False)
    generated_at = Column(DateTime(timezone=True), nullable=False)
    sync_status = Column(String(20), default="pending")
    # ADDED (docx #3): PIN confirm -> verified email -> submitted-to-admin-team confirmation,
    # for a rider's "Require Detailed Statement" request specifically (not the always-on
    # in-app statement, which needs none of this).
    contact_email = Column(String(120), nullable=True)
    delivery_requested = Column(Boolean, default=False)
    pin_verified_at = Column(DateTime(timezone=True), nullable=True)
