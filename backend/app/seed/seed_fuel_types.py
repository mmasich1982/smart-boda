# backend/app/seed/seed_fuel_types.py
from app.database import SessionLocal
from app.models.master_data import FuelTypeMaster

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
    for fuel_type in FUEL_TYPES:
        db.merge(FuelTypeMaster(**fuel_type))
    db.commit()
    db.close()

if __name__ == "__main__":
    run()