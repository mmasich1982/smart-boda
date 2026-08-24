# backend/app/services/subscription_service.py
# ============================================================================
# SUBSCRIPTION SERVICE - CORE BUSINESS LOGIC
# ✅ Plan calculations, status tracking, pricing, locking, audit trails
# ============================================================================

from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID
from typing import Optional, Dict, List
import math

from app.models.subscription_enhanced import (
    SubscriptionPlan,
    RiderSubscription,
    PricingChangeLog,
    PendingPriceChange,
    SubscriptionTrial,
    AccountLockHistory,
    Payment
)


class SubscriptionService:
    """
    Core subscription business logic service
    ✅ Requirements coverage: REQ-1.1 to REQ-10.2
    """

    # ✅ ONLY TWO PLANS
    FREQUENCIES = {
        "biweekly": {
            "label": "Bi-Weekly",
            "days": 14,
            "price_kes": 500,
            "daily_price": 35.71
        },
        "monthly": {
            "label": "Monthly",
            "days": 30,
            "price_kes": 1000,
            "daily_price": 33.33
        }
    }

    TRIAL_PERIOD_DAYS = 1  # REQ-1.1: 1-day free trial

    # ========================================================================
    # SUBSCRIPTION STATUS & RETRIEVAL
    # ========================================================================

    @staticmethod
    def ensure_subscription_exists(db: Session, rider_id: UUID) -> RiderSubscription:
        """
        ✅ REQ-1.1: Ensure subscription exists for rider
        Creates with 1-day free trial if not present
        """
        sub = db.query(RiderSubscription).filter(
            RiderSubscription.rider_id == rider_id
        ).first()

        if sub:
            return sub

        # Create default subscription with 1-day trial
        now = datetime.now(timezone.utc)
        trial_expiry = now + timedelta(days=SubscriptionService.TRIAL_PERIOD_DAYS)

        sub = RiderSubscription(
            rider_id=rider_id,
            expiry_at=trial_expiry,
            frequency="monthly",
            has_ever_paid=False,
            locked=False
        )

        db.add(sub)
        db.commit()
        db.refresh(sub)

        # Create trial record
        trial = SubscriptionTrial(rider_id=rider_id)
        db.add(trial)
        db.commit()

        return sub

    @staticmethod
    def get_subscription_status(db: Session, rider_id: UUID) -> Dict:
        """
        Get complete subscription status for rider
        """
        sub = SubscriptionService.ensure_subscription_exists(db, rider_id)

        # Check for expiry and auto-lock
        SubscriptionService.check_and_lock_if_expired(db, sub)

        days_left = SubscriptionService.days_until_expiry(sub.expiry_at)

        return {
            "rider_id": str(rider_id),
            "status": "locked" if sub.locked else ("paid" if sub.has_ever_paid else "trial"),
            "locked": sub.locked,
            "lock_reason": sub.lock_reason,
            "has_ever_paid": sub.has_ever_paid,
            "frequency": sub.frequency,
            "expiry_at": sub.expiry_at.isoformat() if sub.expiry_at else None,
            "days_left": max(0, days_left),
            "last_payment_at": sub.last_payment_at.isoformat() if sub.last_payment_at else None,
            "last_payment_amount": float(sub.last_payment_amount) if sub.last_payment_amount else None,
            "total_paid_lifetime": float(sub.total_paid_lifetime) if sub.total_paid_lifetime else 0,
            "plan_id": sub.plan_id,
            "locked_at": sub.locked_at.isoformat() if sub.locked_at else None
        }

    # ========================================================================
    # LOCKING & EXPIRY MANAGEMENT
    # ========================================================================

    @staticmethod
    def check_and_lock_if_expired(db: Session, sub: RiderSubscription) -> bool:
        """
        ✅ REQ-7.1: Check if subscription expired and auto-lock
        Returns True if newly locked
        """
        if sub.locked:
            return False

        now = datetime.now(timezone.utc)
        if now > sub.expiry_at:
            sub.locked = True
            sub.lock_reason = (
                "Subscription Expired"
                if sub.has_ever_paid
                else "Free Trial Expired"
            )
            sub.locked_at = now

            # Log the lock
            lock_entry = AccountLockHistory(
                rider_id=sub.rider_id,
                action="locked",
                reason=sub.lock_reason,
                triggered_by="system"
            )
            db.add(lock_entry)
            db.commit()

            return True

        return False

    @staticmethod
    def lock_account_manual(
        db: Session,
        rider_id: UUID,
        reason: str,
        admin_email: str
    ) -> Dict:
        """
        ✅ REQ-7.2: Manually lock an account
        """
        sub = SubscriptionService.ensure_subscription_exists(db, rider_id)

        sub.locked = True
        sub.lock_reason = reason
        sub.locked_at = datetime.now(timezone.utc)

        lock_entry = AccountLockHistory(
            rider_id=rider_id,
            action="locked",
            reason=reason,
            triggered_by=admin_email
        )

        db.add(lock_entry)
        db.commit()

        return {
            "success": True,
            "rider_id": str(rider_id),
            "locked": True,
            "reason": reason
        }

    @staticmethod
    def unlock_account(
        db: Session,
        rider_id: UUID,
        admin_email: str
    ) -> Dict:
        """
        ✅ REQ-7.2: Unlock an account
        """
        sub = SubscriptionService.ensure_subscription_exists(db, rider_id)

        sub.locked = False
        sub.lock_reason = None
        sub.locked_at = None

        lock_entry = AccountLockHistory(
            rider_id=rider_id,
            action="unlocked",
            reason="Manual unlock by admin",
            triggered_by=admin_email
        )

        db.add(lock_entry)
        db.commit()

        return {
            "success": True,
            "rider_id": str(rider_id),
            "locked": False,
            "unlocked_by": admin_email
        }

    # ========================================================================
    # PAYMENT PROCESSING
    # ========================================================================

    @staticmethod
    def calculate_subscription_amount(frequency: str, daily_price: float) -> Dict:
        """
        Calculate amount for subscription frequency
        """
        if frequency not in SubscriptionService.FREQUENCIES:
            raise ValueError(f"Invalid frequency: {frequency}")

        freq_info = SubscriptionService.FREQUENCIES[frequency]
        amount = Decimal(str(daily_price)) * freq_info["days"]

        return {
            "frequency": frequency,
            "label": freq_info["label"],
            "days": freq_info["days"],
            "daily_price": daily_price,
            "total_amount": float(amount),
            "price_kes": freq_info["price_kes"]
        }

    @staticmethod
    def process_subscription_payment(
        db: Session,
        rider_id: UUID,
        frequency: str,
        mpesa_code: str,
        admin_email: str = "system"
    ) -> Dict:
        """
        ✅ REQ-2.1-2.5: Process subscription payment
        - Immediate unlock after payment
        - Payment stacking support
        """
        if frequency not in SubscriptionService.FREQUENCIES:
            raise ValueError(f"Invalid frequency: {frequency}")

        sub = SubscriptionService.ensure_subscription_exists(db, rider_id)

        # Get plan
        plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.tier_name == frequency,
            SubscriptionPlan.is_active == True
        ).first()

        if not plan:
            raise ValueError(f"No active plan for frequency: {frequency}")

        # Calculate amount
        freq_info = SubscriptionService.FREQUENCIES[frequency]
        amount = Decimal(str(plan.daily_price)) * freq_info["days"]

        now = datetime.now(timezone.utc)

        # ✅ REQ-2.5: Payment stacking
        base_date = max(sub.expiry_at, now)
        new_expiry = base_date + timedelta(days=freq_info["days"])

        # Update subscription
        was_locked = sub.locked
        sub.plan_id = plan.id
        sub.frequency = frequency
        sub.has_ever_paid = True
        sub.expiry_at = new_expiry
        sub.locked = False  # ✅ REQ-2.1: IMMEDIATE unlock
        sub.lock_reason = None
        sub.locked_at = None
        sub.last_payment_at = now
        sub.last_payment_amount = amount
        sub.total_paid_lifetime = (sub.total_paid_lifetime or 0) + amount

        # ✅ REQ-2.2: Record payment as "Pending Super Admin Review"
        payment = Payment(
            rider_id=rider_id,
            subscription_id=sub.id,
            amount=amount,
            label=f"{freq_info['label']} Plan",
            mpesa_code=mpesa_code.strip().upper(),
            channel="M-Pesa",
            reconciliation="Pending"
        )

        db.add(payment)

        # Log unlock if was locked
        if was_locked:
            lock_entry = AccountLockHistory(
                rider_id=rider_id,
                action="unlocked",
                reason="Payment received",
                triggered_by="system"
            )
            db.add(lock_entry)

        # Convert trial to paid if applicable
        trial = db.query(SubscriptionTrial).filter(
            SubscriptionTrial.rider_id == rider_id,
            SubscriptionTrial.converted_to_paid == False
        ).first()

        if trial:
            trial.converted_to_paid = True
            trial.converted_at = now

        db.commit()
        db.refresh(sub)

        return {
            "success": True,
            "rider_id": str(rider_id),
            "payment": {
                "id": payment.id,
                "amount": float(amount),
                "label": payment.label,
                "mpesa_code": payment.mpesa_code,
                "reconciliation": payment.reconciliation,
                "submitted_at": payment.submitted_at.isoformat()
            },
            "subscription": {
                "frequency": frequency,
                "new_expiry_at": new_expiry.isoformat(),
                "new_expiry_date": new_expiry.date().isoformat(),
                "days_added": freq_info["days"],
                "was_locked": was_locked,
                "now_unlocked": True
            },
            "message": "Payment recorded! Your subscription is active. Super Admin will verify shortly."
        }

    @staticmethod
    def process_prepayment(
        db: Session,
        rider_id: UUID,
        days: int,
        mpesa_code: str
    ) -> Dict:
        """
        ✅ REQ-9.1: Process prepayment for custom days (3-60)
        """
        if not (3 <= days <= 60):
            raise ValueError("Prepayment must be between 3 and 60 days")

        sub = SubscriptionService.ensure_subscription_exists(db, rider_id)

        plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.is_active == True
        ).first()

        if not plan:
            raise ValueError("No active plan configured")

        amount = Decimal(str(plan.daily_price)) * days
        now = datetime.now(timezone.utc)

        # Payment stacking
        base_date = max(sub.expiry_at, now)
        new_expiry = base_date + timedelta(days=days)

        was_locked = sub.locked
        sub.expiry_at = new_expiry
        sub.locked = False
        sub.lock_reason = None
        sub.locked_at = None
        sub.last_payment_at = now
        sub.last_payment_amount = amount
        sub.total_paid_lifetime = (sub.total_paid_lifetime or 0) + amount

        payment = Payment(
            rider_id=rider_id,
            subscription_id=sub.id,
            amount=amount,
            label=f"{days}-Day Prepayment",
            mpesa_code=mpesa_code.strip().upper(),
            channel="M-Pesa",
            reconciliation="Pending"
        )

        db.add(payment)

        if was_locked:
            lock_entry = AccountLockHistory(
                rider_id=rider_id,
                action="unlocked",
                reason="Prepayment received",
                triggered_by="system"
            )
            db.add(lock_entry)

        db.commit()

        return {
            "success": True,
            "prepayment": {
                "days": days,
                "amount": float(amount),
                "new_expiry_at": new_expiry.isoformat(),
                "new_expiry_date": new_expiry.date().isoformat(),
                "was_locked": was_locked,
                "now_unlocked": True
            },
            "message": f"Prepaid {days} days successfully!"
        }

    # ========================================================================
    # PRICING MANAGEMENT
    # ========================================================================

    @staticmethod
    def schedule_price_change(
        db: Session,
        plan_id: int,
        new_daily_price: Decimal,
        admin_email: str,
        hours_advance_notice: int = 24
    ) -> Dict:
        """
        ✅ REQ-EM-10: Schedule a price change with advance notice
        Minimum 24 hours notice
        """
        plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.id == plan_id
        ).first()

        if not plan:
            raise ValueError("Plan not found")

        now = datetime.now(timezone.utc)
        announced_at = now
        effective_at = now + timedelta(hours=hours_advance_notice)

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
            version=plan.version + 1,
            announced_at=announced_at,
            effective_at=effective_at
        )

        # Log in changelog
        log_entry = PricingChangeLog(
            plan_id=plan_id,
            version=plan.version + 1,
            daily_price_old=plan.daily_price,
            daily_price_new=new_daily_price,
            announced_at=announced_at,
            effective_at=effective_at,
            created_by_admin=admin_email
        )

        db.add(pending)
        db.add(log_entry)
        db.commit()

        return {
            "success": True,
            "plan_id": plan_id,
            "announced_at": announced_at.isoformat(),
            "effective_at": effective_at.isoformat(),
            "hours_until_effective": hours_advance_notice,
            "message": f"Price change scheduled. Riders will see notification for {hours_advance_notice} hours."
        }

    @staticmethod
    def apply_pending_price_changes(db: Session) -> List[Dict]:
        """
        ✅ REQ-EM-10: Apply pending price changes that are now effective
        Called by scheduled task or admin
        """
        now = datetime.now(timezone.utc)
        
        pendings = db.query(PendingPriceChange).filter(
            PendingPriceChange.effective_at <= now
        ).all()

        applied = []

        for pending in pendings:
            plan = pending.plan
            
            # Update plan
            plan.daily_price = pending.daily_price
            plan.version = pending.version
            plan.last_modified_at = now

            # Log the application
            log_entry = db.query(PricingChangeLog).filter(
                PricingChangeLog.plan_id == plan.id,
                PricingChangeLog.version == pending.version
            ).first()

            if log_entry:
                log_entry.applied_at = now

            db.delete(pending)

            applied.append({
                "plan_id": plan.id,
                "plan_name": plan.name,
                "new_price": float(plan.daily_price)
            })

        if applied:
            db.commit()

        return applied

    @staticmethod
    def cancel_pending_price_change(
        db: Session,
        plan_id: int,
        admin_email: str
    ) -> Dict:
        """
        ✅ REQ-EM-10: Cancel a pending price change
        """
        pending = db.query(PendingPriceChange).filter(
            PendingPriceChange.plan_id == plan_id
        ).first()

        if not pending:
            raise ValueError("No pending price change for this plan")

        # Log cancellation
        log_entry = db.query(PricingChangeLog).filter(
            PricingChangeLog.plan_id == plan_id,
            PricingChangeLog.version == pending.version
        ).first()

        if log_entry:
            log_entry.cancelled_at = datetime.now(timezone.utc)
            log_entry.cancelled_by_admin = admin_email

        db.delete(pending)
        db.commit()

        return {
            "success": True,
            "plan_id": plan_id,
            "message": "Price change cancelled"
        }

    # ========================================================================
    # PAYMENT RECONCILIATION
    # ========================================================================

    @staticmethod
    def verify_payment(
        db: Session,
        payment_id: int,
        admin_email: str
    ) -> Dict:
        """
        ✅ REQ-6.1: Verify payment after checking M-Pesa records
        """
        payment = db.query(Payment).filter(
            Payment.id == payment_id
        ).first()

        if not payment:
            raise ValueError("Payment not found")

        now = datetime.now(timezone.utc)
        payment.reconciliation = "Verified"
        payment.verified_by = admin_email
        payment.verified_at = now

        db.commit()

        return {
            "success": True,
            "payment_id": payment_id,
            "reconciliation": "Verified",
            "verified_at": now.isoformat()
        }

    # ========================================================================
    # UTILITY FUNCTIONS
    # ========================================================================

    @staticmethod
    def days_until_expiry(expiry_date: datetime) -> int:
        """
        Calculate days remaining until expiry
        """
        now = datetime.now(timezone.utc)
        diff = expiry_date - now
        return math.ceil(diff.total_seconds() / 86400)

    @staticmethod
    def validate_mpesa_code(code: str) -> str:
        """
        ✅ REQ-2.3: Validate M-Pesa code format
        """
        code = (code or "").strip().upper()

        if not code:
            raise ValueError("M-Pesa code is required")

        if len(code) < 8:
            raise ValueError("M-Pesa code too short (min 8 characters)")

        if len(code) > 20:
            raise ValueError("M-Pesa code too long (max 20 characters)")

        return code