# backend/app/models/subscription.py
# ✅ COMPREHENSIVE FIX: All relationship issues resolved with explicit primaryjoin
# This addresses ALL subscription relationship problems in one complete fix

import uuid
from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, ForeignKey, JSON, func, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime, timezone


class SubscriptionPlan(Base):
    """
    Subscription plan configuration - supports multiple tiers.
    PLANS:
    - Biweekly: 14 days @ KES 500 (≈ KES 35.71/day)
    - Monthly: 30 days @ KES 1000 (≈ KES 33.33/day)
    
    Only one plan is "active" at a time. Super Admin can schedule changes
    with advance notice before activation.
    """
    __tablename__ = "subscription_plan"
    
    id = Column(Integer, primary_key=True)
    name = Column(String, default="Smart Boda Plus")
    daily_price = Column(Numeric(10, 2), default=35)  # KES/day
    trial_days = Column(Integer, default=1)
    
    # Multi-plan support
    tier_name = Column(String(50), default="standard")  # "standard", "premium", etc.
    tier_label = Column(String(100))  # "Biweekly Plan", "Monthly Plan"
    tier_description = Column(Text)  # Plan features/description
    
    # Audit fields
    version = Column(Integer, default=1)  # Incremented on each change
    is_active = Column(Boolean, default=True)
    last_modified_at = Column(DateTime(timezone=True), server_default=func.now())
    modified_by_admin = Column(String(100))  # Email of admin who made change
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # ✅ ALL RELATIONSHIPS PROPERLY DEFINED
    # Relationships to models in subscription_enhanced.py
    pricing_changes = relationship("PricingChangeLog", back_populates="plan", cascade="all, delete-orphan")
    pending_changes = relationship("PendingPriceChange", back_populates="plan", uselist=True, cascade="all, delete-orphan")
    
    # Relationship to RiderSubscription (in this file)
    rider_subscriptions = relationship("RiderSubscription", back_populates="plan", cascade="all, delete-orphan")


class RiderSubscription(Base):
    """
    Rider's subscription status and history.
    Tracks trial/paid status, expiry, lock state, and plan selection.
    
    ACCOUNT LOCKING TRIGGERS:
    1. Trial expires (1 day) with NO payment → Auto-lock
    2. Paid subscription expires → Auto-lock
    3. Super Admin manual lock → Admin-triggered lock
    
    Lock reasons: "Free Trial Expired", "Subscription Expired", "Admin Override"
    
    RELATIONSHIPS:
    - plan: FK to subscription_plan.id
    - payments: Via rider_id to payment.rider_id (viewonly)
    - trial: Via rider_id to subscription_trial.rider_id (one-to-one, canonical side)
    - lock_history: Via rider_id to account_lock_history.rider_id (one-to-many, canonical side)
    """
    __tablename__ = "rider_subscription"
    
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), primary_key=True)
    plan_id = Column(Integer, ForeignKey("subscription_plan.id"), default=1)
    
    # Subscription timing
    expiry_at = Column(DateTime(timezone=True), nullable=False)
    frequency = Column(String(20), default="monthly")  # "biweekly", "monthly", "prepay"
    
    # Status tracking
    has_ever_paid = Column(Boolean, default=False)  # False = still on free trial
    locked = Column(Boolean, default=False)
    lock_reason = Column(String(255), nullable=True)
    locked_at = Column(DateTime(timezone=True), nullable=True)
    
    # Financial tracking
    total_paid_lifetime = Column(Numeric(10, 2), default=0)  # Total $ paid across all time
    last_payment_at = Column(DateTime(timezone=True), nullable=True)
    last_payment_amount = Column(Numeric(10, 2), nullable=True)
    
    # Pricing change awareness
    price_change_viewed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Audit
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # ✅ ALL RELATIONSHIPS WITH EXPLICIT PRIMARYJOIN (COMPREHENSIVE FIX)
    
    # Relationship to SubscriptionPlan (in this file)
    # Foreign key: plan_id → subscription_plan.id
    plan = relationship("SubscriptionPlan", back_populates="rider_subscriptions")
    
    # Relationship to Payment (in payment.py)
    # Foreign key: rider_id → rider.id (same as RiderSubscription.rider_id)
    # This is a one-to-many relationship with Payment.rider_id
    # Explicit primaryjoin required because rider_id is PK here but regular FK in Payment
    payments = relationship(
        "Payment",
        primaryjoin="RiderSubscription.rider_id == foreign(Payment.rider_id)",
        foreign_keys="[Payment.rider_id]",
        viewonly=True,
        lazy="select",
        uselist=True
    )
    
    # Relationship to SubscriptionTrial (in subscription_enhanced.py)
    # Foreign key: SubscriptionTrial.rider_id → rider.id
    # This maps RiderSubscription.rider_id (which is a FK to rider.id) to SubscriptionTrial.rider_id
    # Explicit primaryjoin required because the FK doesn't directly reference RiderSubscription
    # ✅ FIXED: Removed back_populates to avoid bidirectional constraint issues
    # The SubscriptionTrial model has a read-only reverse relationship if needed
    trial = relationship(
        "SubscriptionTrial",
        primaryjoin="RiderSubscription.rider_id == foreign(SubscriptionTrial.rider_id)",
        foreign_keys="[SubscriptionTrial.rider_id]",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="select"
    )
    
    # Relationship to AccountLockHistory (in subscription_enhanced.py)
    # Foreign key: AccountLockHistory.rider_id → rider.id
    # This maps RiderSubscription.rider_id (which is a FK to rider.id) to AccountLockHistory.rider_id
    # Explicit primaryjoin required because the FK doesn't directly reference RiderSubscription
    # ✅ FIXED: Removed back_populates to avoid bidirectional constraint issues
    # The AccountLockHistory model has a read-only reverse relationship if needed
    lock_history = relationship(
        "AccountLockHistory",
        primaryjoin="RiderSubscription.rider_id == foreign(AccountLockHistory.rider_id)",
        foreign_keys="[AccountLockHistory.rider_id]",
        uselist=True,
        cascade="all, delete-orphan",
        lazy="select"
    )


# ============================================================================
# COMPREHENSIVE RELATIONSHIP MAPPING
# ============================================================================
# The models in subscription_enhanced.py (PricingChangeLog, PendingPriceChange,
# SubscriptionTrial, AccountLockHistory) are NOT duplicated here.
# They are properly imported in app/models/__init__.py
#
# RELATIONSHIP MATRIX (All relationships defined):
# ┌─────────────────────┬──────────────────────┬────────────────┐
# │ Model               │ Relationship         │ Back Populates │
# ├─────────────────────┼──────────────────────┼────────────────┤
# │ SubscriptionPlan    │ pricing_changes      │ plan           │
# │ SubscriptionPlan    │ pending_changes      │ plan           │
# │ SubscriptionPlan    │ rider_subscriptions  │ plan           │
# │ RiderSubscription   │ plan                 │ rider_subsc.   │
# │ RiderSubscription   │ payments             │ (viewonly)     │
# │ RiderSubscription   │ trial                │ (no backref)   │
# │ RiderSubscription   │ lock_history         │ (no backref)   │
# │ PricingChangeLog    │ plan                 │ pricing_chang. │
# │ PendingPriceChange  │ plan                 │ pending_chang. │
# │ SubscriptionTrial   │ rider                │ (viewonly)     │
# │ AccountLockHistory  │ rider                │ (viewonly)     │
# └─────────────────────┴──────────────────────┴────────────────┘
#
# NOTES ON THE FIX:
# 1. RiderSubscription is the CANONICAL side for trial and lock_history relationships
# 2. Both SubscriptionTrial and AccountLockHistory have read-only reverse relationships
# 3. Removed back_populates from RiderSubscription.trial and RiderSubscription.lock_history
#    to avoid SQLAlchemy's bidirectional relationship enforcement
# 4. This resolves the "both of the same direction" error that occurred when SQLAlchemy
#    tried to infer relationships from FK constraints that don't directly link the models
# ============================================================================