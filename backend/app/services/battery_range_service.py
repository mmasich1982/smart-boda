# backend/app/services/battery_range_service.py
from sqlalchemy.orm import Session
from app.models.fuel_entry import FuelEntry
from app.models.bike_profile import BikeProfile
from app.models.fuel_master_data import FuelMaintenanceRuleConfig

# Mirrors cleaned.html's batteryRangeRemainingKm(): projected from the odometer reading logged
# at the LAST charge/swap entry plus the bike's expected full-charge range, minus the current reading.
def battery_range_remaining_km(db: Session, rider_id: str) -> float | None:
    bike = db.query(BikeProfile).filter_by(rider_id=rider_id).first()
    # BUG FIX (found during full-codebase sweep): BikeProfile's real column is
    # `fuel_type_code`, not `fuel_type` -- the same bug already fixed once in
    # sb22_settings.py, but a second, independent instance survived here.
    if not bike or bike.fuel_type_code != "electric":
        return None
    last_charge = (db.query(FuelEntry)
        .filter(FuelEntry.rider_id == rider_id, FuelEntry.mode.in_(["swap", "charging"]), FuelEntry.odometer_reading.isnot(None))
        .order_by(FuelEntry.submitted_at.desc()).first())
    if not last_charge:
        return None  # EXC-SB10-007: no estimate until a first charge/swap exists
    config = db.query(FuelMaintenanceRuleConfig).get(1)
    full_range = bike.battery_range_km or config.default_battery_range_km
    return (last_charge.odometer_reading + full_range) - (bike.current_odometer_km or 0)
