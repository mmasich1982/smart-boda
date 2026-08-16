# backend/app/routers/sb22_settings.py
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.rider import Rider
from app.models.bike_profile import BikeProfile
from app.services.pin_service import verify_pin, hash_pin  # reused from Module A


# AUDIT FIX: this file referenced a bare now_utc() that was never imported or defined anywhere.
def now_utc():
    return datetime.now(timezone.utc)

router = APIRouter(prefix="/settings", tags=["sb-22"])

# BR-SB22-001/002: same E.164-ish validation Module A's Number screen already uses — reused, not reimplemented
@router.patch("/mobile-number")
def change_mobile_number(rider_id: str = Query(...), new_number: str = Query(...), db: Session = Depends(get_db)):
    rider = db.query(Rider).get(rider_id)
    if not rider:
        raise HTTPException(404, "Rider not found")
    if new_number == rider.mobile_number:
        raise HTTPException(422, "That's already your current number. Enter a new number to change it.")  # EXC-SB22-002
    rider.mobile_number = new_number
    db.commit()
    return {"mobile_number": rider.mobile_number}

# BR-SB22-003: current PIN must verify before a new one is accepted — same 5-attempt lockout as Login PIN
@router.post("/verify-current-pin")
def verify_current_pin(rider_id: str = Query(...), pin: str = Query(...), db: Session = Depends(get_db)):
    rider = db.query(Rider).get(rider_id)
    if not rider:
        raise HTTPException(404, "Rider not found")
    if rider.pin_locked_until and rider.pin_locked_until > now_utc():
        raise HTTPException(423, "Too many attempts. Try again later.")  # EXC-SB22-005
    if not verify_pin(pin, rider.pin_hash):
        rider.pin_attempts_left -= 1
        if rider.pin_attempts_left <= 0:
            rider.pin_locked_until = now_utc() + timedelta(minutes=15)
        db.commit()
        raise HTTPException(401, f"Incorrect PIN. {rider.pin_attempts_left} attempt(s) remaining.")
    rider.pin_attempts_left = 5
    db.commit()
    return {"verified": True}

@router.patch("/pin")
def change_pin(rider_id: str = Query(...), new_pin: str = Query(...), db: Session = Depends(get_db)):
    rider = db.query(Rider).get(rider_id)
    if not rider:
        raise HTTPException(404, "Rider not found")
    rider.pin_hash = hash_pin(new_pin)
    db.commit()
    return {"ok": True}

@router.patch("/language")
def change_language(rider_id: str = Query(...), language_code: str = Query(...), db: Session = Depends(get_db)):
    # BUG FIX: Rider's real column is `language_code` (see app/models/rider.py) -- this
    # assigned a `language` attribute that doesn't exist on the model at all.
    rider = db.query(Rider).get(rider_id)
    if not rider:
        raise HTTPException(404, "Rider not found")
    rider.language_code = language_code  # BR-SB22-006: takes effect immediately, every t() call re-resolves
    db.commit()
    return {"language": rider.language_code}

@router.patch("/bike/{bike_id}/fuel-type")
def change_fuel_type(bike_id: str, new_fuel_type: str = Query(...), db: Session = Depends(get_db)):
    # BUG FIX: BikeProfile's real column is `fuel_type_code` (see app/models/bike_profile.py).
    bike = db.query(BikeProfile).get(bike_id)
    if not bike:
        raise HTTPException(404, "Bike not found")
    if new_fuel_type not in ("petrol", "electric"):
        raise HTTPException(422, "Invalid fuel type.")
    bike.fuel_type_code = new_fuel_type  # BR-SB22-007: this is the SAME field FuelHubScreen (Module C) branches on
    db.commit()
    return {"fuel_type": bike.fuel_type_code}