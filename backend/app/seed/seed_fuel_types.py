# backend/app/seed/seed_fuel_types.py
from app.database import SessionLocal
from app.models.master_data import FuelTypeMaster
from sqlalchemy.exc import IntegrityError
import logging

logger = logging.getLogger(__name__)

# BR-SB02-006 / Issue 6 fix: Petrol and Electric are the MVP0 fuel types.
# Both marked as is_default=True to indicate they are permanent/read-only options.
# Future MVP1 expansions simply add new rows with is_default=False.
FUEL_TYPES = [
    {
        "code": "petrol",
        "display_name": "Petrol",
        "is_active": True,
        "is_default": True,  # Mandatory MVP0 option
        "sort_order": 1,
    },
    {
        "code": "electric",
        "display_name": "Electric",
        "is_active": True,
        "is_default": True,  # Mandatory MVP0 option
        "sort_order": 2,
    },
]

def run():
    db = SessionLocal()
    try:
        for fuel_type in FUEL_TYPES:
            # ✅ FIXED: Check if exists first to handle duplicates gracefully
            existing = db.query(FuelTypeMaster).filter_by(code=fuel_type["code"]).first()
            
            if existing:
                # Update existing record
                for key, value in fuel_type.items():
                    setattr(existing, key, value)
                logger.debug(f"  Updated fuel type: {fuel_type['code']}")
            else:
                # Create new record
                db.add(FuelTypeMaster(**fuel_type))
                logger.debug(f"  Created fuel type: {fuel_type['code']}")
        
        db.commit()
        logger.info(f"✓ Seeded {len(FUEL_TYPES)} fuel types")
    except IntegrityError as e:
        db.rollback()
        logger.warning(f"⚠ Integrity error in fuel types: {e}")
    except Exception as e:
        db.rollback()
        logger.error(f"✗ Fatal error in fuel type seeding: {e}", exc_info=True)
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run()