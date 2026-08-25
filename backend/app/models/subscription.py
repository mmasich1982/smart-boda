# backend/app/models/subscription.py
# ✅ COMPREHENSIVE FIX: Single authoritative source for all subscription models
# Consolidates subscription.py and subscription_enhanced.py into ONE file
# Resolves "Trying to redefine primary-key column" error

import uuid
from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, DateTime, ForeignKey, JSON, 
    func, Text, Index, UniqueConstraint
)
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
    
    ✅ FIXED: extend_existing=True allows table alteration
    """
    __tablename__ = "subscription_plan"
    __table_args__ = (
        Index('ix_subscription_plan_is_active', 'is_active'),
        Index('ix_subscription_plan_tier_name', 'tier_name'),
        Index('ix_subscription_plan_version', 'version'),
        {'extend_existing': True}
    )
    
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
    pricing_changes = relationship(
        "PricingChangeLog", 
        back_populates="plan", 
        cascade="all, delete-orphan"
    )
    pending_changes = relationship(
        "PendingPriceChange", 
        back_populates="plan", 
        uselist=True, 
        cascade="all, delete-orphan"
    )
    rider_subscriptions = relationship(
        "RiderSubscription", 
        back_populates="plan", 
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f'<SubscriptionPlan({self.id}, {self.name}, ${self.daily_price})>'


class RiderSubscription(Base):
    """
    Rider's subscription status and history.
    Tracks trial/paid status, expiry, lock state, and plan selection.
    
    ACCOUNT LOCKING TRIGGERS:
    1. Trial expires (1 day) with NO payment → Auto-lock
    2. Paid subscription expires → Auto-lock
    3. Super Admin manual lock → Admin-triggered lock
    
    ✅ FIXED: extend_existing=True allows table alteration
    ✅ FIXED: rider_id is PRIMARY KEY (not redefined as non-PK)
    """
    __tablename__ = "rider_subscription"
    __table_args__ = (
        Index('ix_rider_subscription_plan_id', 'plan_id'),
        Index('ix_rider_subscription_total_paid_lifetime', 'total_paid_lifetime'),
        Index('ix_rider_subscription_last_payment_at', 'last_payment_at'),
        Index('ix_rider_subscription_price_change_viewed_at', 'price_change_viewed_at'),
        Index('ix_rider_subscription_created_at', 'created_at'),
        {'extend_existing': True}
    )
    
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
    
    # ✅ ALL RELATIONSHIPS WITH EXPLICIT PRIMARYJOIN
    plan = relationship("SubscriptionPlan", back_populates="rider_subscriptions")
    
    # Relationship to Payment (viewonly because we can't cascade deletes across FK types)
    payments = relationship(
        "Payment",
        primaryjoin="RiderSubscription.rider_id == foreign(Payment.rider_id)",
        foreign_keys="[Payment.rider_id]",
        viewonly=True,
        lazy="select",
        uselist=True
    )
    
    # Relationship to SubscriptionTrial (one-to-one, this is the canonical side)
    trial = relationship(
        "SubscriptionTrial",
        primaryjoin="RiderSubscription.rider_id == foreign(SubscriptionTrial.rider_id)",
        foreign_keys="[SubscriptionTrial.rider_id]",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="select"
    )
    
    # Relationship to AccountLockHistory (one-to-many, this is the canonical side)
    lock_history = relationship(
        "AccountLockHistory",
        primaryjoin="RiderSubscription.rider_id == foreign(AccountLockHistory.rider_id)",
        foreign_keys="[AccountLockHistory.rider_id]",
        uselist=True,
        cascade="all, delete-orphan",
        lazy="select"
    )

    def __repr__(self):
        return f'<RiderSubscription({self.rider_id}, locked={self.locked}, expiry={self.expiry_at})>'


class SubscriptionTrial(Base):
    """
    Trial period tracking with conversion metrics.
    One trial per rider, linked via rider_id.
    """
    __tablename__ = 'subscription_trial'
    __table_args__ = (
        Index('ix_subscription_trial_rider_id', 'rider_id', unique=True),
        Index('ix_subscription_trial_converted_to_paid', 'converted_to_paid'),
        Index('ix_subscription_trial_started_at', 'started_at'),
        Index('ix_subscription_trial_converted_at', 'converted_at'),
    )

    id = Column(Integer, primary_key=True, index=True)
    rider_id = Column(UUID(as_uuid=True), ForeignKey('rider.id', ondelete='CASCADE'), 
                     nullable=False, unique=True, index=True)

    started_at = Column(DateTime(timezone=True), nullable=False, 
                       default=datetime.utcnow)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    converted_to_paid = Column(Boolean, nullable=False, default=False)
    converted_at = Column(DateTime(timezone=True), nullable=True, index=True)

    # Notification tracking
    notification_sent_at = Column(DateTime(timezone=True), nullable=True)

    # Audit
    created_at = Column(DateTime(timezone=True), nullable=False, 
                       default=datetime.utcnow)

    def __repr__(self):
        return f'<SubscriptionTrial({self.rider_id}, converted={self.converted_to_paid})>'


class PricingChangeLog(Base):
    """
    Audit trail for subscription price changes with scheduling support.
    """
    __tablename__ = 'pricing_change_log'
    __table_args__ = (
        Index('ix_pricing_change_log_plan_id', 'plan_id'),
        Index('ix_pricing_change_log_version', 'version'),
        Index('ix_pricing_change_log_effective_at', 'effective_at'),
        Index('ix_pricing_change_log_applied_at', 'applied_at'),
        Index('ix_pricing_change_log_plan_applied', 'plan_id', 'applied_at'),
        Index('ix_pricing_change_log_is_pending', 'applied_at', 'cancelled_at'),
    )

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey('subscription_plan.id', ondelete='CASCADE'), 
                    nullable=False, index=True)

    # Version tracking
    version = Column(Integer, nullable=False)

    # Pricing details
    daily_price_old = Column(Numeric(precision=10, scale=2), nullable=False)
    daily_price_new = Column(Numeric(precision=10, scale=2), nullable=False)
    discounts = Column(JSON, nullable=True)

    # Timing
    announced_at = Column(DateTime(timezone=True), nullable=False)
    effective_at = Column(DateTime(timezone=True), nullable=False, index=True)
    applied_at = Column(DateTime(timezone=True), nullable=True, index=True)

    # Cancellation
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_by_admin = Column(String(100), nullable=True)
    cancellation_reason = Column(String(500), nullable=True)

    # Admin tracking
    created_by_admin = Column(String(100), nullable=False)
    creation_ip = Column(String(50), nullable=True)

    # Audit
    created_at = Column(DateTime(timezone=True), nullable=False, 
                       default=datetime.utcnow)

    # Relationships
    plan = relationship('SubscriptionPlan', back_populates='pricing_changes')

    def __repr__(self):
        return f'<PricingChangeLog({self.plan_id}, v{self.version}, ${self.daily_price_old}->${self.daily_price_new})>'


class PendingPriceChange(Base):
    """
    Current pending price changes (one per plan).
    For efficient querying of what price changes are awaiting.
    """
    __tablename__ = 'pending_price_change'
    __table_args__ = (
        Index('ix_pending_price_change_plan_id', 'plan_id', unique=True),
        Index('ix_pending_price_change_effective_at', 'effective_at'),
    )

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey('subscription_plan.id', ondelete='CASCADE'), 
                    nullable=False, unique=True, index=True)

    # Pricing change details
    daily_price = Column(Numeric(precision=10, scale=2), nullable=False)
    discounts = Column(JSON, nullable=True)
    version = Column(Integer, nullable=False)

    # Timing
    announced_at = Column(DateTime(timezone=True), nullable=False)
    effective_at = Column(DateTime(timezone=True), nullable=False, index=True)

    # Audit
    created_at = Column(DateTime(timezone=True), nullable=False, 
                       default=datetime.utcnow)

    # Relationships
    plan = relationship('SubscriptionPlan', back_populates='pending_changes')

    def __repr__(self):
        return f'<PendingPriceChange({self.plan_id}, effective={self.effective_at})>'


class AccountLockHistory(Base):
    """
    Lock/unlock audit trail (automatic and manual).
    """
    __tablename__ = 'account_lock_history'
    __table_args__ = (
        Index('ix_account_lock_history_rider_id', 'rider_id'),
        Index('ix_account_lock_history_action', 'action'),
        Index('ix_account_lock_history_triggered_at', 'triggered_at'),
        Index('ix_account_lock_history_rider_action', 'rider_id', 'action'),
        Index('ix_account_lock_history_triggered_by', 'triggered_by'),
    )

    id = Column(Integer, primary_key=True, index=True)
    rider_id = Column(UUID(as_uuid=True), ForeignKey('rider.id', ondelete='CASCADE'), 
                     nullable=False, index=True)

    # Action type
    action = Column(String(20), nullable=False)  # 'lock', 'unlock'
    reason = Column(String(255), nullable=True)

    # Trigger
    triggered_by = Column(String(50), nullable=False)  # 'system', 'manual'
    triggered_at = Column(DateTime(timezone=True), nullable=False, 
                         default=datetime.utcnow, index=True)

    # For manual actions
    admin_email = Column(String(100), nullable=True)
    admin_note = Column(String(500), nullable=True)

    # Audit
    created_at = Column(DateTime(timezone=True), nullable=False, 
                       default=datetime.utcnow)

    def __repr__(self):
        return f'<AccountLockHistory({self.rider_id}, {self.action}, by={self.triggered_by})>'