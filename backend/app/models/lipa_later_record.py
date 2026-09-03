# backend/app/models/lipa_later_record.py
# ADDED: "Lipa Later" payment method on the New Trip screen -- captures customer name,
# mobile number, amount, and due date for follow-up on a deferred payment. trip_date is
# captured server-side automatically (BR: today's date, never shown on the entry screen
# itself) and links back to the Trip row that was created for the same transaction.
import uuid
from sqlalchemy import Column, String, Numeric, Date, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class LipaLaterRecord(Base):
    __tablename__ = "lipa_later_record"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    trip_id = Column(UUID(as_uuid=True), ForeignKey("trip.id"), nullable=False)
    customer_name = Column(String(80), nullable=False)
    customer_mobile = Column(String(20), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    trip_date = Column(DateTime(timezone=True), nullable=False)  # captured automatically, never rider-entered
    due_date = Column(Date, nullable=False)
    status = Column(String(10), default="pending")  # pending | paid
    paid_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship to LipaLaterPayment (one-to-many)
    payments = relationship("LipaLaterPayment", back_populates="lipa_later_record", cascade="all, delete-orphan")