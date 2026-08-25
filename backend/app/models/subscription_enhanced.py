"""
subscription_enhanced.py - SQLAlchemy ORM models for enhanced subscription features
FIXED: Resolves "Table already defined" SQLAlchemy error
"""

from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Boolean, Text, JSON, 
    ForeignKey, UniqueConstraint, Index, Numeric
)
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.database import Base

# ============================================================================
# ✅ FIXED: Added extend_existing=True to allow table redefinition
# This is crucial when the table is imported multiple times across modules
# ============================================================================

class SubscriptionPlan(Base):
    """
    Enhanced subscription plan with multi-tier support and audit trails
    ✅ FIXED: extend_existing=True allows redefining without conflicts
    """
    __tablename__ = 'subscription_plan'
    __table_args__ = (
        Index('ix_subscription_plan_is_active', 'is_active'),
        Index('ix_subscription_plan_tier_name', 'tier_name'),
        Index('ix_subscription_plan_version', 'version'),
        {'extend_existing': True}  # ✅ CRITICAL FIX: Prevent "already defined" error
    )

    # Core fields
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    daily_price = Column(Numeric(precision=10, scale=2), nullable=False)
    frequency = Column(String(20), nullable=False)  # 'daily', 'weekly', 'monthly'
    
    # Multi-tier support (NEW)
    tier_name = Column(String(50), nullable=True)  # 'starter', 'premium', 'pro'
    tier_label = Column(String(100), nullable=True)  # User-friendly label
    tier_description = Column(Text(), nullable=True)

    # Audit and versioning (NEW)
    version = Column(Integer, nullable=False, default=1, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    last_modified_at = Column(DateTime(timezone=True), nullable=False, 
                             default=datetime.utcnow, onupdate=datetime.utcnow)
    modified_by_admin = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, 
                       default=datetime.utcnow)

    # Relationships
    rider_subscriptions = relationship('RiderSubscription', back_populates='plan')
    pricing_changes = relationship('PricingChangeLog', back_populates='plan', cascade='all, delete-orphan')
    pending_change = relationship('PendingPriceChange', back_populates='plan', uselist=False)

    def __repr__(self):
        return f'<SubscriptionPlan({self.id}, {self.name}, {self.frequency}, ${self.daily_price})>'


class RiderSubscription(Base):
    """
    Enhanced rider subscription with financial tracking and audit
    ✅ FIXED: extend_existing=True allows table alteration
    """
    __tablename__ = 'rider_subscription'
    __table_args__ = (
        Index('ix_rider_subscription_rider_id', 'rider_id'),
        Index('ix_rider_subscription_plan_id', 'plan_id'),
        Index('ix_rider_subscription_total_paid_lifetime', 'total_paid_lifetime'),
        Index('ix_rider_subscription_last_payment_at', 'last_payment_at'),
        Index('ix_rider_subscription_price_change_viewed_at', 'price_change_viewed_at'),
        {'extend_existing': True}  # ✅ CRITICAL FIX
    )

    # Core fields
    id = Column(Integer, primary_key=True, index=True)
    rider_id = Column(UUID(as_uuid=True), ForeignKey('rider.id', ondelete='CASCADE'), 
                     nullable=False, index=True, unique=True)
    status = Column(String(50), nullable=False, default='pending_verification')
    
    # Plan reference (NEW)
    plan_id = Column(Integer, ForeignKey('subscription_plan.id', ondelete='SET NULL'), 
                    nullable=True, index=True)

    # Subscription dates
    starts_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    locked_at = Column(DateTime(timezone=True), nullable=True)

    # Financial tracking (NEW)
    total_paid_lifetime = Column(Numeric(precision=10, scale=2), nullable=False, default=0)
    last_payment_at = Column(DateTime(timezone=True), nullable=True, index=True)
    last_payment_amount = Column(Numeric(precision=10, scale=2), nullable=True)

    # Pricing awareness (NEW)
    price_change_viewed_at = Column(DateTime(timezone=True), nullable=True, index=True)

    # Audit (NEW)
    created_at = Column(DateTime(timezone=True), nullable=False, 
                       default=datetime.utcnow, index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, 
                       default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    plan = relationship('SubscriptionPlan', back_populates='rider_subscriptions')

    def __repr__(self):
        return f'<RiderSubscription({self.rider_id}, {self.status}, expires={self.expires_at})>'


class SubscriptionTrial(Base):
    """
    Trial period tracking with conversion metrics
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
    Audit trail for subscription price changes with scheduling support
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
    Current pending price changes (one per plan)
    For efficient querying of what price changes are awaiting
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
    plan = relationship('SubscriptionPlan', back_populates='pending_change')

    def __repr__(self):
        return f'<PendingPriceChange({self.plan_id}, effective={self.effective_at})>'


class AccountLockHistory(Base):
    """
    Lock/unlock audit trail (automatic and manual)
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