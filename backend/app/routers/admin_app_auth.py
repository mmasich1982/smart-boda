# backend/app/routers/admin_app_auth.py
# ADMIN APP: lets an Administrator use the Smart Boda mobile app as well as the console.
#
#   POST /admin/app/setup-profile        Setup My Profile (number found -> name shown -> accept terms)       no token yet
#   POST /admin/app/pin/create           Create and confirm the app PIN; signs the person in                 no token yet
#   POST /admin/app/login                Mobile number = user name, PIN = password                           no token yet
#   POST /admin/app/session/refresh      swap a still-valid token for a fresh one                            Bearer
#   GET  /admin/app/me                   who am I                                                            Bearer
#   POST /admin/app/logout               logs the sign-out (the phone forgets the token)                     Bearer
#   GET  /admin/app/dashboard            ONE call for the app Dashboard (riders, groups, businesses, queues) Bearer or console cookie
#   GET  /admin/app/access               console: who may use the app                                        Super Admin
#   PATCH /admin/app/access/{id}         console: switch app access on / off                                 Super Admin
#   POST /admin/app/access/{id}/reset-pin  console: clear a forgotten app PIN                                Super Admin
#
# The lookup that shows the person's name is GET /onboarding/profile-lookup/{mobile} (setup_profile.py), which now also recognises an Administrator.
# Every OTHER admin screen of the app calls the existing /admin/... routes (riders, individual riders, groups, businesses, business types, statements):
# the Bearer token this router issues is accepted by get_current_admin, so the roles and guards are exactly the console's, and app and console share the same tables.
import logging
from typing import Optional
from uuid import UUID as RowId

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import create_admin_app_token, get_current_admin, require_admin, require_super_admin
from app.database import get_db
from app.models.admin_user import AdminUser, AdminAppLoginLog
from app.models.boda_group import BodaGroup, GroupSlotRequest
from app.models.business import Business, ACTIVATED, INACTIVE, PENDING_SETUP
from app.models.business_ops import BusinessStatementRequest, REQUESTED
from app.models.individual_rider import IndividualRiderPreRegistration
from app.models.rider import Rider
from app.routers.mobile_number import validate_mobile_number
from app.services import admin_app_service as svc
from app.services import session_service           # SMART APPS: one active session per user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin/app", tags=["admin-app"])

NOT_FOUND = "We could not find this mobile number. Ask your Admin or your Group Treasurer to register you, then try again."
ALREADY = "This mobile number is already set up. Please log in with your PIN."


class SetupIn(BaseModel):
    mobile_number: str
    consent_accepted: bool = False
    consent_content_version: Optional[str] = None
    language_code: Optional[str] = None


class PinCreateIn(BaseModel):
    admin_id: RowId
    mobile_number: str
    pin: str = Field(min_length=4, max_length=4)
    pin_confirm: str = Field(min_length=4, max_length=4)
    device_id: Optional[str] = None         # SMART APPS: this phone


class LoginIn(BaseModel):
    mobile_number: str = Field(min_length=1, max_length=20)
    pin: str = Field(min_length=1, max_length=8)


class AccessIn(BaseModel):
    enabled: bool


def _clean(mobile: str) -> str:
    ok, normalized, err = validate_mobile_number(mobile)
    if not ok:
        raise HTTPException(400, err or "Enter a valid Kenyan mobile number.")
    return normalized


def _pending_admin(db: Session, normalized: str) -> AdminUser:
    """The Administrator who may still be setting up: found, allowed, PIN not set. Same wording as the rider screens."""
    r = svc.lookup(db, normalized)
    if r["state"] == "unknown":
        raise HTTPException(404, NOT_FOUND)
    if r["state"] == "already_set_up":
        raise HTTPException(409, ALREADY)
    return r["admin"]


# ------------------------------------------------------------------ onboarding
@router.post("/setup-profile")
def setup_profile(payload: SetupIn, db: Session = Depends(get_db)):
    normalized = _clean(payload.mobile_number)
    if not payload.consent_accepted:
        raise HTTPException(422, "You must accept the Terms and Privacy Notice to continue.", headers={"X-Error-Code": "CONSENT_REQUIRED"})
    admin = _pending_admin(db, normalized)
    svc.record_consent(db, admin, payload.consent_content_version)
    db.commit()
    return {"status": "confirmed", "admin_id": str(admin.id), "rider_id": None, "full_name": admin.name, "mobile_number": normalized,
            "role": admin.role, "user_type": "admin", "next_step": "createPin"}


@router.post("/pin/create")
def pin_create(payload: PinCreateIn, db: Session = Depends(get_db)):
    if payload.pin != payload.pin_confirm:
        return {"ok": False, "error": "mismatch"}
    if not svc.valid_pin(payload.pin):
        raise HTTPException(422, "The PIN must be exactly 4 digits.")
    admin = db.query(AdminUser).filter(AdminUser.id == payload.admin_id).with_for_update().first()
    # id AND number must agree, so a guessed id alone opens nothing
    if not admin or svc.mobile_key(admin.mobile_number) != svc.mobile_key(payload.mobile_number) or not svc.may_use_app(admin):
        raise HTTPException(404, NOT_FOUND)
    if admin.app_pin_hash:
        raise HTTPException(409, ALREADY)
    if not admin.app_consent_at:
        raise HTTPException(409, "Finish Setup My Profile first.")
    svc.create_pin(db, admin, payload.pin)
    started = session_service.start_session(db, "admin", admin.id, payload.device_id, None, takeover=True)   # a brand-new PIN: this phone is THE session
    db.commit()
    return {"ok": True, "token": create_admin_app_token(admin, started["session"].id), "admin": svc.public_admin(admin)}


# ------------------------------------------------------------------ sign-in
@router.post("/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    """HTTP 200 for a right AND a wrong PIN (like /onboarding/pin/login): the answer is in `ok`."""
    try:
        normalized = _clean(payload.mobile_number)
    except HTTPException:
        return {"ok": False, "error": "incorrect"}
    res = svc.check_login(db, normalized, payload.pin)
    db.commit()                                               # keeps the attempt counter, the lock and the log even when the PIN is wrong
    if not res["ok"]:
        return res
    admin = res["admin"]
    return {"ok": True, "token": create_admin_app_token(admin), "admin": svc.public_admin(admin)}     # older sign-in route: the Login screen now uses POST /auth/login, which starts a session


def _app_admin(admin: AdminUser = Depends(get_current_admin)) -> AdminUser:
    if not (admin.app_access_enabled and admin.app_pin_hash):
        raise HTTPException(403, "This account is not set up for the app.")
    return admin


@router.post("/session/refresh")
def refresh(admin: AdminUser = Depends(_app_admin), x_device_id: str = Header(None), db: Session = Depends(get_db), request: Request = None):
    sid = None
    try:
        from jose import jwt
        from app.auth import SECRET_KEY, ALGORITHM
        sid = jwt.decode(request.headers.get("authorization", "").split(" ", 1)[1], SECRET_KEY, algorithms=[ALGORITHM]).get("sid")
    except Exception:
        sid = None
    if not sid:        # SMART APPS: a token from before sessions existed is adopted into one for this phone (never taking it from another phone)
        started = session_service.start_session(db, "admin", admin.id, x_device_id, None, takeover=False)
        db.commit()
        if not started["ok"]:
            raise HTTPException(401, detail=session_service.error_for("replaced"))
        sid = started["session"].id
    return {"ok": True, "token": create_admin_app_token(admin, sid), "admin": svc.public_admin(admin)}


@router.get("/me")
def me(admin: AdminUser = Depends(get_current_admin)):
    return svc.public_admin(admin)


@router.post("/logout")
def logout(admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    svc.log_event(db, admin, admin.mobile_number, "logout")
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ dashboard (one round trip for a phone)
@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _admin: AdminUser = Depends(require_admin)):
    """Every number is counted from the same tables the console reads (rider, boda_group, individual_rider_preregistration, business, ...)."""
    count = lambda col: db.query(func.count(col)).scalar() or 0       # noqa: E731
    biz = dict(db.query(Business.status, func.count(Business.id)).group_by(Business.status).all())
    return {
        "total_riders": count(Rider.id),
        "active_riders": db.query(func.count(Rider.id)).filter(Rider.registration_status == "active").scalar() or 0,
        "individual_riders": count(IndividualRiderPreRegistration.id),
        "total_groups": count(BodaGroup.id),
        "businesses_pending": biz.get(PENDING_SETUP, 0),
        "businesses_activated": biz.get(ACTIVATED, 0),
        "businesses_inactive": biz.get(INACTIVE, 0),
        "pending_slot_requests": db.query(func.count(GroupSlotRequest.id)).filter(GroupSlotRequest.status == "pending").scalar() or 0,
        "pending_statement_requests": db.query(func.count(BusinessStatementRequest.id)).filter(BusinessStatementRequest.status == REQUESTED).scalar() or 0,
    }


# ------------------------------------------------------------------ console: who may use the app (Super Admin only)
def _access_row(a: AdminUser, last_login):
    return {"id": str(a.id), "name": a.name, "email": a.email, "mobile_number": a.mobile_number, "role": a.role, "is_active": bool(a.is_active),
            "app_access_enabled": bool(a.app_access_enabled), "pin_set": bool(a.app_pin_hash),
            "registered_at": a.app_registered_at.isoformat() if a.app_registered_at else None,
            "locked": svc.is_locked(a), "last_login": last_login.isoformat() if last_login else None}


@router.get("/access")
def access_list(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db),
                _admin: AdminUser = Depends(require_super_admin)):
    qry = db.query(AdminUser)
    total = qry.count()
    rows = qry.order_by(AdminUser.created_at).offset((page - 1) * page_size).limit(page_size).all()
    last = dict(db.query(AdminAppLoginLog.admin_id, func.max(AdminAppLoginLog.created_at))
                .filter(AdminAppLoginLog.event == "login_ok", AdminAppLoginLog.admin_id.in_([a.id for a in rows]))
                .group_by(AdminAppLoginLog.admin_id).all()) if rows else {}
    return {"total": total, "page": page, "page_size": page_size, "items": [_access_row(a, last.get(a.id)) for a in rows]}


def _target(db: Session, admin_id: RowId) -> AdminUser:
    a = db.query(AdminUser).filter(AdminUser.id == admin_id).first()
    if not a:
        raise HTTPException(404, "Administrator not found.")
    return a


@router.patch("/access/{admin_id}")
def access_set(admin_id: RowId, body: AccessIn, db: Session = Depends(get_db), me: AdminUser = Depends(require_super_admin)):
    a = _target(db, admin_id)
    if body.enabled and len(svc.mobile_key(a.mobile_number)) != 9:
        raise HTTPException(400, "Add a mobile number to this Administrator first.")
    if not body.enabled and a.id == me.id:
        raise HTTPException(400, "You cannot switch off your own app access.")        # nobody locks themselves out
    svc.set_access(db, a, body.enabled, me)
    if not body.enabled:
        session_service.revoke_all(db, "admin", a.id, "admin")          # SMART APPS: switching the app off ends the phone's session at once
    db.commit()
    return _access_row(a, None)


@router.post("/access/{admin_id}/reset-pin")
def access_reset_pin(admin_id: RowId, db: Session = Depends(get_db), me: AdminUser = Depends(require_super_admin)):
    a = _target(db, admin_id)
    svc.reset_pin(db, a, me)
    session_service.revoke_all(db, "admin", a.id, "pin_reset")          # SMART APPS
    db.commit()
    return _access_row(a, None)
