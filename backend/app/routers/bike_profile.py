# backend/app/routers/bike_profile.py
# The rider's FUEL SETUP. There is no number plate anywhere: a rider is identified by mobile number.
# The fuel type decides whether Home shows "Fuel Motorcycle" or "Charge Battery" (unchanged business logic).
# The rider record itself is created by routers/setup_profile.py (Setup My Profile); the app then queues this fuel profile
# through its SyncQueue (type "bike_profile"), so it is safe to receive it more than once.
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import logging

from app.database import get_db
from app.models.bike_profile import BikeProfile
from app.models.master_data import FuelTypeMaster
from app.models.rider import Rider
from app.schemas.onboarding import BikeProfileRequest
from app.services.group_member_link_service import link_members_for_rider

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/onboarding", tags=["Rider Profile"])


@router.get("/fuel-types")
def get_fuel_types(db: Session = Depends(get_db)):
    """GET /onboarding/fuel-types -> [{code, display_name, description, sort_order}]"""
    fuel_types = db.query(FuelTypeMaster).filter_by(is_active=True).order_by(FuelTypeMaster.sort_order).all()
    return [{"code": ft.code, "display_name": ft.display_name,
             "description": getattr(ft, "description", f"Fuel type: {ft.display_name}"), "sort_order": ft.sort_order}
            for ft in fuel_types]


def _fuel_or_422(db, code):
    ft = db.query(FuelTypeMaster).filter_by(code=code, is_active=True).first()
    if not ft:
        raise HTTPException(422, f"Invalid fuel type: {code}. Please select from the available options.")
    return ft


@router.post("/bike-profile")
def submit_bike_profile(payload: BikeProfileRequest, rider_id: str = Query(..., description="Rider UUID"),
                        db: Session = Depends(get_db)):
    """POST /onboarding/bike-profile?rider_id=UUID  { device_id, fuel_type_code }
    Saves the rider's fuel type. Idempotent: a second call with the same rider just updates the fuel type, so the app's
    SyncQueue can safely retry it."""
    rider = db.get(Rider, rider_id)
    if not rider:
        raise HTTPException(404, "Rider not found. Please complete Setup My Profile first.")
    _fuel_or_422(db, payload.fuel_type_code)
    try:
        bp = db.query(BikeProfile).filter_by(rider_id=rider_id, is_active=True).first()
        if bp:
            bp.fuel_type_code, bp.sync_status = payload.fuel_type_code, "synced"
        else:
            bp = BikeProfile(rider_id=rider_id, fuel_type_code=payload.fuel_type_code,
                             submitted_at=datetime.now(timezone.utc).replace(tzinfo=None), sync_status="synced", is_active=True)
            db.add(bp)
        link_members_for_rider(db, rider)                 # silent: group memberships registered with this mobile number
        db.commit(); db.refresh(bp)
        return {"bike_profile_id": str(bp.id), "status": "success", "fuel_type": bp.fuel_type_code, "sync_status": bp.sync_status}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error saving fuel profile for rider {rider_id}: {e}")
        raise HTTPException(500, "Failed to save your profile. Please try again or contact support.")


@router.get("/bike-profile/{rider_id}")
def get_bike_profile(rider_id: str, db: Session = Depends(get_db)):
    """GET /onboarding/bike-profile/UUID -> the rider's fuel setup (404 when there is none)."""
    bp = db.query(BikeProfile).filter_by(rider_id=rider_id, is_active=True).first()
    if not bp:
        raise HTTPException(404, "No profile found for this rider. Please complete Setup My Profile.")
    ft = db.get(FuelTypeMaster, bp.fuel_type_code)
    return {"bike_profile_id": str(bp.id), "fuel_type": bp.fuel_type_code,
            "fuel_type_display": ft.display_name if ft else bp.fuel_type_code,
            "submitted_at": bp.submitted_at.isoformat() if bp.submitted_at else None, "is_active": bp.is_active,
            "current_odometer_km": bp.current_odometer_km or 0, "battery_range_km": bp.battery_range_km}


@router.put("/bike-profile/{rider_id}")
def update_bike_profile(rider_id: str, payload: BikeProfileRequest, db: Session = Depends(get_db)):
    """PUT /onboarding/bike-profile/UUID  { device_id, fuel_type_code } -> change the fuel type."""
    bp = db.query(BikeProfile).filter_by(rider_id=rider_id, is_active=True).first()
    if not bp:
        raise HTTPException(404, "No profile found for this rider.")
    _fuel_or_422(db, payload.fuel_type_code)
    bp.fuel_type_code = payload.fuel_type_code
    db.commit()
    return {"bike_profile_id": str(bp.id), "status": "success", "fuel_type": bp.fuel_type_code}
