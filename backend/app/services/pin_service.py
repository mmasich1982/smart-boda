# backend/app/services/pin_service.py
import bcrypt
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.rider import Rider

MAX_PIN_ATTEMPTS = 5
PIN_LOCK_MINUTES = 15

# BR-SB04-012: only a bcrypt hash is ever persisted — never the plain PIN.
def hash_pin(pin: str) -> str:
    """Hash a PIN using bcrypt."""
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()

# AUDIT FIX (blocking, found during startup sanity check): sb22_settings.py imports a bare
# `verify_pin(pin, pin_hash)` helper -- distinct from verify_pin_login's rider-lookup version
# below -- that never existed anywhere in this module.
def verify_pin(pin: str, pin_hash: str) -> bool:
    """Verify a plain PIN against its bcrypt hash."""
    return bcrypt.checkpw(pin.encode(), pin_hash.encode())

def create_pin(db: Session, rider_id: str, pin: str, pin_confirm: str):
    """
    Create a new PIN for a rider during onboarding.
    
    Args:
        db: Database session
        rider_id: UUID of the rider
        pin: The PIN to create (4-6 digits)
        pin_confirm: Confirmation of the PIN (must match)
    
    Returns:
        Dictionary with status: {"ok": True} or {"ok": False, "error": "mismatch"}
    """
    if pin != pin_confirm:
        return {"ok": False, "error": "mismatch"}  # EXC-SB04-001
    
    rider = db.query(Rider).get(rider_id)
    rider.pin_hash = hash_pin(pin)
    rider.pin_attempts_left = MAX_PIN_ATTEMPTS
    rider.registration_status = "active"  # onboarding is now fully complete
    db.commit()
    
    return {"ok": True}

def verify_pin_login(db: Session, rider_id: str, pin: str):
    """
    Verify a rider's PIN during login and generate authentication token.
    
    Flow:
    1. Check if account is locked due to too many failed attempts
    2. Verify PIN against stored hash
    3. On success: Reset attempts counter and generate JWT token
    4. On failure: Decrement attempts, lock account if limit reached
    
    Args:
        db: Database session
        rider_id: UUID of the rider
        pin: The PIN entered by the rider
    
    Returns:
        On success:
            {
                "ok": True,
                "token": "<JWT_token>",
                "rider_id": "<uuid>",
                "mobile_number": "<number>"
            }
        On account locked:
            {"ok": False, "error": "locked"}  # EXC-SB04-003
        On incorrect PIN:
            {
                "ok": False,
                "error": "incorrect",
                "attempts_left": <int>
            }  # EXC-SB04-002
    """
    from app.auth import create_rider_token  # Import here to avoid circular dependency
    
    rider = db.query(Rider).get(rider_id)
    
    # Check if account is locked
    if rider.pin_locked_until and datetime.now(timezone.utc) < rider.pin_locked_until:
        return {"ok": False, "error": "locked"}  # EXC-SB04-003
    
    # Verify PIN
    if not bcrypt.checkpw(pin.encode(), rider.pin_hash.encode()):
        # PIN is incorrect - decrement attempts
        rider.pin_attempts_left -= 1
        
        # Lock account if max attempts exceeded
        if rider.pin_attempts_left <= 0:
            rider.pin_locked_until = datetime.now(timezone.utc) + timedelta(minutes=PIN_LOCK_MINUTES)
        
        db.commit()
        return {
            "ok": False,
            "error": "incorrect",
            "attempts_left": rider.pin_attempts_left
        }  # EXC-SB04-002
    
    # ✅ PIN is correct - reset attempts and generate token
    rider.pin_attempts_left = MAX_PIN_ATTEMPTS  # reset on success
    rider.pin_locked_until = None  # clear any lock
    db.commit()
    
    # Generate JWT token for authenticated rider
    token = create_rider_token(str(rider.id), rider.mobile_number)
    
    return {
        "ok": True,
        "token": token,
        "rider_id": str(rider.id),
        "mobile_number": rider.mobile_number
    }  # BR-SB04-006: return token for subsequent API calls

def reset_pin_via_recovery(db: Session, rider_id: str, new_pin: str, new_pin_confirm: str):
    """
    Reset a rider's PIN after recovery approval.
    
    BR-SB04-009: Successful recovery overwrites the old PIN entirely.
    
    Args:
        db: Database session
        rider_id: UUID of the rider
        new_pin: The new PIN (4-6 digits)
        new_pin_confirm: Confirmation of the new PIN (must match)
    
    Returns:
        Dictionary with status: {"ok": True} or {"ok": False, "error": "mismatch"}
    """
    if new_pin != new_pin_confirm:
        return {"ok": False, "error": "mismatch"}  # EXC-SB04-006
    
    rider = db.query(Rider).get(rider_id)
    rider.pin_hash = hash_pin(new_pin)  # EXC-SB04-008: reuse of the old PIN is explicitly allowed in MVP0
    rider.pin_attempts_left = MAX_PIN_ATTEMPTS
    rider.pin_locked_until = None
    db.commit()
    
    return {"ok": True}