# backend/app/models/subscription_enhanced.py
# ============================================================================
# ENHANCED SUBSCRIPTION MODELS
# ✅ Multi-plan support, audit trails, price tracking, account lock history
# Requirements: REQ-1.1 to REQ-10.2
# ============================================================================

from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, Text, JSON, ForeignKey, Numeric, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from decimal import Decimal
import uuid

from app.database import Base


class SubscriptionPlan(Base):
    """
    ✅ REQ-1.2: Subscription plans (Bi-Weekly & Monthly ONLY)
    Supports pricing audit trails and version control
    """
    __tablename__ = "subscription_plan"
    __table_args__ = (
        Index('idx_plan_is_active', 'is_active'),
        Index('idx_plan_tier_name', 'tier_name'),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)  # "Smart Boda Bi-Weekly"
    daily_price = Column(Numeric(10, 2), nullable=False)  # 35.71 or 33.33
    trial_days = Column(Integer, default=1)  # 1-day trial
    
    # ✅ NEW: Tier management for future flexibility
    tier_name = Column(String(50))  # "biweekly", "monthly"
    tier_label = Column(String(100))  # "Bi-Weekly Plan", "Monthly Plan"
    tier_description = Column(Text)  # "500 KES for 2 weeks"
    
    # ✅ NEW: Version control for pricing history
    version = Column(Integer, default=1)
    last_modified_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    modified_by_admin = Column(String(100))  # Admin email
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    rider_subscriptions = relationship("RiderSubscription", back_populates="plan")
    pricing_change_logs = relationship("PricingChangeLog", back_populates="plan")
    pending_price_changes = relationship("PendingPriceChange", back_populates="plan", uselist=False)

    def __repr__(self):
        return f"<SubscriptionPlan {self.name} - {self.daily_price}/day>"


class RiderSubscription(Base):
    """
    ✅ REQ-1.1: Rider subscription tracking with audit trail
    Tracks trial, paid status, lock status, and payment history
    """
    __tablename__ = "rider_subscription"
    __table_args__ = (
        UniqueConstraint('rider_id', name='uq_rider_subscription'),
        Index('idx_subscription_locked', 'locked'),
        Index('idx_subscription_expiry_at', 'expiry_at'),
        Index('idx_subscription_rider_id', 'rider_id'),
    )

    id = Column(Integer, primary_key=True, index=True)
    rider_id = Column(UUID(as_uuid=True), nullable=False, unique=True)
    plan_id = Column(Integer, ForeignKey("subscription_plan.id"))
    
    # ✅ Status tracking
    expiry_at = Column(DateTime(timezone=True), nullable=False)
    frequency = Column(String(50), default="monthly")  # "biweekly" or "monthly"
    has_ever_paid = Column(Boolean, default=False)  # Trial vs paid users
    
    # ✅ Account locking (REQ-7.1, REQ-7.2)
    locked = Column(Boolean, default=False)
    lock_reason = Column(String(255))  # "Subscription Expired" or "Free Trial Expired"
    locked_at = Column(DateTime(timezone=True))
    
    # ✅ NEW: Payment tracking
    last_payment_at = Column(DateTime(timezone=True))
    last_payment_amount = Column(Numeric(10, 2))
    total_paid_lifetime = Column(Numeric(10, 2), default=0)
    
    # ✅ NEW: Price change notifications
    price_change_viewed_at = Column(DateTime(timezone=True))
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    plan = relationship("SubscriptionPlan", back_populates="rider_subscriptions")
    payments = relationship("Payment", back_populates="subscription")
    lock_history = relationship("AccountLockHistory", back_populates="subscription")

    def __repr__(self):
        status = "locked" if self.locked else ("paid" if self.has_ever_paid else "trial")
        return f"<RiderSubscription {self.rider_id} - {status}>"


class PricingChangeLog(Base):
    """
    ✅ REQ-3.1: Complete audit trail for all pricing changes
    Tracks every price modification with approval and effective dates
    """
    __tablename__ = "pricing_change_log"
    __table_args__ = (
        Index('idx_pricing_plan_id', 'plan_id'),
        Index('idx_pricing_effective_at', 'effective_at'),
        Index('idx_pricing_version', 'version'),
    )

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("subscription_plan.id"), nullable=False)
    version = Column(Integer, nullable=False)  # Plan version number
    
    daily_price_old = Column(Numeric(10, 2))  # Previous price
    daily_price_new = Column(Numeric(10, 2), nullable=False)  # New price
    
    # ✅ Timeline tracking
    announced_at = Column(DateTime(timezone=True), nullable=False)  # When change was scheduled
    effective_at = Column(DateTime(timezone=True), nullable=False)  # When it takes effect
    applied_at = Column(DateTime(timezone=True))  # When it was actually applied
    
    # ✅ NEW: Cancellation support
    cancelled_at = Column(DateTime(timezone=True))
    cancelled_by_admin = Column(String(100))  # Admin email who cancelled
    
    # Admin tracking
    created_by_admin = Column(String(100), nullable=False)  # Admin email who created
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    plan = relationship("SubscriptionPlan", back_populates="pricing_change_logs")

    def __repr__(self):
        return f"<PricingChangeLog Plan {self.plan_id} v{self.version} - {self.daily_price_old} → {self.daily_price_new}>"


class PendingPriceChange(Base):
    """
    ✅ REQ-EM-10: Tracks active price changes that will be applied
    Only one pending change per plan at a time
    """
    __tablename__ = "pending_price_change"
    __table_args__ = (
        UniqueConstraint('plan_id', name='uq_pending_price_change'),
        Index('idx_pending_effective_at', 'effective_at'),
    )

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("subscription_plan.id"), nullable=False, unique=True)
    
    daily_price = Column(Numeric(10, 2), nullable=False)  # New price to apply
    version = Column(Integer, nullable=False)  # Which version this is
    
    announced_at = Column(DateTime(timezone=True), nullable=False)
    effective_at = Column(DateTime(timezone=True), nullable=False)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    plan = relationship("SubscriptionPlan", back_populates="pending_price_changes")

    def __repr__(self):
        return f"<PendingPriceChange Plan {self.plan_id} - {self.daily_price}/day effective {self.effective_at}>"


class SubscriptionTrial(Base):
    """
    ✅ REQ-5.1: Trial period tracking with conversion tracking
    """
    __tablename__ = "subscription_trial"
    __table_args__ = (
        UniqueConstraint('rider_id', name='uq_subscription_trial'),
        Index('idx_trial_rider_id', 'rider_id'),
        Index('idx_trial_converted', 'converted_to_paid'),
    )

    id = Column(Integer, primary_key=True, index=True)
    rider_id = Column(UUID(as_uuid=True), nullable=False, unique=True)
    
    started_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    converted_to_paid = Column(Boolean, default=False)
    converted_at = Column(DateTime(timezone=True))
    
    # Notification tracking
    notification_sent_at = Column(DateTime(timezone=True))  # When trial-ending notification was sent
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        status = "converted" if self.converted_to_paid else "active"
        return f"<SubscriptionTrial {self.rider_id} - {status}>"


class AccountLockHistory(Base):
    """
    ✅ REQ-7.1, REQ-7.2: Complete audit trail of account locks/unlocks
    """
    __tablename__ = "account_lock_history"
    __table_args__ = (
        Index('idx_lock_rider_id', 'rider_id'),
        Index('idx_lock_triggered_at', 'triggered_at'),
        Index('idx_lock_action', 'action'),
    )

    id = Column(Integer, primary_key=True, index=True)
    rider_id = Column(UUID(as_uuid=True), nullable=False)
    
    action = Column(String(20), nullable=False)  # "locked" or "unlocked"
    reason = Column(String(255))  # Why it was locked/unlocked
    
    # Trigger tracking
    triggered_by = Column(String(100), nullable=False)  # "system" or admin email
    triggered_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Audit
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    subscription = relationship("RiderSubscription", back_populates="lock_history")

    def __repr__(self):
        return f"<AccountLockHistory {self.rider_id} - {self.action} by {self.triggered_by}>"


class Payment(Base):
    """
    ✅ REQ-2.1-2.5: Payment recording with reconciliation tracking
    """
    __tablename__ = "payment"
    __table_args__ = (
        Index('idx_payment_rider_id', 'rider_id'),
        Index('idx_payment_submitted_at', 'submitted_at'),
        Index('idx_payment_reconciliation', 'reconciliation'),
    )

    id = Column(Integer, primary_key=True, index=True)
    rider_id = Column(UUID(as_uuid=True), nullable=False)
    subscription_id = Column(Integer, ForeignKey("rider_subscription.id"))
    
    amount = Column(Numeric(10, 2), nullable=False)
    label = Column(String(255))  # "Bi-Weekly Plan", "Monthly Plan", "7-Day Prepayment"
    mpesa_code = Column(String(20), nullable=False)  # M-Pesa confirmation code
    channel = Column(String(50), default="M-Pesa")
    
    # Submission tracking
    submitted_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # ✅ Reconciliation status (REQ-2.2)
    reconciliation = Column(String(50), default="Pending")  # "Pending" or "Verified"
    verified_by = Column(String(100))  # Super Admin email
    verified_at = Column(DateTime(timezone=True))
    
    notes = Column(Text)  # Admin notes
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    subscription = relationship("RiderSubscription", back_populates="payments")

    def __repr__(self):
        return f"<Payment {self.rider_id} - KES {self.amount} - {self.reconciliation}>"


# ============================================================================
# INDEXES FOR PERFORMANCE
# ============================================================================

__all__ = [
    'SubscriptionPlan',
    'RiderSubscription',
    'PricingChangeLog',
    'PendingPriceChange',
    'SubscriptionTrial',
    'AccountLockHistory',
    'Payment'
]