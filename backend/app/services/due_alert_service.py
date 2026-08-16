# backend/app/services/due_alert_service.py
from sqlalchemy.orm import Session
from app.models.maintenance_entry import MaintenanceEntry
from app.models.fuel_master_data import ServiceTypeMaster
from app.models.bike_profile import BikeProfile

# Mirrors cleaned.html's allDueAlerts(): one row per active service type, each with its own remaining-km figure.
def all_due_alerts(db: Session, rider_id: str) -> list[dict]:
    bike = db.query(BikeProfile).filter_by(rider_id=rider_id).first()
    current_odo = bike.current_odometer_km or 0
    alerts = []
    for svc in db.query(ServiceTypeMaster).filter_by(is_active=True).order_by(ServiceTypeMaster.sort_order):
        last = (db.query(MaintenanceEntry)
            .filter_by(rider_id=rider_id, service_type_code=svc.code)
            .order_by(MaintenanceEntry.submitted_at.desc()).first())
        if not last:
            continue  # EXC-SB12-004: no alert until a first service of that type is logged
        if svc.is_dated:
            if not last.next_service_odometer:
                continue
            remaining = last.next_service_odometer - current_odo  # BR-SB12-005
        else:
            if not last.odometer_reading:
                continue
            remaining = (last.odometer_reading + svc.default_interval_km) - current_odo  # BR-SB12-007
        alerts.append({"service_type": svc.display_name, "icon": svc.icon, "remaining_km": remaining})
    return alerts
