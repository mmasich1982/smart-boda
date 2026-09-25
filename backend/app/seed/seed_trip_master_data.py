# backend/app/seed/seed_trip_master_data.py
"""
Idempotent seed script for trip master data.
Handles duplicate records gracefully without failing.
"""
from app.database import SessionLocal
from app.models.trip_master_data import PaymentChannelMaster, CorrectionReasonMaster, TripEntryRuleConfig
from sqlalchemy.exc import IntegrityError
import logging

logger = logging.getLogger(__name__)

PAYMENT_CHANNELS = [
    {"code": "Cash", "display_name": "Cash", "emoji": "💵", "sort_order": 1},
    {"code": "MPesa", "display_name": "M-Pesa", "emoji": "📲", "sort_order": 2},
    {"code": "LipaLater", "display_name": "Lipa Later", "emoji": "🕒", "sort_order": 3},
    {"code": "SendMoney", "display_name": "Send Money", "emoji": "📲", "sort_order": 12, "is_active": False},
    {"code": "Till", "display_name": "Till Number", "emoji": "🏪", "sort_order": 13, "is_active": False},
    {"code": "Paybill", "display_name": "Paybill", "emoji": "🧾", "sort_order": 14, "is_active": False},
    {"code": "Pochi", "display_name": "Pochi la Biashara", "emoji": "👝", "sort_order": 15, "is_active": False},
]

CORRECTION_REASONS = [
    {"code": "typo", "display_name": "Typo", "sort_order": 1},
    {"code": "wrong_method", "display_name": "Wrong Payment Method Selected", "sort_order": 2},
    {"code": "duplicate", "display_name": "Duplicate Entry", "sort_order": 3},
    {"code": "other", "display_name": "Other", "sort_order": 4},
]

RULE_CONFIG = [
    {"config_key": "correction_window_hours", "config_value": 24, "description": "BR-SB07-001"},
    {"config_key": "oow_request_sla_hours", "config_value": 72, "description": "BR-SB07-007"},
]


def seed_payment_channels(db):
    """Idempotently seed payment channels using database merge."""
    try:
        for row in PAYMENT_CHANNELS:
            # ✅ FIXED: Check if exists first instead of relying on merge
            existing = db.query(PaymentChannelMaster).filter_by(code=row["code"]).first()
            
            if existing:
                # Update existing record
                for key, value in row.items():
                    setattr(existing, key, value)
                logger.debug(f"  Updated payment channel: {row['code']}")
            else:
                # Create new record
                db.add(PaymentChannelMaster(**row))
                logger.debug(f"  Created payment channel: {row['code']}")
        
        db.commit()
        logger.info(f"✓ Seeded {len(PAYMENT_CHANNELS)} payment channels")
    except IntegrityError as e:
        db.rollback()
        logger.warning(f"⚠ Integrity error in payment channels (likely duplicate): {e}")
    except Exception as e:
        db.rollback()
        logger.warning(f"⚠ Payment channel seeding issue: {e}")


def seed_correction_reasons(db):
    """Idempotently seed correction reasons with existence checking."""
    for row in CORRECTION_REASONS:
        try:
            # Check if exists
            existing = db.query(CorrectionReasonMaster).filter_by(code=row["code"]).first()
            
            if existing:
                # Update existing record
                for key, value in row.items():
                    setattr(existing, key, value)
                logger.debug(f"  Updated correction reason: {row['code']}")
            else:
                # Create new record
                db.add(CorrectionReasonMaster(**row))
                logger.debug(f"  Created correction reason: {row['code']}")
        except Exception as e:
            logger.warning(f"⚠ Error processing correction reason {row.get('code')}: {e}")
            continue
    
    try:
        db.commit()
        logger.info(f"✓ Seeded {len(CORRECTION_REASONS)} correction reasons")
    except IntegrityError as e:
        db.rollback()
        logger.warning(f"⚠ Integrity error in correction reasons: {e}")


def seed_rule_config(db):
    """Idempotently seed trip entry rule config."""
    for row in RULE_CONFIG:
        try:
            # Check if exists
            existing = db.query(TripEntryRuleConfig).filter_by(config_key=row["config_key"]).first()
            
            if existing:
                # Update existing record
                for key, value in row.items():
                    setattr(existing, key, value)
                logger.debug(f"  Updated rule config: {row['config_key']}")
            else:
                # Create new record
                db.add(TripEntryRuleConfig(**row))
                logger.debug(f"  Created rule config: {row['config_key']}")
        except Exception as e:
            logger.warning(f"⚠ Error processing rule config {row.get('config_key')}: {e}")
            continue
    
    try:
        db.commit()
        logger.info(f"✓ Seeded {len(RULE_CONFIG)} rule configs")
    except IntegrityError as e:
        db.rollback()
        logger.warning(f"⚠ Integrity error in rule config: {e}")


def run():
    """Main seed runner."""
    db = SessionLocal()
    try:
        seed_payment_channels(db)
        seed_correction_reasons(db)
        seed_rule_config(db)
        logger.info("✓ Trip master data seeding complete")
    except Exception as e:
        logger.error(f"✗ Fatal error in trip master data seeding: {e}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()