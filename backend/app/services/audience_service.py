# backend/app/services/audience_service.py
# SMART CABZ: which words does this rider-account hold? Looks the person up once and remembers the answer for a minute.
import time
from typing import Optional

from sqlalchemy.orm import Session

from app.models.business import BusinessUser
from app.models.rider import Rider
from app.services.vehicle_words import audience_for, RIDER

_cache = {}                       # rider id -> (expires, audience)
_TTL = 60.0


def audience_of_rider(db: Session, rider_id) -> str:
    key = str(rider_id)
    hit = _cache.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    try:
        r = db.query(Rider.vehicle_type, Rider.chama_only).filter(Rider.id == rider_id).first()
        is_biz = db.query(BusinessUser.id).filter(BusinessUser.rider_id == rider_id).first() is not None
        a = audience_for(r[0] if r else None, is_biz, bool(r[1]) if r else False)
    except Exception:             # a lookup problem must never block a message: fall back to the unchanged text
        db.rollback()
        a = RIDER
    _cache[key] = (time.monotonic() + _TTL, a)
    return a


def forget(rider_id) -> None:
    _cache.pop(str(rider_id), None)           # called when a vehicle type changes, so the new words apply at once
