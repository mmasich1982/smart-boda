# backend/app/seed/seed_trip_master_data.py
from app.database import SessionLocal
from app.models.trip_master_data import PaymentChannelMaster, CorrectionReasonMaster, TripEntryRuleConfig
from sqlalchemy.exc import IntegrityError

PAYMENT_CHANNELS = [
    {"code": "Cash", "display_name": "Cash", "emoji": "💵", "sort_order": 1},
    # CONSOLIDATED: Send Money, Till Number, Paybill, and Pochi la Biashara are now a single
    # "M-Pesa" option on the New Trip screen -- riders no longer choose between them there.
    {"code": "MPesa", "display_name": "M-Pesa", "emoji": "📲", "sort_order": 2},
    # ADDED: "Lipa Later" -- selecting this redirects to a separate screen to capture the
    # customer's name, mobile number, amount, and due date (see LipaLaterEntryScreen.js).
    {"code": "LipaLater", "display_name": "Lipa Later", "emoji": "🕒", "sort_order": 3},
    # Old individual mobile-money codes: kept (not deleted) so historic trips that already
    # reference them via payment_channel_code stay valid, but deactivated so they no longer
    # appear as selectable options on the New Trip screen (GET /trips/payment-channels
    # already filters is_active=True).
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

def seed_idempotent(db, model_class, data_list, unique_key):
    """
    Idempotent seeding function that checks if records exist before inserting.
    
    Args:
        db: SQLAlchemy session
        model_class: The ORM model class
        data_list: List of dictionaries with record data
        unique_key: The unique identifier field name (e.g., 'code')
    """
    for row in data_list:
        # Check if record already exists using the unique key
        existing = db.query(model_class).filter(
            getattr(model_class, unique_key) == row[unique_key]
        ).first()
        
        if existing:
            # Record exists, update it if needed
            for key, value in row.items():
                setattr(existing, key, value)
        else:
            # Record doesn't exist, create new one
            db.add(model_class(**row))
    
    db.commit()

def run():
    db = SessionLocal()
    try:
        # Seed payment channels (use merge which handles updates)
        for row in PAYMENT_CHANNELS: 
            db.merge(PaymentChannelMaster(**row))
        
        # Seed correction reasons with idempotent logic
        seed_idempotent(db, CorrectionReasonMaster, CORRECTION_REASONS, 'code')
        
        # Seed rule config with idempotent logic
        seed_idempotent(db, TripEntryRuleConfig, RULE_CONFIG, 'config_key')
        
        db.commit()
    except IntegrityError as e:
        db.rollback()
        print(f"Integrity error during seeding (likely duplicate data): {e}")
        # Continue without failing - data may already be seeded
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run()