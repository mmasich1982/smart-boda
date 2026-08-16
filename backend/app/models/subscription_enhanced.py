# backend/app/models/subscription_enhanced.py
# ✅ FIXED: Subscription Enhancement Models with corrected relationships
# All relationships now properly defined with explicit primaryjoin where needed

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, ForeignKey, JSON, func, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class PricingChangeLog(Base):
    """
    Audit trail for all pricing changes (scheduled or applied).
    COMPLETELY NEW TABLE - does not conflict with any existing tables.
    
    Enables transparency: riders see when prices changed and why.
    Super Admin can schedule changes with notice period (minimum 24h).
    
    Features:
    - Track version changes to subscription_plan
    - Record old and new prices
    - Support scheduled changes with advance notice
    - Cancel scheduled changes if needed
    - Full audit trail with admin tracking
    """
    __tablename__ = "pricing_change_log"
    
    id = Column(Integer, primary_key=True)
    plan_id = Column(Integer, ForeignKey("subscription_plan.id", ondelete="CASCADE"), nullable=False)
    
    # Version tracking
    version = Column(Integer, nullable=False)  # e.g., plan version 1→2→3
    
    # Pricing details
    daily_price_old = Column(Numeric(10, 2), nullable=False)  # Previous price
    daily_price_new = Column(Numeric(10, 2), nullable=False)  # New price
    discounts = Column(JSON, nullable=True)  # {"biweekly": 5, "monthly": 8} -- % discounts
    
    # Timing
    announced_at = Column(DateTime(timezone=True), nullable=False)  # When scheduled
    effective_at = Column(DateTime(timezone=True), nullable=False)  # When to apply
    applied_at = Column(DateTime(timezone=True), nullable=True)  # When actually applied
    
    # Cancellation (optional)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_by_admin = Column(String(100), nullable=True)
    cancellation_reason = Column(String(500), nullable=True)
    
    # Admin tracking
    created_by_admin = Column(String(100), nullable=False)  # Email of admin who created this
    creation_ip = Column(String(50), nullable=True)  # For audit trail
    
    # Audit timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    plan = relationship("SubscriptionPlan", back_populates="pricing_changes")
    
    @property
    def hours_until_effective(self):
        """Calculate hours remaining until change takes effect"""
        if self.applied_at or self.cancelled_at:
            return 0
        remaining = (self.effective_at - datetime.now(timezone.utc)).total_seconds() / 3600
        return max(0, remaining)
    
    @property
    def is_pending(self):
        """Returns True if change is scheduled but not yet applied"""
        return self.applied_at is None and self.cancelled_at is None
    
    @property
    def notice_hours(self):
        """Calculate hours between announcement and effective time"""
        return (self.effective_at - self.announced_at).total_seconds() / 3600


class PendingPriceChange(Base):
    """
    Transient tracking of price change *currently pending* (not yet applied).
    COMPLETELY NEW TABLE - does not conflict with any existing tables.
    
    Used by app UI to show riders "prices changing on [date]" banner.
    
    Design:
    - Only ONE pending price change can exist per plan at a time (unique constraint)
    - When applied, record is moved to PricingChangeLog and this is cleared
    - Provides quick lookup for current pending changes
    """
    __tablename__ = "pending_price_change"
    
    id = Column(Integer, primary_key=True)
    plan_id = Column(Integer, ForeignKey("subscription_plan.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    # Pricing change details
    daily_price = Column(Numeric(10, 2), nullable=False)
    discounts = Column(JSON, nullable=True)
    version = Column(Integer, nullable=False)
    
    # Timing
    announced_at = Column(DateTime(timezone=True), nullable=False)
    effective_at = Column(DateTime(timezone=True), nullable=False)
    
    # Audit
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    plan = relationship("SubscriptionPlan", back_populates="pending_changes")
    
    @property
    def hours_until_effective(self):
        """Hours remaining until this change applies"""
        remaining = (self.effective_at - datetime.now(timezone.utc)).total_seconds() / 3600
        return max(0, remaining)


class SubscriptionTrial(Base):
    """
    Tracks trial period metadata (complementary to rider_subscription.has_ever_paid).
    COMPLETELY NEW TABLE - does not conflict with any existing tables.
    
    Used to:
    - Enforce one trial per rider
    - Track trial conversion metrics
    - Timestamp trial start/end for analytics
    - Track trial-to-paid conversion
    
    TRIAL PERIOD: Default 1 day (24 hours) from start_at
    If rider doesn't pay by end of trial → auto-lock on expiry check
    
    ✅ FIXED: Relationship now uses explicit primaryjoin to properly link
    to RiderSubscription via the shared rider_id FK to rider.id
    """
    __tablename__ = "subscription_trial"
    
    id = Column(Integer, primary_key=True)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    converted_to_paid = Column(Boolean, default=False, nullable=False)
    converted_at = Column(DateTime(timezone=True), nullable=True)
    
    # Notification tracking
    notification_sent_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # ✅ FIXED RELATIONSHIP: Removed back_populates to avoid bidirectional conflict
    # The RiderSubscription.trial relationship is the canonical one with cascade
    # This read-only relationship allows SubscriptionTrial to access RiderSubscription if needed
    # but doesn't create a bidirectional constraint that confuses SQLAlchemy
    rider = relationship(
        "RiderSubscription",
        primaryjoin="SubscriptionTrial.rider_id == foreign(RiderSubscription.rider_id)",
        foreign_keys="[RiderSubscription.rider_id]",
        uselist=False,
        viewonly=True  # ✅ IMPORTANT: Set viewonly=True, no back_populates for read-only access
    )


class AccountLockHistory(Base):
    """
    Audit trail for account lock/unlock events.
    COMPLETELY NEW TABLE - does not conflict with any existing tables.
    
    Tracks both automatic (expiry) and manual (admin) lock/unlock actions.
    Provides complete audit trail for compliance and debugging.
    
    AUTOMATIC LOCKS:
    - Trigger 1: Trial expires (1 day) with no payment
    - Trigger 2: Paid subscription expires with no renewal
    - Lock reason: "Free Trial Expired" or "Subscription Expired"
    
    MANUAL LOCKS:
    - Super Admin can manually lock for non-compliance
    - Lock reason: Custom admin-provided reason
    
    UNLOCKS:
    - Admin can manually unlock with note
    - Auto-unlock on successful payment (optional future feature)
    
    ✅ FIXED: Relationship now uses explicit primaryjoin to properly link
    to RiderSubscription via the shared rider_id FK to rider.id
    """
    __tablename__ = "account_lock_history"
    
    id = Column(Integer, primary_key=True)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id", ondelete="CASCADE"), nullable=False)
    
    # Action type
    action = Column(String(20), nullable=False)  # "locked" or "unlocked"
    reason = Column(String(255), nullable=True)  # Why locked (if applicable)
    
    # Trigger information
    triggered_by = Column(String(50), nullable=False)  # "system" (expiry) or admin email
    triggered_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # For manual actions only
    admin_email = Column(String(100), nullable=True)
    admin_note = Column(String(500), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # ✅ FIXED RELATIONSHIP: Removed back_populates to avoid bidirectional conflict
    # The RiderSubscription.lock_history relationship is the canonical one with cascade
    # This read-only relationship allows AccountLockHistory to access RiderSubscription if needed
    # but doesn't create a bidirectional constraint that confuses SQLAlchemy
    rider = relationship(
        "RiderSubscription",
        primaryjoin="AccountLockHistory.rider_id == foreign(RiderSubscription.rider_id)",
        foreign_keys="[RiderSubscription.rider_id]",
        uselist=False,  # Each lock history record relates to one RiderSubscription
        viewonly=True  # ✅ IMPORTANT: Set viewonly=True, no back_populates for read-only access
    )