# backend/app/models/rider.py
import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base

class Rider(Base):
    __tablename__ = "rider"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    language_code = Column(String(10), ForeignKey("language_master.code"))
    mobile_number = Column(String(15), unique=True, nullable=False)
    mobile_verified = Column(Boolean, default=False)
    full_name = Column(String(80))
    email = Column(String(120), nullable=True)
    email_verified = Column(Boolean, default=False)
    consent_accepted_at = Column(DateTime(timezone=True))
    consent_content_version = Column(String(20))
    pin_hash = Column(String(255))
    pin_attempts_left = Column(Integer, default=5)
    pin_locked_until = Column(DateTime(timezone=True))
    onboarding_step = Column(String(30), default="valuePreview")
    registration_status = Column(String(20), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # ✅ Relationships
    other_expenses = relationship("OtherExpense", back_populates="rider", cascade="all, delete-orphan")
    revenue_targets = relationship("RevenueTarget", back_populates="rider", cascade="all, delete-orphan")
    trips = relationship("Trip", back_populates="rider", cascade="all, delete-orphan")
    fuel_entries = relationship("FuelEntry", back_populates="rider", cascade="all, delete-orphan")
    maintenance_entries = relationship("MaintenanceEntry", back_populates="rider", cascade="all, delete-orphan")
    remittances = relationship("Remittance", back_populates="rider", cascade="all, delete-orphan")
    saved_recipients = relationship("SavedRecipient", back_populates="rider", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="rider", cascade="all, delete-orphan")