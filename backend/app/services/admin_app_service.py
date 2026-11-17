# backend/app/services/admin_app_service.py
# ADMIN APP: the rules for an Administrator who uses the mobile app. Kept apart from the router so they can be tested without a server.
#   * who is "the same number": the last nine digits (0757334481, +254757334481 and 254757334481 are one person)
#   * who may use the app: an ACTIVE admin_user whose app_access_enabled is on and whose number is held by NO other Administrator
#   * the PIN: 4 digits, stored only as a bcrypt hash; 5 wrong tries lock it for 15 minutes (the same rule as the rider PIN)
#   * a small log of what happened (never the PIN)
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.admin_user import AdminUser, AdminAppLoginLog
from app.services.pin_service import hash_pin, verify_pin

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 5
LOCK_MINUTES = 15
PIN_LENGTH = 4
# Computed once: a login for a number we do not know still spends one bcrypt check, so the answer takes the same time and reveals nothing.
_DUMMY_HASH = hash_pin("0000")


def mobile_key(mobile) -> str:
    """Comparable form of a Kenyan number: its last nine digits."""
    digits = "".join(ch for ch in str(mobile or "") if ch.isdigit())
    return digits[-9:] if len(digits) >= 9 else digits


def valid_pin(pin) -> bool:
    return isinstance(pin, str) and len(pin) == PIN_LENGTH and pin.isdigit()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def find_admin_by_mobile(db: Session, mobile) -> Optional[AdminUser]:
    """The one Administrator who holds this number, or None. If TWO Administrators hold it the answer is None: the app refuses an ambiguous number."""
    key = mobile_key(mobile)
    if len(key) != 9:
        return None
    rows = (db.query(AdminUser)
            .filter(AdminUser.mobile_number.isnot(None),
                    func.right(func.regexp_replace(AdminUser.mobile_number, r"\D", "", "g"), 9) == key)
            .limit(2).all())
    return rows[0] if len(rows) == 1 else None


def may_use_app(admin: Optional[AdminUser]) -> bool:
    return bool(admin and admin.is_active and admin.app_access_enabled)


def is_locked(admin: AdminUser) -> bool:
    until = _aware(admin.app_pin_locked_until)
    return bool(until and until > now_utc())


def minutes_left(admin: AdminUser) -> int:
    until = _aware(admin.app_pin_locked_until)
    if not until:
        return 0
    return max(1, int((until - now_utc()).total_seconds() // 60) + 1)


def public_admin(admin: AdminUser) -> dict:
    """What the app is told about the signed-in Administrator."""
    return {"id": str(admin.id), "name": admin.name, "email": admin.email, "role": admin.role,
            "mobile_number": admin.mobile_number, "is_active": bool(admin.is_active)}


def log_event(db: Session, admin: Optional[AdminUser], mobile, event: str, detail: str = None) -> None:
    """Best effort: a logging problem must never stop a sign-in."""
    try:
        db.add(AdminAppLoginLog(admin_id=admin.id if admin else None, mobile_key=mobile_key(mobile) or None, event=event,
                                detail=(detail or "")[:200] or None))
        db.flush()
    except Exception as e:                       # noqa: BLE001
        logger.warning("admin app log failed: %s", e)


def lookup(db: Session, mobile) -> dict:
    """Used by Setup My Profile once the person types their number.
    Returns {"state": "found"|"already_set_up"|"unknown", "admin": AdminUser|None}.
    'unknown' is also the answer for an Administrator whose app access is OFF, so the screen never says which."""
    admin = find_admin_by_mobile(db, mobile)
    if not may_use_app(admin):
        return {"state": "unknown", "admin": None}
    if admin.app_pin_hash:
        return {"state": "already_set_up", "admin": admin}
    return {"state": "found", "admin": admin}


def lookup_payload(admin: AdminUser, normalized: str) -> dict:
    """Same shape as the rider / business answer of GET /onboarding/profile-lookup, so Setup My Profile treats the name the same way."""
    return {"found": True, "full_name": admin.name, "mobile_number": normalized, "source": "admin", "user_type": "admin",
            "role": admin.role, "business_name": None, "business_type_code": None, "business_type_name": None}


def record_consent(db: Session, admin: AdminUser, version: Optional[str]) -> None:
    admin.app_consent_at = now_utc()
    admin.app_consent_version = (version or "")[:40] or None
    log_event(db, admin, admin.mobile_number, "setup")


def create_pin(db: Session, admin: AdminUser, pin: str) -> None:
    admin.app_pin_hash = hash_pin(pin)
    admin.app_pin_set_at = now_utc()
    admin.app_registered_at = admin.app_registered_at or admin.app_pin_set_at
    admin.app_pin_failed_attempts = 0
    admin.app_pin_locked_until = None
    log_event(db, admin, admin.mobile_number, "pin_created")


def check_login(db: Session, mobile, pin) -> dict:
    """Server-side PIN check. Never raises for a wrong answer.
       {"ok": True, "admin": AdminUser}
       {"ok": False, "error": "incorrect", "attempts_left": n}   (attempts_left only for a real, enabled account)
       {"ok": False, "error": "locked", "minutes": n}
       {"ok": False, "error": "disabled"}                        (only after a CORRECT PIN, so it reveals nothing to a guesser)"""
    admin = find_admin_by_mobile(db, mobile)
    usable = bool(admin and admin.app_access_enabled and admin.app_pin_hash)
    if not usable:
        verify_pin(str(pin or "0"), _DUMMY_HASH)           # same cost as a real check
        log_event(db, admin, mobile, "login_wrong_pin", "unknown number, no PIN yet, or app access off")
        return {"ok": False, "error": "incorrect"}
    if is_locked(admin):
        log_event(db, admin, mobile, "login_locked")
        return {"ok": False, "error": "locked", "minutes": minutes_left(admin)}
    if not valid_pin(pin) or not verify_pin(pin, admin.app_pin_hash):
        admin.app_pin_failed_attempts = (admin.app_pin_failed_attempts or 0) + 1
        left = MAX_ATTEMPTS - admin.app_pin_failed_attempts
        if left <= 0:
            admin.app_pin_locked_until = now_utc() + timedelta(minutes=LOCK_MINUTES)
            admin.app_pin_failed_attempts = 0
            log_event(db, admin, mobile, "login_locked", "5 wrong PINs")
            return {"ok": False, "error": "locked", "minutes": LOCK_MINUTES}
        log_event(db, admin, mobile, "login_wrong_pin")
        return {"ok": False, "error": "incorrect", "attempts_left": left}
    if not admin.is_active:
        return {"ok": False, "error": "disabled"}
    admin.app_pin_failed_attempts = 0
    admin.app_pin_locked_until = None
    log_event(db, admin, mobile, "login_ok")
    return {"ok": True, "admin": admin}


def reset_pin(db: Session, admin: AdminUser, by: AdminUser) -> None:
    """A Super Admin clears an Administrator's app PIN (forgotten PIN). The person sets a new one in the app (Setup My Profile > PIN)."""
    admin.app_pin_hash = None
    admin.app_pin_set_at = None
    admin.app_registered_at = None
    admin.app_pin_failed_attempts = 0
    admin.app_pin_locked_until = None
    log_event(db, admin, admin.mobile_number, "pin_reset", f"by {by.email}")


def set_access(db: Session, admin: AdminUser, enabled: bool, by: AdminUser) -> None:
    admin.app_access_enabled = bool(enabled)
    log_event(db, admin, admin.mobile_number, "access_on" if enabled else "access_off", f"by {by.email}")
