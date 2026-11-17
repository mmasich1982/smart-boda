# backend/app/services/session_service.py
# SMART APPS: ONE ACTIVE SESSION PER USER, strictly.
#   * a session = one signed-in phone for one person; a token carries its id in the claim `sid`
#   * a login on a DIFFERENT phone revokes the old session ("replaced") and makes a new one, in one transaction
#   * every request that carries a token whose session was revoked is refused with 401 and a code the app understands
#   * the rules are plain functions (decide, error_for) so they can be tested without a database
import logging
import os
import time
import uuid as _uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.user_session import UserSession

logger = logging.getLogger(__name__)

LEGACY_DEVICE = "legacy"          # an app version that does not send a device id yet counts as ONE device
KINDS = ("rider", "admin")
# Tokens issued before this release carry no `sid`. They are accepted until this is switched to "false" (see README: rollout).
ALLOW_LEGACY_TOKENS = os.getenv("ALLOW_LEGACY_TOKENS", "true").strip().lower() != "false"
# When "true" a token is REQUIRED on rider-data routes that do not ask for one themselves (trips, fuel...). Turn on after the app is updated everywhere.
REQUIRE_SESSION_ON_RIDER_ROUTES = os.getenv("REQUIRE_SESSION_ON_RIDER_ROUTES", "false").strip().lower() == "true"
TOUCH_EVERY_SECONDS = 300

REASON_CODE = {"replaced": "session_replaced", "logout": "session_ended", "pin_reset": "session_ended", "admin": "session_ended"}
REASON_TEXT = {
    "session_replaced": "You were signed out because your account was used to log in on another device.",
    "session_ended": "Your session has ended. Please log in again.",
    "session_required": "Please log in again.",
}

_active_cache = {}                # sid -> expiry (monotonic); an ACTIVE answer is trusted for a few seconds, a revoked one never
_CACHE_SECONDS = 3.0


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def clean_device_id(device_id: Optional[str]) -> str:
    d = (device_id or "").strip()
    return d[:64] if d else LEGACY_DEVICE


def decide(active, device_id: str, takeover: bool):
    """The whole rule, with no database. `active` = the person's currently active sessions (normally 0 or 1).
       ('reuse', session)    this phone already holds the session
       ('conflict', session) another phone holds it and the person has not confirmed taking over
       ('create', [to_revoke]) make a new session; the listed ones are revoked first"""
    for s in active:
        if s.device_id == device_id:
            return ("reuse", s)
    if active and not takeover:
        return ("conflict", active[0])
    return ("create", list(active))


def error_for(reason: Optional[str]) -> dict:
    code = REASON_CODE.get(reason or "", "session_ended")
    return {"code": code, "message": REASON_TEXT[code]}


def _forget(sid) -> None:
    _active_cache.pop(str(sid), None)


def lookup_session(db: Session, sid) -> Optional[UserSession]:
    try:
        return db.query(UserSession).filter(UserSession.id == sid).first()
    except Exception:             # a malformed id in a token is "no such session", never a 500
        db.rollback()
        return None


def start_session(db: Session, kind: str, user_id, device_id: Optional[str], label: Optional[str] = None, takeover: bool = False) -> dict:
    """{'ok': True, 'session': s, 'replaced': bool} or {'ok': False, 'error': 'active_elsewhere', 'other': s}.
    Two logins for the same person at the same instant are serialised (advisory lock), and the unique index is the last line of defence."""
    assert kind in KINDS
    device = clean_device_id(device_id)
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"user_session:{kind}:{user_id}"})
    active = db.query(UserSession).filter(UserSession.user_kind == kind, UserSession.user_id == user_id, UserSession.revoked_at.is_(None)).all()
    action, subject = decide(active, device, takeover)
    if action == "conflict":
        return {"ok": False, "error": "active_elsewhere", "other": subject}
    if action == "reuse":
        subject.last_seen_at = now_utc()
        if label:
            subject.device_label = label[:120]
        return {"ok": True, "session": subject, "replaced": False}
    new = UserSession(id=_uuid.uuid4(), user_kind=kind, user_id=user_id, device_id=device, device_label=(label or "")[:120] or None)
    for old in subject:
        old.revoked_at, old.revoked_reason, old.replaced_by = now_utc(), "replaced", new.id
        _forget(old.id)
    db.flush()                    # the old rows are closed before the new one is inserted (the unique index allows only one open row)
    db.add(new)
    db.flush()
    return {"ok": True, "session": new, "replaced": bool(subject)}


def revoke(db: Session, session: Optional[UserSession], reason: str) -> None:
    if session is not None and session.revoked_at is None:
        session.revoked_at, session.revoked_reason = now_utc(), reason
        _forget(session.id)


def revoke_all(db: Session, kind: str, user_id, reason: str) -> int:
    rows = db.query(UserSession).filter(UserSession.user_kind == kind, UserSession.user_id == user_id, UserSession.revoked_at.is_(None)).all()
    for s in rows:
        revoke(db, s, reason)
    return len(rows)


def describe_other(session: UserSession) -> dict:
    """What the app shows when asking "sign out of the other phone?" (no ids, no device id)."""
    return {"device_label": session.device_label or "another device",
            "last_seen_at": session.last_seen_at.isoformat() if session.last_seen_at else None}


def guard_payload(db: Session, payload: dict, kind: str) -> Optional[UserSession]:
    """Used by get_current_rider / get_current_admin and the request guard. Raises 401 with a code when the token's session is gone.
    Returns the session, or None for a token that carries no sid (accepted only while ALLOW_LEGACY_TOKENS is on)."""
    sid = payload.get("sid")
    if not sid:
        if ALLOW_LEGACY_TOKENS:
            return None
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"code": "session_required", "message": REASON_TEXT["session_required"]})
    if _active_cache.get(str(sid), 0) > time.monotonic():
        return None
    s = lookup_session(db, sid)
    if s is None or s.revoked_at is not None or s.user_kind != kind or str(s.user_id) != str(payload.get("sub")):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=error_for(s.revoked_reason if s is not None else "logout"))
    _active_cache[str(sid)] = time.monotonic() + _CACHE_SECONDS
    last = s.last_seen_at
    if last is None or (now_utc() - (last if last.tzinfo else last.replace(tzinfo=timezone.utc))).total_seconds() > TOUCH_EVERY_SECONDS:
        try:
            s.last_seen_at = now_utc()
            db.commit()
        except Exception:         # never fail a request because the timestamp could not be saved
            db.rollback()
    return s
