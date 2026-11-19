# backend/app/services/login_service.py
# SMART APPS: sign in with MOBILE NUMBER + PIN (the new Login screen), on this phone or on a new one.
# Who a number belongs to: a rider or business user (a row of `rider`), else an Administrator allowed to use the app (admin_user).
# The PIN rules are the ones the rider PIN already has (5 wrong tries lock it for 15 minutes); the one-active-session rule is session_service.
import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.rider import Rider
from app.models.bike_profile import BikeProfile
from app.models.business import BusinessUser
from app.services.admin_app_service import mobile_key
from app.services.pin_service import MAX_PIN_ATTEMPTS, PIN_LOCK_MINUTES, hash_pin
from app.services.vehicle_words import vehicle_type_for

# One bcrypt check is spent even for a number we do not know, so the answer takes the same time and reveals nothing.
_DUMMY_HASH = hash_pin("0000")


def find_rider_by_mobile(db: Session, mobile) -> Optional[Rider]:
    """The one rider/business user who holds this number (matched on its last nine digits), or None."""
    key = mobile_key(mobile)
    if len(key) != 9:
        return None
    rows = (db.query(Rider)
            .filter(func.right(func.regexp_replace(Rider.mobile_number, r"\D", "", "g"), 9) == key)
            .limit(2).all())
    return rows[0] if len(rows) == 1 else None


def waste_a_check(pin) -> None:
    bcrypt.checkpw(str(pin or "0").encode(), _DUMMY_HASH.encode())


def minutes_left(rider: Rider) -> int:
    until = rider.pin_locked_until
    if not until:
        return 0
    until = until if until.tzinfo else until.replace(tzinfo=timezone.utc)
    return max(1, int((until - datetime.now(timezone.utc)).total_seconds() // 60) + 1)


def check_rider_pin(db: Session, rider: Rider, pin) -> dict:
    """{'ok': True} | {'ok': False, 'error': 'incorrect', 'attempts_left': n} | {'ok': False, 'error': 'locked', 'minutes': n}.
    A person who has no PIN yet (still onboarding) just gets 'incorrect'."""
    if not rider.pin_hash:
        waste_a_check(pin)
        return {"ok": False, "error": "incorrect"}
    now = datetime.now(timezone.utc)
    if rider.pin_locked_until:
        until = rider.pin_locked_until if rider.pin_locked_until.tzinfo else rider.pin_locked_until.replace(tzinfo=timezone.utc)
        if now < until:
            return {"ok": False, "error": "locked", "minutes": minutes_left(rider)}
    good = isinstance(pin, str) and len(pin) == 4 and pin.isdigit() and bcrypt.checkpw(pin.encode(), rider.pin_hash.encode())
    if not good:
        left = (rider.pin_attempts_left if rider.pin_attempts_left is not None else MAX_PIN_ATTEMPTS) - 1
        rider.pin_attempts_left = left
        if left <= 0:
            rider.pin_locked_until = now + timedelta(minutes=PIN_LOCK_MINUTES)
            rider.pin_attempts_left = MAX_PIN_ATTEMPTS
            return {"ok": False, "error": "locked", "minutes": PIN_LOCK_MINUTES}
        return {"ok": False, "error": "incorrect", "attempts_left": left}
    rider.pin_attempts_left = MAX_PIN_ATTEMPTS
    rider.pin_locked_until = None
    return {"ok": True}


def user_type_of(db: Session, rider: Rider) -> str:
    """'business' when this rider row is a Smart Bizna user (a business_user points at it); 'chama' for a Smart Chama member (SMART CHAMA); else 'rider'."""
    if db.query(BusinessUser.id).filter(BusinessUser.rider_id == rider.id).first():
        return "business"
    return "chama" if getattr(rider, "chama_only", False) else "rider"


def _vehicle_for(db: Session, rider: Rider) -> str:
    """SMART BIZNA FIX: the vehicle type to report: 'n/a' for a business user or a Smart Chama member, whatever an older row still holds."""
    ut = user_type_of(db, rider)
    return vehicle_type_for(rider.vehicle_type, ut == "business", ut == "chama")


def profile_of(db: Session, rider: Rider) -> dict:
    """Just enough to open the app on a new phone; the records themselves come from the restore step."""
    bike = db.query(BikeProfile).filter(BikeProfile.rider_id == rider.id).order_by(BikeProfile.submitted_at.desc()).first()
    return {"full_name": rider.full_name, "language_code": rider.language_code, "registration_status": rider.registration_status,
            "fuel_type_code": bike.fuel_type_code if bike else None, "mobile_number": rider.mobile_number, "chama_only": bool(getattr(rider, "chama_only", False)),
            "vehicle_type": _vehicle_for(db, rider)}      # SMART CABZ: Smart Boda or Smart Cabz; SMART BIZNA FIX: a business user and a Smart Chama member are n/a, whatever the column holds


def business_profiles_of(db: Session, rider: Rider) -> list:
    """SMART BIZNA FIX: every business this login holds, each with the person's role and their two tile permissions (exactly what GET /business/my-businesses
    answers). Sent with setup, login and session renewal so the phone opens the RIGHT Smart Bizna screen at once instead of guessing until its first sync."""
    from app.routers import business_ops as bo          # imported here: business_ops is a router module
    try:
        return [bo._profile(db, bo.Ctx(bu, biz)) for bu, biz in bo._memberships(db, rider)]
    except Exception:                                  # never block a login for this: the phone still gets the list at its first sync
        db.rollback()
        return []
