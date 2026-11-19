# backend/app/routers/auth_login.py
# SMART APPS: the Login screen is the first screen. It asks for the MOBILE NUMBER and the PIN.
#
#   POST /auth/login     mobile number + PIN (+ this phone's device id) -> token for ONE active session, or why not
#   POST /auth/logout    ends this phone's session (best effort; the phone also forgets its token)
#   GET  /auth/session   is my session still the active one?  (401 with a code when it was replaced or ended)
#
# ONE ACTIVE SESSION PER USER: a login on another phone replaces the first phone's session, but only after the person confirms
# (takeover=true): the first answer for a person who is signed in elsewhere is {"ok": false, "error": "active_elsewhere", ...}.
# The phone that was replaced gets 401 {"code": "session_replaced"} on its next request.
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header
from jose import jwt, JWTError
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import SECRET_KEY, ALGORITHM, ADMIN_APP_TOKEN_TYPE, create_rider_token, create_admin_app_token
from app.database import get_db
from app.services import admin_app_service, login_service, session_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth-login"])


class LoginIn(BaseModel):
    mobile_number: str = Field(min_length=1, max_length=20)
    pin: str = Field(min_length=1, max_length=8)
    device_id: str = Field(min_length=4, max_length=64)
    device_label: Optional[str] = Field(default=None, max_length=120)
    takeover: bool = False


def _elsewhere(other) -> dict:
    return {"ok": False, "error": "active_elsewhere", **session_service.describe_other(other)}


@router.post("/login")
def login(p: LoginIn, db: Session = Depends(get_db)):
    """HTTP 200 for every answer (like /onboarding/pin/login): read `ok` and `error`."""
    rider = login_service.find_rider_by_mobile(db, p.mobile_number)
    if rider is not None:
        res = login_service.check_rider_pin(db, rider, p.pin)
        if not res["ok"]:
            db.commit()                                         # keeps the attempt counter and the lock
            return res
        started = session_service.start_session(db, "rider", rider.id, p.device_id, p.device_label, p.takeover)
        db.commit()
        if not started["ok"]:
            return _elsewhere(started["other"])
        s = started["session"]
        return {"ok": True, "token": create_rider_token(str(rider.id), rider.mobile_number, s.id), "user_type": login_service.user_type_of(db, rider),
                "rider_id": str(rider.id), "mobile_number": rider.mobile_number, "profile": login_service.profile_of(db, rider), "replaced_other": started["replaced"],
                "businesses": login_service.business_profiles_of(db, rider)}      # SMART BIZNA FIX: a business user's role and tile permissions arrive with the login

    admin = admin_app_service.find_admin_by_mobile(db, p.mobile_number)          # an Administrator may sign in here too
    if admin is not None and admin.app_access_enabled and admin.app_pin_hash:
        res = admin_app_service.check_login(db, p.mobile_number, p.pin)
        if not res["ok"]:
            db.commit()
            return res
        admin = res["admin"]
        started = session_service.start_session(db, "admin", admin.id, p.device_id, p.device_label, p.takeover)
        db.commit()
        if not started["ok"]:
            return _elsewhere(started["other"])
        return {"ok": True, "token": create_admin_app_token(admin, started["session"].id), "user_type": "admin", "admin": admin_app_service.public_admin(admin),
                "replaced_other": started["replaced"]}

    login_service.waste_a_check(p.pin)
    return {"ok": False, "error": "incorrect"}


def _payload(authorization: Optional[str], verify_exp: bool = True) -> Optional[dict]:
    scheme, _, value = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None
    try:
        return jwt.decode(value.strip(), SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": verify_exp})
    except JWTError:
        return None


@router.post("/logout")
def logout(authorization: str = Header(None), db: Session = Depends(get_db)):
    """Always answers ok. An expired token may still log out (that is all it is good for)."""
    p = _payload(authorization, verify_exp=False)
    if p and p.get("sid"):
        s = session_service.lookup_session(db, p["sid"])
        if s is not None and str(s.user_id) == str(p.get("sub")):
            session_service.revoke(db, s, "logout")
            db.commit()
    return {"ok": True}


@router.get("/session")
def session_status(authorization: str = Header(None), db: Session = Depends(get_db)):
    from fastapi import HTTPException
    p = _payload(authorization)
    if not p:
        raise HTTPException(401, detail={"code": "session_ended", "message": session_service.REASON_TEXT["session_ended"]})
    kind = "admin" if p.get("typ") == ADMIN_APP_TOKEN_TYPE else "rider"
    s = session_service.guard_payload(db, p, kind)
    return {"active": True, "user_kind": kind, "legacy_token": not p.get("sid"), "device_label": s.device_label if s else None}
