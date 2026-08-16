# backend/app/seed/seed_fuel_master_data.py
from app.database import SessionLocal
from app.models.fuel_master_data import SwapPartnerMaster, ServiceTypeMaster, OilTypeMaster, FuelMaintenanceRuleConfig

SWAP_PARTNERS = [
    {"name": "Ampersand Swap Station", "standard_fee": 180, "sort_order": 1},
    {"name": "Roam Battery Swap", "standard_fee": 200, "sort_order": 2},
    {"name": "Spiro Swap Network", "standard_fee": 170, "sort_order": 3},
    {"name": "Other / Unlisted (enter cost manually)", "standard_fee": None, "sort_order": 4},
]
SERVICE_TYPES = [
    {"code": "oil_change", "display_name": "Oil Change", "icon": "🛢️", "is_dated": True, "default_interval_km": None, "sort_order": 1},
    {"code": "chain_sprocket", "display_name": "Chain & Sprocket", "icon": "⛓️", "is_dated": False, "default_interval_km": 3000, "sort_order": 2},
    {"code": "brake_pads", "display_name": "Brake Pads", "icon": "🛑", "is_dated": False, "default_interval_km": 4000, "sort_order": 3},
    {"code": "tyres", "display_name": "Tyres", "icon": "🛞", "is_dated": False, "default_interval_km": 10000, "sort_order": 4},
    {"code": "general_service", "display_name": "General Service", "icon": "🔧", "is_dated": True, "default_interval_km": None, "sort_order": 5},
    {"code": "other", "display_name": "Other", "icon": "✳️", "is_dated": False, "default_interval_km": 5000, "sort_order": 6},
]
OIL_TYPES = [
    {"code": "mineral", "display_name": "Mineral Oil", "interval_km": 3000, "sort_order": 1},
    {"code": "semi_synthetic", "display_name": "Semi-Synthetic", "interval_km": 5000, "sort_order": 2},
    {"code": "full_synthetic", "display_name": "Full Synthetic", "interval_km": 7000, "sort_order": 3},
]

def run():
    db = SessionLocal()
    for row in SWAP_PARTNERS: db.merge(SwapPartnerMaster(**row))
    for row in SERVICE_TYPES: db.merge(ServiceTypeMaster(**row))
    for row in OIL_TYPES: db.merge(OilTypeMaster(**row))
    db.merge(FuelMaintenanceRuleConfig(id=1, default_battery_range_km=60,
                                        due_alert_tier_first_km=500, due_alert_tier_firm_km=200, due_alert_tier_final_km=100))
    db.commit()
    db.close()

if __name__ == "__main__":
    run()
