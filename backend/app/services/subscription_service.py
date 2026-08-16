# backend/app/services/subscription_service.py
# Core subscription business logic
# Handles: plan calculations, lock/unlock, price changes, payment processing

import math
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import Optional, Dict, List, Tuple

from app.models.subscription_enhanced import (
    SubscriptionPlan,
    RiderSubscription,
    PricingChangeLog,
    PendingPriceChange,
    SubscriptionTrial,
    AccountLockHistory
)
from app.models.payment import Payment
from app.models.rider import Rider


class SubscriptionService:
    """
    Core subscription logic - all calculations and state transitions go through here.
    Ensures consistency, audit trail, and proper lock/unlock handling.
    """
    
    # Subscription frequency definitions (days -> price)
    FREQUENCIES = {
        "biweekly": {"days": 14, "label": "2-Week Plan", "emoji": "📆"},
        "monthly": {"days": 30, "label": "Monthly Plan", "emoji": "📆"},
    }
    
    TRIAL_NOTICE_HOURS = 24  # Minimum advance notice for price changes
    
    # ========================================================================
    # INITIALIZATION & SETUP
    # ========================================================================
    
    @staticmethod
    def create_rider_subscription(
        db: Session,
        rider_id: UUID,
        plan_id: int = 1,  # Default to first plan
        trial_days: int = 2
    ) -> RiderSubscription:
        """
        Initialize subscription for a new rider.
        Rider gets free trial for specified days, no immediate charge.
        """
        now = datetime.now(timezone.utc)
        expiry = now + timedelta(days=trial_days)
        
        sub = RiderSubscription(
            rider_id=rider_id,
            plan_id=plan_id,
            expiry_at=expiry,
            frequency="monthly",  # Default
            has_ever_paid=False,
            locked=False
        )
        db.add(sub)
        
        # Track trial
        trial = SubscriptionTrial(
            rider_id=rider_id,
            started_at=now
        )
        db.add(trial)
        db.commit()
        
        return sub
    
    # ========================================================================
    # PRICING CALCULATIONS
    # ========================================================================
    
    @staticmethod
    def calculate_subscription_amount(
        frequency: str,
        daily_price: Decimal
    ) -> Dict:
        """
        Calculate total subscription cost for given frequency and daily rate.
        
        Example:
        - Biweekly @ KES 35.71/day = KES 500 (14 * 35.71)
        - Monthly @ KES 33.33/day = KES 1000 (30 * 33.33)
        """
        if frequency not in SubscriptionService.FREQUENCIES:
            raise ValueError(f"Invalid frequency: {frequency}")
        
        freq_info = SubscriptionService.FREQUENCIES[frequency]
        days = freq_info["days"]
        amount = daily_price * Decimal(days)
        
        return {
            "key": frequency,
            "label": freq_info["label"],
            "days": days,
            "daily_rate": float(daily_price),
            "total_amount": float(amount),
            "amount_decimal": amount
        }
    
    @staticmethod
    def get_active_plan(db: Session) -> Optional[SubscriptionPlan]:
        """Get currently active subscription plan"""
        return db.query(SubscriptionPlan).filter(
            SubscriptionPlan.is_active == True
        ).first()
    
    # ========================================================================
    # SUBSCRIPTION STATUS
    # ========================================================================
    
    @staticmethod
    def days_until_expiry(expiry_at: datetime) -> int:
        """Calculate days remaining until expiry (handles timezone)"""
        now = datetime.now(timezone.utc)
        if expiry_at.tzinfo is None:
            expiry_at = expiry_at.replace(tzinfo=timezone.utc)
        delta = (expiry_at - now).total_seconds()
        return max(0, math.ceil(delta / 86400))
    
    @staticmethod
    def check_and_lock_if_expired(
        db: Session,
        sub: RiderSubscription
    ) -> bool:
        """
        Check if subscription has expired and lock account if needed.
        Returns True if account became newly locked.
        """
        if sub.locked:
            return False  # Already locked
        
        now = datetime.now(timezone.utc)
        if now > sub.expiry_at:
            sub.locked = True
            sub.lock_reason = (
                "Subscription Expired"
                if sub.has_ever_paid
                else "Free Trial Expired"
            )
            sub.locked_at = now
            
            # Log the lock event
            lock_record = AccountLockHistory(
                rider_id=sub.rider_id,
                action="locked",
                reason=sub.lock_reason,
                triggered_by="system"
            )
            db.add(lock_record)
            db.commit()
            
            return True
        
        return False
    
    @staticmethod
    def get_subscription_status(
        db: Session,
        rider_id: UUID
    ) -> Dict:
        """
        Get complete subscription status for rider.
        Includes plan info, expiry, lock status, and pending price changes.
        """
        sub = db.query(RiderSubscription).filter(
            RiderSubscription.rider_id == rider_id
        ).first()
        
        if not sub:
            raise ValueError(f"No subscription found for rider {rider_id}")
        
        # Check for expiry and auto-lock
        SubscriptionService.check_and_lock_if_expired(db, sub)
        
        plan = sub.plan or SubscriptionService.get_active_plan(db)
        pending_change = db.query(PendingPriceChange).filter(
            PendingPriceChange.plan_id == sub.plan_id
        ).first()
        
        return {
            "rider_id": str(sub.rider_id),
            "plan_id": sub.plan_id,
            "plan_name": plan.tier_label if plan else "Unknown",
            "daily_price": float(plan.daily_price) if plan else 0,
            "frequency": sub.frequency,
            "has_ever_paid": sub.has_ever_paid,
            "locked": sub.locked,
            "lock_reason": sub.lock_reason,
            "locked_at": sub.locked_at,
            "expiry_at": sub.expiry_at,
            "days_left": SubscriptionService.days_until_expiry(sub.expiry_at),
            "total_paid_lifetime": float(sub.total_paid_lifetime),
            "last_payment_at": sub.last_payment_at,
            "pending_price_change": {
                "daily_price": float(pending_change.daily_price),
                "effective_at": pending_change.effective_at,
                "hours_until": pending_change.hours_until_effective
            } if pending_change else None
        }
    
    # ========================================================================
    # PAYMENT PROCESSING
    # ========================================================================
    
    @staticmethod
    def process_subscription_payment(
        db: Session,
        rider_id: UUID,
        frequency: str,
        mpesa_code: str
    ) -> Dict:
        """
        Process subscription payment via M-Pesa code.
        
        Flow:
        1. Validate frequency and M-Pesa code format
        2. Get active plan and calculate amount
        3. Extend subscription from max(now, current_expiry)
        4. Record payment as "Pending Admin Review"
        5. Unlock account if it was locked
        6. Update rider lifetime stats
        """
        if frequency not in SubscriptionService.FREQUENCIES:
            raise ValueError(f"Invalid frequency: {frequency}")
        
        # Validate M-Pesa code
        code = (mpesa_code or "").strip().upper()
        if not code or len(code) < 8:
            raise ValueError("M-Pesa code must be at least 8 characters")
        
        # Get subscription and plan
        sub = db.query(RiderSubscription).filter(
            RiderSubscription.rider_id == rider_id
        ).first()
        if not sub:
            raise ValueError(f"No subscription found for rider {rider_id}")
        
        plan = sub.plan or SubscriptionService.get_active_plan(db)
        if not plan:
            raise ValueError("No active subscription plan configured")
        
        # Calculate amount
        calc = SubscriptionService.calculate_subscription_amount(
            frequency,
            plan.daily_price
        )
        
        # Extend subscription (from max of now or current expiry)
        now = datetime.now(timezone.utc)
        base_date = max(sub.expiry_at, now)
        sub.expiry_at = base_date + timedelta(days=calc["days"])
        sub.frequency = frequency
        sub.has_ever_paid = True
        sub.last_payment_at = now
        sub.last_payment_amount = calc["amount_decimal"]
        sub.total_paid_lifetime += calc["amount_decimal"]
        
        was_locked = sub.locked
        if sub.locked:
            sub.locked = False
            sub.lock_reason = None
            
            # Log unlock event
            unlock_record = AccountLockHistory(
                rider_id=rider_id,
                action="unlocked",
                reason="Payment received",
                triggered_by="system"
            )
            db.add(unlock_record)
        
        # Record payment
        payment = Payment(
            rider_id=rider_id,
            amount=calc["amount_decimal"],
            label=calc["label"],
            mpesa_code=code,
            submitted_at=now,
            reconciliation="Pending Super Admin Review"
        )
        db.add(payment)
        
        # Convert trial if needed
        trial = db.query(SubscriptionTrial).filter(
            SubscriptionTrial.rider_id == rider_id,
            SubscriptionTrial.converted_to_paid == False
        ).first()
        if trial:
            trial.converted_to_paid = True
            trial.converted_at = now
        
        db.commit()
        
        return {
            "new_expiry_at": sub.expiry_at,
            "was_locked": was_locked,
            "days_added": calc["days"],
            "total_paid": float(sub.total_paid_lifetime),
            "status": "Payment recorded - awaiting Super Admin verification"
        }
    
    @staticmethod
    def process_prepayment(
        db: Session,
        rider_id: UUID,
        days: int,
        mpesa_code: str
    ) -> Dict:
        """
        Process prepayment for custom number of days.
        Allows riders to prepay 3-60 days at daily rate.
        """
        if not (3 <= days <= 60):
            raise ValueError("Prepayment must be between 3 and 60 days")
        
        code = (mpesa_code or "").strip().upper()
        if not code or len(code) < 8:
            raise ValueError("M-Pesa code must be at least 8 characters")
        
        sub = db.query(RiderSubscription).filter(
            RiderSubscription.rider_id == rider_id
        ).first()
        if not sub:
            raise ValueError(f"No subscription found for rider {rider_id}")
        
        plan = sub.plan or SubscriptionService.get_active_plan(db)
        if not plan:
            raise ValueError("No active subscription plan configured")
        
        # Calculate total
        total_amount = plan.daily_price * Decimal(days)
        
        now = datetime.now(timezone.utc)
        base_date = max(sub.expiry_at, now)
        sub.expiry_at = base_date + timedelta(days=days)
        
        was_locked = sub.locked
        if sub.locked:
            sub.locked = False
            sub.lock_reason = None
            
            unlock_record = AccountLockHistory(
                rider_id=rider_id,
                action="unlocked",
                reason="Prepayment received",
                triggered_by="system"
            )
            db.add(unlock_record)
        
        sub.has_ever_paid = True
        sub.last_payment_at = now
        sub.last_payment_amount = total_amount
        sub.total_paid_lifetime += total_amount
        
        payment = Payment(
            rider_id=rider_id,
            amount=total_amount,
            label=f"{days}-Day Prepayment",
            mpesa_code=code,
            submitted_at=now,
            reconciliation="Pending Super Admin Review"
        )
        db.add(payment)
        
        db.commit()
        
        return {
            "new_expiry_at": sub.expiry_at,
            "was_locked": was_locked,
            "days_added": days,
            "total_paid": float(sub.total_paid_lifetime),
            "status": "Prepayment recorded - awaiting Super Admin verification"
        }
    
    # ========================================================================
    # ADMIN: ACCOUNT LOCK/UNLOCK
    # ========================================================================
    
    @staticmethod
    def admin_unlock_account(
        db: Session,
        rider_id: UUID,
        admin_email: str,
        note: str = None
    ) -> Dict:
        """
        Super Admin manually unlocks account (override automatic lock).
        """
        sub = db.query(RiderSubscription).filter(
            RiderSubscription.rider_id == rider_id
        ).first()
        if not sub:
            raise ValueError(f"No subscription found for rider {rider_id}")
        
        if not sub.locked:
            return {"status": "Already unlocked", "was_locked": False}
        
        sub.locked = False
        old_reason = sub.lock_reason
        sub.lock_reason = None
        
        lock_record = AccountLockHistory(
            rider_id=rider_id,
            action="unlocked",
            reason=f"Admin override (was: {old_reason})",
            triggered_by="admin",
            admin_email=admin_email,
            admin_note=note
        )
        db.add(lock_record)
        db.commit()
        
        return {
            "status": "Account unlocked",
            "was_locked": True,
            "unlocked_by": admin_email
        }
    
    @staticmethod
    def admin_lock_account(
        db: Session,
        rider_id: UUID,
        admin_email: str,
        reason: str
    ) -> Dict:
        """
        Super Admin manually locks account (override default behavior).
        Use sparingly - prefer automatic expiry lock.
        """
        sub = db.query(RiderSubscription).filter(
            RiderSubscription.rider_id == rider_id
        ).first()
        if not sub:
            raise ValueError(f"No subscription found for rider {rider_id}")
        
        if sub.locked:
            return {"status": "Already locked", "was_locked": True}
        
        now = datetime.now(timezone.utc)
        sub.locked = True
        sub.lock_reason = reason
        sub.locked_at = now
        
        lock_record = AccountLockHistory(
            rider_id=rider_id,
            action="locked",
            reason=reason,
            triggered_by="admin",
            admin_email=admin_email
        )
        db.add(lock_record)
        db.commit()
        
        return {
            "status": "Account locked",
            "was_locked": False,
            "locked_by": admin_email
        }
    
    # ========================================================================
    # ADMIN: PRICING MANAGEMENT
    # ========================================================================
    
    @staticmethod
    def schedule_price_change(
        db: Session,
        plan_id: int,
        new_daily_price: Decimal,
        notice_hours: int = 48,
        admin_email: str = None,
        discounts: Dict = None
    ) -> Dict:
        """
        Schedule a price change with advance notice.
        Minimum notice is 24 hours (TRIAL_NOTICE_HOURS).
        
        Returns: Dict with scheduled change details
        """
        if notice_hours < SubscriptionService.TRIAL_NOTICE_HOURS:
            raise ValueError(
                f"Minimum notice period is {SubscriptionService.TRIAL_NOTICE_HOURS} hours"
            )
        
        plan = db.query(SubscriptionPlan).get(plan_id)
        if not plan:
            raise ValueError(f"Plan {plan_id} not found")
        
        now = datetime.now(timezone.utc)
        effective_at = now + timedelta(hours=notice_hours)
        new_version = plan.version + 1
        
        # Cancel any existing pending change
        existing = db.query(PendingPriceChange).filter(
            PendingPriceChange.plan_id == plan_id
        ).first()
        if existing:
            db.delete(existing)
        
        # Create new pending change
        pending = PendingPriceChange(
            plan_id=plan_id,
            daily_price=new_daily_price,
            discounts=discounts,
            version=new_version,
            announced_at=now,
            effective_at=effective_at
        )
        db.add(pending)
        db.commit()
        
        return {
            "plan_id": plan_id,
            "daily_price_old": float(plan.daily_price),
            "daily_price_new": float(new_daily_price),
            "announced_at": now,
            "effective_at": effective_at,
            "notice_hours": notice_hours,
            "status": f"Price change scheduled. Riders will be notified. Takes effect in {notice_hours}h."
        }
    
    @staticmethod
    def cancel_pending_price_change(
        db: Session,
        plan_id: int,
        admin_email: str = None,
        reason: str = None
    ) -> Dict:
        """
        Cancel a pending price change before it takes effect.
        """
        pending = db.query(PendingPriceChange).filter(
            PendingPriceChange.plan_id == plan_id
        ).first()
        
        if not pending:
            return {"status": "No pending price change to cancel"}
        
        # Log to history before deletion
        log_entry = PricingChangeLog(
            plan_id=plan_id,
            version=pending.version,
            daily_price_old=pending.daily_price,
            daily_price_new=pending.daily_price,  # Dummy, won't be applied
            announced_at=pending.announced_at,
            effective_at=pending.effective_at,
            cancelled_at=datetime.now(timezone.utc),
            cancelled_by_admin=admin_email,
            cancellation_reason=reason,
            created_by_admin=admin_email
        )
        db.add(log_entry)
        db.delete(pending)
        db.commit()
        
        return {
            "status": "Pending price change cancelled",
            "plan_id": plan_id,
            "cancelled_by": admin_email
        }
    
    @staticmethod
    def apply_pending_price_changes(db: Session) -> List[Dict]:
        """
        Check for pending price changes that are now effective and apply them.
        Called periodically (every render in UI, or via scheduled task).
        Returns list of applied changes.
        """
        now = datetime.now(timezone.utc)
        
        # Find all pending changes that should be applied
        pending = db.query(PendingPriceChange).filter(
            PendingPriceChange.effective_at <= now
        ).all()
        
        applied = []
        
        for change in pending:
            plan = db.query(SubscriptionPlan).get(change.plan_id)
            if not plan:
                continue
            
            # Apply the change to the plan
            old_price = plan.daily_price
            plan.daily_price = change.daily_price
            plan.version = change.version
            plan.last_modified_at = now
            
            # Log it
            log_entry = PricingChangeLog(
                plan_id=plan.id,
                version=change.version,
                daily_price_old=old_price,
                daily_price_new=change.daily_price,
                discounts=change.discounts,
                announced_at=change.announced_at,
                effective_at=change.effective_at,
                applied_at=now,
                created_by_admin="system"
            )
            db.add(log_entry)
            
            # Remove from pending
            db.delete(change)
            
            applied.append({
                "plan_id": plan.id,
                "old_price": float(old_price),
                "new_price": float(change.daily_price),
                "applied_at": now
            })
        
        db.commit()
        return applied
    
    # ========================================================================
    # REPORTING & ANALYTICS
    # ========================================================================
    
    @staticmethod
    def get_subscription_statistics(db: Session) -> Dict:
        """Get overall subscription metrics for admin dashboard"""
        total_riders = db.query(RiderSubscription).count()
        active_subs = db.query(RiderSubscription).filter(
            RiderSubscription.locked == False
        ).count()
        trial_users = db.query(RiderSubscription).filter(
            RiderSubscription.has_ever_paid == False,
            RiderSubscription.locked == False
        ).count()
        paid_users = db.query(RiderSubscription).filter(
            RiderSubscription.has_ever_paid == True,
            RiderSubscription.locked == False
        ).count()
        locked_users = db.query(RiderSubscription).filter(
            RiderSubscription.locked == True
        ).count()
        
        # Revenue metrics
        total_revenue = db.query(Payment).filter(
            Payment.reconciliation == "Verified"
        ).with_entities(
            db.func.sum(Payment.amount)
        ).scalar() or 0
        
        return {
            "total_riders": total_riders,
            "active_subscriptions": active_subs,
            "trial_users": trial_users,
            "paid_users": paid_users,
            "locked_users": locked_users,
            "total_verified_revenue": float(total_revenue),
            "conversion_rate": (paid_users / max(total_riders, 1)) * 100
        }