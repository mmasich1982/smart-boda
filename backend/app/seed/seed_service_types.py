# Fixed Service Type Master Seeding Script
# File: backend/app/seed/seed_service_types.py

from sqlalchemy.orm import Session
from app.models.service_type_master import ServiceTypeMaster
from datetime import datetime

def seed_service_types(db: Session):
    """
    Seed the service_type_master table with valid service types.
    FIX #8: This ensures GENERAL_SERVICE and other types exist before maintenance entries are created.
    """
    
    # Define all valid service types
    service_types = [
        {
            "code": "GENERAL_SERVICE",
            "name": "General Service",
            "description": "Regular general maintenance and service",
            "category": "routine"
        },
        {
            "code": "OIL_CHANGE",
            "name": "Oil Change",
            "description": "Engine oil and filter replacement",
            "category": "routine"
        },
        {
            "code": "BATTERY_REPLACEMENT",
            "name": "Battery Replacement",
            "description": "Battery replacement and installation",
            "category": "component_replacement"
        },
        {
            "code": "TIRE_REPLACEMENT",
            "name": "Tire Replacement",
            "description": "Tire replacement and balancing",
            "category": "component_replacement"
        },
        {
            "code": "BRAKE_SERVICE",
            "name": "Brake Service",
            "description": "Brake pad and fluid service",
            "category": "safety"
        },
        {
            "code": "ELECTRICAL_REPAIR",
            "name": "Electrical Repair",
            "description": "Electrical system repairs",
            "category": "repair"
        },
        {
            "code": "SUSPENSION_REPAIR",
            "name": "Suspension Repair",
            "description": "Suspension system repairs",
            "category": "repair"
        },
        {
            "code": "ENGINE_REPAIR",
            "name": "Engine Repair",
            "description": "Engine repairs and overhaul",
            "category": "major_repair"
        },
        {
            "code": "TRANSMISSION_REPAIR",
            "name": "Transmission Repair",
            "description": "Transmission repairs and service",
            "category": "major_repair"
        },
        {
            "code": "COOLING_SYSTEM",
            "name": "Cooling System",
            "description": "Radiator and cooling system service",
            "category": "routine"
        },
        {
            "code": "FUEL_SYSTEM",
            "name": "Fuel System",
            "description": "Fuel system cleaning and repair",
            "category": "routine"
        },
        {
            "code": "EXHAUST_SYSTEM",
            "name": "Exhaust System",
            "description": "Exhaust system repair and replacement",
            "category": "routine"
        },
        {
            "code": "WHEEL_ALIGNMENT",
            "name": "Wheel Alignment",
            "description": "Wheel alignment and balancing",
            "category": "routine"
        },
        {
            "code": "INSPECTION",
            "name": "Inspection",
            "description": "Vehicle inspection and diagnostics",
            "category": "diagnostic"
        },
        {
            "code": "OTHER",
            "name": "Other",
            "description": "Other maintenance and repairs",
            "category": "other"
        }
    ]
    
    # Check what already exists
    existing_codes = db.query(ServiceTypeMaster.code).all()
    existing_codes = {row[0] for row in existing_codes}
    
    # Add missing service types
    added = 0
    for service_type in service_types:
        if service_type["code"] not in existing_codes:
            try:
                record = ServiceTypeMaster(
                    code=service_type["code"],
                    name=service_type["name"],
                    description=service_type["description"],
                    category=service_type["category"],
                    active=True,
                    created_at=datetime.utcnow()
                )
                db.add(record)
                added += 1
                print(f"✅ Added service type: {service_type['code']}")
            except Exception as e:
                print(f"❌ Error adding {service_type['code']}: {str(e)}")
                db.rollback()
                continue
    
    # Commit all additions
    if added > 0:
        try:
            db.commit()
            print(f"\n✅ Successfully seeded {added} new service types")
        except Exception as e:
            print(f"❌ Error committing service types: {str(e)}")
            db.rollback()
            raise
    else:
        print("✅ All service types already exist")
    
    return added