# backend/app/models/rider.py
import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base

class Rider(Base):
    __tablename__ = "rider"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    language_code = Column(String(10), ForeignKey("language_master.code"), nullable=True, default="en")
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
    
    # ✅ ENHANCED: Location fields for rider's operating location (County, Sub-County, Ward)
    # Added in migration 0023 for better location-based services and analytics
    county_id = Column(Integer, ForeignKey("location_county_master.id"), nullable=True)
    sub_county_id = Column(Integer, ForeignKey("location_sub_county_master.id"), nullable=True)
    ward_id = Column(Integer, ForeignKey("location_ward_master.id"), nullable=True)
    
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
    statements = relationship("Statement", back_populates="rider", cascade="all, delete-orphan")
    subscription = relationship("RiderSubscription", uselist=False, back_populates="rider", cascade="all, delete-orphan")
    lipa_later_records = relationship("LipaLaterRecord", back_populates="rider", cascade="all, delete-orphan")
    savings_account = relationship("SavingsAccount", uselist=False, back_populates="rider", cascade="all, delete-orphan")
    savings_contributions = relationship("SavingsContribution", back_populates="rider", cascade="all, delete-orphan")
    goals = relationship("Goal", back_populates="rider", cascade="all, delete-orphan")
    bike_profile = relationship("BikeProfile", uselist=False, back_populates="rider", cascade="all, delete-orphan")
    compliance_documents = relationship("ComplianceDocument", back_populates="rider", cascade="all, delete-orphan")
    data_export_requests = relationship("DataExportRequest", back_populates="rider", cascade="all, delete-orphan")
    subscriptions_enhanced = relationship("SubscriptionEnhanced", uselist=False, back_populates="rider", cascade="all, delete-orphan")