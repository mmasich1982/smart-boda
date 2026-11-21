# backend/app/routers/admin_businesses.py
# SMART BIZNA (admin side): the Administrator registers a business and its users. No code or password is given out: each user
# just opens the app and types their number in Setup My Profile (routers/setup_profile.py finds the record).
#   GET    /admin/businesses/phone-check?phone=   -> {available, message, where}
#   GET    /admin/businesses                      -> {total, pending, activated, items:[business + users]}
#   POST   /admin/businesses                      -> registers a business; user 1 is the Business Owner, the rest Sales/Service Persons
#   DELETE /admin/businesses/{id}                 -> only while nobody in it has set up yet (typo clean-up)
#   GET    /admin/businesses/map?q=&status=&business_type_code=  -> BUSINESSES MAP: every business with a GPS position, plus the ones still without one
# LOCATION (migration 004): a new business is registered with its GPS position (latitude, longitude, accuracy, source) captured by the
# Administrator; County / Sub-county / Ward are no longer asked. Businesses registered before keep their place name and have no position until the
# Administrator captures one (PATCH). TRANSITION: an OLD admin app build that still sends all three of county_id / sub_county_id / ward_id and no GPS
# is still accepted (the business then shows as "not located"), so a phone that has not updated yet can keep registering.
# Changing a business later (journey L of the scope document):
#   PATCH  /admin/businesses/{id}                       -> name and the two business tile defaults (Purchases / Expenses)
#   POST   /admin/businesses/{id}/deactivate | /reactivate   -> switch the whole business off / on
#   POST   /admin/businesses/{id}/users                 -> add a Sales/Service Person to an existing business
#   PATCH  /admin/businesses/{id}/users/{uid}           -> name / phone (only while the person has not set up) and the person's own tile choices
#   DELETE /admin/businesses/{id}/users/{uid}           -> only while the person has not set up (never the Owner)
#   POST   /admin/businesses/{id}/users/{uid}/deactivate | /reactivate
#   POST   /admin/businesses/{id}/change-owner          -> names another user the Owner in ONE step (never none, never two)
#   GET    /admin/businesses/{id}/performance?view=&periods=  -> BUSINESS PERFORMANCE tab: daily / monthly / quarterly / half_yearly / yearly figures,
#                                                              trend, payment methods, cost breakdown, people, Lipa Later exposure, activity and advice prompts (read only)
# Rules: exactly one Owner (the first user); NO maximum number of users; a mobile number must exist nowhere in Smart Boda
# (same check as individual riders, extended to business users); Purchases / Expenses tile choices are saved (business default
# + optional per-person Yes/No) but only enforced in a later release.
import math
import re
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional
from uuid import UUID as RowId   # NOT "UUID": star-imports of the models bring SQLAlchemy's UUID column type into scope
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.auth import require_admin
from app.database import get_db
from app.models.admin_user import AdminUser
from app.models.business import (Business, BusinessUser, BusinessTypeMaster, OWNER, SALES_PERSON, AWAITING, REGISTERED, INACTIVE,
                                 PENDING_SETUP, ACTIVATED)
from app.routers.mobile_number import validate_mobile_number
from app.services.group_roles import phone_key
from app.services.individual_rider_service import find_phone_conflict
from app.services.business_service import existing_owner, business_memberships
from app.services import business_performance_service as perf

router = APIRouter(prefix="/admin/businesses", tags=["admin-businesses"], dependencies=[Depends(require_admin)])


def _name(v):
    v = re.sub(r"\s+", " ", v or "").strip()
    if len(v) < 2:
        raise ValueError("Enter a name of at least 2 characters.")
    return v


class BusinessUserIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    mobile_number: str = Field(min_length=9, max_length=20)
    can_see_purchases: Optional[bool] = None       # per-person choice for a Sales/Service Person; None = Same as business
    can_see_expenses: Optional[bool] = None
    same_owner: bool = False                       # MULTIPLE BUSINESSES, user 1 only: the Administrator confirmed this number is an EXISTING Owner getting another business

    @field_validator("full_name")
    @classmethod
    def _n(cls, v):
        return _name(v)

    @field_validator("mobile_number")
    @classmethod
    def _m(cls, v):
        ok, normalized, err = validate_mobile_number(v)
        if not ok:
            raise ValueError(err or "Enter a valid Kenyan mobile number, e.g. 0712345678.")
        return normalized


class BusinessIn(BaseModel):
    business_name: str = Field(min_length=2, max_length=80)
    sales_can_see_purchases: bool = False          # business default for every Sales/Service Person (always saved, never empty)
    sales_can_see_expenses: bool = False
    business_type_code: str                                # the Administrator chooses the Business Type at pre-registration (required)
    latitude: Optional[float] = None                       # the business GPS position, captured by the Administrator (required unless an old app sends the three place ids)
    longitude: Optional[float] = None
    location_accuracy_m: Optional[float] = None            # metres, as reported by the device (omit for a typed position)
    location_source: Optional[str] = None                  # 'gps' (taken from the device) or 'manual' (typed / pasted); anything else is stored as 'manual'
    county_id: Optional[int] = None                        # OLD way, accepted only from an app that has not updated yet (all three together, no GPS)
    sub_county_id: Optional[int] = None
    ward_id: Optional[int] = None
    users: List[BusinessUserIn] = Field(min_length=1)      # no maximum

    @field_validator("business_name")
    @classmethod
    def _bn(cls, v):
        return _name(v)


def _check_type(db: Session, code):
    """The Business Type is chosen from the Administrator's list (active types only). No business user ever chooses it."""
    bt = db.query(BusinessTypeMaster).filter_by(code=code, is_active=True).first()
    if not bt:
        raise HTTPException(422, "Choose a valid business type.")
    return bt.code


def _check_location(db: Session, county_id, sub_county_id, ward_id):
    """Server-side twin of the County > Sub-county > Ward cascade (same rule as a Treasurer's group)."""
    from app.models.location_models import County, SubCounty, Ward
    if not db.query(County).filter(County.id == county_id).first():
        raise HTTPException(422, "Choose a valid county.")
    sc = db.query(SubCounty).filter(SubCounty.id == sub_county_id, SubCounty.county_id == county_id).first()
    w = db.query(Ward).filter(Ward.id == ward_id, Ward.sub_county_id == sub_county_id).first()
    if not sc or not w:
        raise HTTPException(422, "Sub-county or ward does not belong to the selected county.")


def _check_gps(latitude, longitude, accuracy=None, source=None):
    """Server-side rules for a captured position. Returns (lat, lng, accuracy, source) rounded to 6 / 1 decimals, or raises 422.
    Both coordinates together; finite; inside the world; never 0,0 (the value a phone reports when it has no fix at all)."""
    if latitude is None or longitude is None:
        raise HTTPException(422, "Send the latitude and the longitude together.")
    if not (math.isfinite(latitude) and math.isfinite(longitude)):
        raise HTTPException(422, "The location is not a valid position.")
    if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
        raise HTTPException(422, "The location is outside the world: latitude must be between -90 and 90, longitude between -180 and 180.")
    if latitude == 0 and longitude == 0:
        raise HTTPException(422, "The location 0, 0 is what a phone reports when it has no GPS fix. Capture the location again.")
    lat = Decimal(str(latitude)).quantize(Decimal("0.000001"), ROUND_HALF_UP)
    lng = Decimal(str(longitude)).quantize(Decimal("0.000001"), ROUND_HALF_UP)
    acc = None
    if accuracy is not None:
        if not math.isfinite(accuracy) or accuracy < 0 or accuracy > 99999:
            raise HTTPException(422, "The location accuracy is not valid.")
        acc = Decimal(str(accuracy)).quantize(Decimal("0.1"), ROUND_HALF_UP)
    return lat, lng, acc, (source if source in ("gps", "manual") else "manual")


def _set_gps(b: Business, latitude, longitude, accuracy, source):
    b.latitude, b.longitude, b.location_accuracy_m, b.location_source = _check_gps(latitude, longitude, accuracy, source)
    b.location_captured_at = datetime.now(timezone.utc)


def working_permissions(u: BusinessUser, b: Business):
    """What this person can really see: the Owner always sees both tiles; a Sales/Service Person uses their own Yes / No, or the
    business choice when theirs is empty ("Same as business")."""
    if u.role == OWNER:
        return True, True
    return (b.sales_can_see_purchases if u.can_see_purchases is None else u.can_see_purchases,
            b.sales_can_see_expenses if u.can_see_expenses is None else u.can_see_expenses)


def _user_row(u: BusinessUser, b: Business) -> dict:
    purchases, expenses = working_permissions(u, b)
    return {"id": str(u.id), "full_name": u.full_name, "mobile_number": u.mobile_number, "role": u.role, "status": u.status,
            "can_see_purchases": u.can_see_purchases, "can_see_expenses": u.can_see_expenses,           # NULL = Same as business
            "purchases_allowed": purchases, "expenses_allowed": expenses,                                # the working answer
            "registered_at": u.registered_at.isoformat() if u.registered_at else None}


def _place(b: Business, places=None) -> dict:
    """The business LOCATION: its GPS position (new), and the County / Sub-county / Ward it was given before the change (kept as they were)."""
    names = (places or {})
    gps = b.latitude is not None and b.longitude is not None
    return {"latitude": float(b.latitude) if gps else None, "longitude": float(b.longitude) if gps else None, "has_gps": gps,
            "location_accuracy_m": float(b.location_accuracy_m) if b.location_accuracy_m is not None else None,
            "location_source": b.location_source if gps else None,
            "location_captured_at": b.location_captured_at.isoformat() if b.location_captured_at else None,
            "county_id": b.county_id, "sub_county_id": b.sub_county_id, "ward_id": b.ward_id, "county": names.get(("c", b.county_id)),
            "sub_county": names.get(("s", b.sub_county_id)), "ward": names.get(("w", b.ward_id))}


def _place_names(db: Session, rows) -> dict:
    from app.models.location_models import County, SubCounty, Ward
    out = {}
    for model, key, col in ((County, "c", "county_name"), (SubCounty, "s", "sub_county_name"), (Ward, "w", "ward_name")):
        ids = {getattr(b, {"c": "county_id", "s": "sub_county_id", "w": "ward_id"}[key]) for b in rows} - {None}
        if ids:
            for r in db.query(model).filter(model.id.in_(ids)).all():
                out[(key, r.id)] = getattr(r, col)
    return out


def _row(b: Business, users, type_name=None, places=None, also=None) -> dict:
    users = sorted(users, key=lambda u: (u.role != OWNER, u.created_at or 0))
    also = also or {}
    return {"also_owns": also.get(b.id, []), "id": str(b.id), "business_name": b.business_name, "business_type_code": b.business_type_code, "business_type": type_name, **_place(b, places),
            "status": b.status, "sales_can_see_purchases": b.sales_can_see_purchases, "sales_can_see_expenses": b.sales_can_see_expenses,
            "created_at": b.created_at.isoformat() if b.created_at else None, "users": [_user_row(u, b) for u in users]}


def _type_name(db: Session, b: Business):
    t = db.query(BusinessTypeMaster.display_name).filter_by(code=b.business_type_code).first() if b.business_type_code else None
    return t[0] if t else None


def _also_owns(db: Session, rows) -> dict:
    """MULTIPLE BUSINESSES: for each business, the NAMES of the other businesses its Owner also owns (empty for most). Shown to the Administrator only."""
    ids = [b.id for b in rows]
    if not ids:
        return {}
    owners = db.query(BusinessUser).filter(BusinessUser.business_id.in_(ids), BusinessUser.role == OWNER).all()
    keys = {o.phone_key for o in owners}
    if not keys:
        return {}
    others = (db.query(BusinessUser.phone_key, Business.id, Business.business_name).join(Business, Business.id == BusinessUser.business_id)
              .filter(BusinessUser.phone_key.in_(keys), BusinessUser.role == OWNER).all())
    out = {}
    for o in owners:
        out[o.business_id] = sorted(n for k, bid_, n in others if k == o.phone_key and bid_ != o.business_id)
    return {k: v for k, v in out.items() if v}


def _full(db: Session, b: Business) -> dict:
    return _row(b, db.query(BusinessUser).filter_by(business_id=b.id).all(), _type_name(db, b), _place_names(db, [b]), _also_owns(db, [b]))


def _get(db: Session, business_id) -> Business:
    b = db.get(Business, business_id)
    if not b:
        raise HTTPException(404, "Business not found.")
    return b


def _get_user(db: Session, b: Business, user_id) -> BusinessUser:
    u = db.get(BusinessUser, user_id)
    if not u or u.business_id != b.id:
        raise HTTPException(404, "User not found in this business.")
    return u


@router.get("/phone-check")
def phone_check(phone: str, db: Session = Depends(get_db)):
    ok, normalized, err = validate_mobile_number(phone)
    if not ok:
        raise HTTPException(400, err or "Enter a valid Kenyan mobile number.")
    owner = existing_owner(db, normalized)               # MULTIPLE BUSINESSES: an existing Business Owner may be given another business
    if owner and not find_phone_conflict(db, normalized, allow_owner_reuse=True):
        names = ", ".join(b["business_name"] for b in owner["businesses"])
        return {"available": False, "can_add_as_owner": True, "mobile_number": normalized, "where": "business_owner",
                "owner_name": owner["full_name"], "owner_of": owner["businesses"],
                "message": f"This person ({owner['full_name']}) already owns: {names}. You can register this business under the same Owner. For a Sales/Service Person this number cannot be used."}
    c = find_phone_conflict(db, normalized)
    if c:
        return {"available": False, "can_add_as_owner": False, "mobile_number": normalized, "where": c["where"], "message": c["message"]}
    return {"available": True, "can_add_as_owner": False, "mobile_number": normalized, "message": "This number is available."}


def _filtered(db: Session, q=None, status=None):
    """The search used by both the Businesses and Users list and the Businesses Map (name, person or phone; and status)."""
    qry = db.query(Business)
    if q and q.strip():
        like = f"%{q.strip()}%"
        d = re.sub(r"\D", "", q)
        d = d[3:] if d.startswith("254") else d[1:] if d.startswith("0") else d
        sub = db.query(BusinessUser.business_id).filter(or_(BusinessUser.full_name.ilike(like),
                                                          *( [BusinessUser.phone_key.like(f"%{d[-9:]}%")] if d else [] )))
        qry = qry.filter(or_(Business.business_name.ilike(like), Business.id.in_(sub)))
    if status in (PENDING_SETUP, ACTIVATED, INACTIVE):
        qry = qry.filter(Business.status == status)
    return qry


MAP_MAX_PINS = 5000          # one map never needs more; a tighter filter narrows it
MAP_MAX_MISSING = 500


@router.get("/map")
def businesses_map(q: str = None, status: str = None, business_type_code: str = None, db: Session = Depends(get_db)):
    """BUSINESSES MAP (console and Admin App). Every matching business that has a GPS position (pins), and a short list of the ones that do not
    yet (so the Administrator can go and capture them). Read only; no phone numbers are returned, only the Owner's name."""
    qry = _filtered(db, q, status)
    if business_type_code:
        qry = qry.filter(Business.business_type_code == business_type_code)
    located_q = qry.filter(Business.latitude.isnot(None), Business.longitude.isnot(None))
    missing_q = qry.filter(or_(Business.latitude.is_(None), Business.longitude.is_(None)))
    n_located, n_missing = located_q.count(), missing_q.count()
    pins = located_q.order_by(Business.business_name).limit(MAP_MAX_PINS).all()
    missing = missing_q.order_by(Business.business_name).limit(MAP_MAX_MISSING).all()
    shown = pins + missing
    ids = [b.id for b in shown]
    owners, counts = {}, {}
    if ids:
        for bid, name in db.query(BusinessUser.business_id, BusinessUser.full_name).filter(
                BusinessUser.business_id.in_(ids), BusinessUser.role == OWNER, BusinessUser.status != INACTIVE).all():
            owners[bid] = name
        counts = dict(db.query(BusinessUser.business_id, func.count(BusinessUser.id)).filter(BusinessUser.business_id.in_(ids)).group_by(BusinessUser.business_id).all())
    types = dict(db.query(BusinessTypeMaster.code, BusinessTypeMaster.display_name).all())
    places = _place_names(db, shown)

    def item(b):
        p = _place(b, places)
        return {"id": str(b.id), "business_name": b.business_name, "business_type": types.get(b.business_type_code), "status": b.status,
                "owner_name": owners.get(b.id), "users": int(counts.get(b.id, 0)),
                "latitude": p["latitude"], "longitude": p["longitude"], "location_accuracy_m": p["location_accuracy_m"],
                "location_source": p["location_source"], "location_captured_at": p["location_captured_at"],
                "place": ", ".join(x for x in (p["ward"], p["sub_county"], p["county"]) if x) or None}      # the old County / Sub-county / Ward text, if it has one
    return {"total": n_located + n_missing, "located": n_located, "not_located": n_missing,
            "items": [item(b) for b in pins], "missing": [item(b) for b in missing], "pins_truncated": n_located > len(pins), "missing_truncated": n_missing > len(missing)}


@router.get("")
def list_businesses(q: str = None, status: str = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                    db: Session = Depends(get_db)):
    qry = _filtered(db, q, status)
    total = qry.count()
    rows = qry.order_by(Business.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    users = db.query(BusinessUser).filter(BusinessUser.business_id.in_([b.id for b in rows])).all() if rows else []
    counts = dict(db.query(Business.status, func.count(Business.id)).group_by(Business.status).all())
    names = dict(db.query(BusinessTypeMaster.code, BusinessTypeMaster.display_name).all())
    places = _place_names(db, rows)
    also = _also_owns(db, rows)
    return {"total": total, "page": page, "page_size": page_size, "pending": counts.get(PENDING_SETUP, 0),
            "activated": counts.get(ACTIVATED, 0), "inactive": counts.get(INACTIVE, 0),
            "items": [_row(b, [u for u in users if u.business_id == b.id], names.get(b.business_type_code), places, also) for b in rows]}


@router.post("", status_code=201)
def create_business(body: BusinessIn, db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    seen = {}
    for i, u in enumerate(body.users, start=1):                       # the same number twice in one form
        k = phone_key(u.mobile_number)
        if k in seen:
            raise HTTPException(422, f"User {i} has the same mobile number as user {seen[k]}. Each person needs their own number.")
        seen[k] = i
    owner_info = None
    for i, u in enumerate(body.users, start=1):                       # every number must exist nowhere in Smart Boda ...
        reuse = i == 1 and u.same_owner                               # ... except user 1 when the Administrator confirmed an EXISTING Owner
        if reuse:
            owner_info = existing_owner(db, u.mobile_number)
            if not owner_info:
                raise HTTPException(409, f"User 1 ({u.full_name}): this number is not an existing Business Owner, so it cannot be used for 'same Owner'.")
        elif i > 1 and u.same_owner:
            raise HTTPException(409, f"User {i} ({u.full_name}): only the Business Owner (user 1) can be an existing Owner. A Sales/Service Person needs a number that exists nowhere in Smart Boda.")
        c = find_phone_conflict(db, u.mobile_number, allow_owner_reuse=reuse)
        if c:
            raise HTTPException(409, f"User {i} ({u.full_name}): {c['message']} Use a different number.")
        if i == 1 and not reuse and existing_owner(db, u.mobile_number):
            raise HTTPException(409, f"User 1 ({u.full_name}): this number already belongs to a Business Owner. Confirm 'same Owner' to register this business under them.")
    has_gps = body.latitude is not None or body.longitude is not None
    legacy = None not in (body.county_id, body.sub_county_id, body.ward_id)
    if has_gps:
        _check_gps(body.latitude, body.longitude, body.location_accuracy_m, body.location_source)      # refuse a bad position before anything is saved
    elif legacy:
        _check_location(db, body.county_id, body.sub_county_id, body.ward_id)                           # an app that has not updated yet (see the header)
    else:
        raise HTTPException(422, "Capture the business location (GPS) before registering.")
    type_code = _check_type(db, body.business_type_code)
    b = Business(business_name=body.business_name, status=PENDING_SETUP, created_by_admin_id=admin.id, business_type_code=type_code,
                 sales_can_see_purchases=body.sales_can_see_purchases, sales_can_see_expenses=body.sales_can_see_expenses)
    if has_gps:
        _set_gps(b, body.latitude, body.longitude, body.location_accuracy_m, body.location_source)     # new registrations store the position, not the three place ids
    else:
        b.county_id, b.sub_county_id, b.ward_id = body.county_id, body.sub_county_id, body.ward_id
    db.add(b)
    db.flush()
    for i, u in enumerate(body.users):
        owner = i == 0                                                # user 1 is the Business Owner; there is always exactly one
        if owner and owner_info:                                      # an EXISTING Owner: same person, same account, no second registration
            now = datetime.now(timezone.utc)
            db.add(BusinessUser(business_id=b.id, full_name=owner_info["full_name"], mobile_number=u.mobile_number, phone_key=phone_key(u.mobile_number),
                                role=OWNER, status=REGISTERED if owner_info["registered"] else AWAITING, rider_id=owner_info["rider_id"],
                                registered_at=now if owner_info["registered"] else None))
            if owner_info["registered"]:
                b.status = ACTIVATED                                  # they have already set up: the new business is live at once
            continue
        db.add(BusinessUser(business_id=b.id, full_name=u.full_name, mobile_number=u.mobile_number, phone_key=phone_key(u.mobile_number),
                            role=OWNER if owner else SALES_PERSON, status=AWAITING,
                            can_see_purchases=None if owner else u.can_see_purchases,      # the Owner always sees both tiles
                            can_see_expenses=None if owner else u.can_see_expenses))
    try:
        db.commit()
    except IntegrityError:                                            # two saves at once: the unique index wins
        db.rollback()
        raise HTTPException(409, "One of these numbers was just taken by another registration. Check the numbers and try again.")
    db.refresh(b)
    return _full(db, b)


@router.delete("/{business_id}")
def remove_business(business_id: RowId, db: Session = Depends(get_db)):
    b = db.get(Business, business_id)
    if not b:
        raise HTTPException(404, "Business not found.")
    users = db.query(BusinessUser).filter_by(business_id=b.id).all()
    if any(u.status != AWAITING for u in users):
        raise HTTPException(409, "Someone in this business has already set up in the app, so it cannot be removed.")
    for u in users:
        db.delete(u)
    db.delete(b)
    db.commit()
    return {"removed": True}


# ====================================================================================================================
# Changing a business later (journey L)
# ====================================================================================================================
class BusinessPatch(BaseModel):
    business_name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    sales_can_see_purchases: Optional[bool] = None          # the business default: always a Yes or a No, never empty
    sales_can_see_expenses: Optional[bool] = None
    business_type_code: Optional[str] = None                # the Administrator may correct the Business Type
    latitude: Optional[float] = None                        # capture the GPS position again (or for the first time, for a business registered before the change): send both
    longitude: Optional[float] = None
    location_accuracy_m: Optional[float] = None
    location_source: Optional[str] = None
    county_id: Optional[int] = None                         # OLD way, still accepted from an app that has not updated: all three together
    sub_county_id: Optional[int] = None
    ward_id: Optional[int] = None

    @field_validator("business_name")
    @classmethod
    def _bn(cls, v):
        return None if v is None else _name(v)


class UserPatch(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    mobile_number: Optional[str] = Field(default=None, min_length=9, max_length=20)
    can_see_purchases: Optional[bool] = None                # send null to go back to "Same as business"
    can_see_expenses: Optional[bool] = None

    @field_validator("full_name")
    @classmethod
    def _n(cls, v):
        return None if v is None else _name(v)

    @field_validator("mobile_number")
    @classmethod
    def _m(cls, v):
        if v is None:
            return None
        ok, normalized, err = validate_mobile_number(v)
        if not ok:
            raise ValueError(err or "Enter a valid Kenyan mobile number, e.g. 0712345678.")
        return normalized


class ChangeOwnerIn(BaseModel):
    user_id: RowId


@router.patch("/{business_id}")
def update_business(business_id: RowId, body: BusinessPatch, db: Session = Depends(get_db)):
    """Changing the business choice moves everyone who is on "Same as business"; people with their own Yes / No keep it."""
    b = _get(db, business_id)
    sent = body.model_fields_set
    if "business_name" in sent and body.business_name is not None:
        b.business_name = body.business_name
    if "business_type_code" in sent:
        if not body.business_type_code:
            raise HTTPException(422, "Choose a valid business type.")
        b.business_type_code = _check_type(db, body.business_type_code)
    if sent & {"latitude", "longitude"}:                                          # the Administrator captures the GPS position (both together)
        _set_gps(b, body.latitude, body.longitude, body.location_accuracy_m, body.location_source)
    if sent & {"county_id", "sub_county_id", "ward_id"}:                         # OLD way (an app that has not updated): all three together
        if None in (body.county_id, body.sub_county_id, body.ward_id):
            raise HTTPException(422, "Choose the county, sub-county and ward together.")
        _check_location(db, body.county_id, body.sub_county_id, body.ward_id)
        b.county_id, b.sub_county_id, b.ward_id = body.county_id, body.sub_county_id, body.ward_id
    for f in ("sales_can_see_purchases", "sales_can_see_expenses"):
        if f in sent:
            if getattr(body, f) is None:
                raise HTTPException(422, "The business choice must be Yes or No.")
            if getattr(b, f) != getattr(body, f):
                b.perm_changed_at = datetime.now(timezone.utc)
            setattr(b, f, getattr(body, f))
    db.commit()
    db.refresh(b)
    return _full(db, b)


@router.post("/{business_id}/deactivate")
def deactivate_business(business_id: RowId, db: Session = Depends(get_db)):
    b = _get(db, business_id)
    if b.status == INACTIVE:
        raise HTTPException(409, "This business is already switched off.")
    b.status = INACTIVE
    db.commit()
    return _full(db, b)


@router.post("/{business_id}/reactivate")
def reactivate_business(business_id: RowId, db: Session = Depends(get_db)):
    b = _get(db, business_id)
    if b.status != INACTIVE:
        raise HTTPException(409, "This business is not switched off.")
    anyone = db.query(BusinessUser.id).filter(BusinessUser.business_id == b.id, BusinessUser.rider_id.isnot(None)).first()
    b.status = ACTIVATED if anyone else PENDING_SETUP
    db.commit()
    return _full(db, b)


@router.post("/{business_id}/users", status_code=201)
def add_user(business_id: RowId, body: BusinessUserIn, db: Session = Depends(get_db)):
    """A new Sales/Service Person for an existing business. They set up like everyone else; the Business Type is pre-selected."""
    b = _get(db, business_id)
    if b.status == INACTIVE:
        raise HTTPException(409, "This business is switched off. Reactivate it before adding people.")
    c = find_phone_conflict(db, body.mobile_number)
    if c:
        raise HTTPException(409, c["message"] + " Use a different number.")
    db.add(BusinessUser(business_id=b.id, full_name=body.full_name, mobile_number=body.mobile_number, phone_key=phone_key(body.mobile_number),
                        role=SALES_PERSON, status=AWAITING, can_see_purchases=body.can_see_purchases, can_see_expenses=body.can_see_expenses))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This number was just taken by another registration. Check the number and try again.")
    return _full(db, b)


@router.patch("/{business_id}/users/{user_id}")
def update_user(business_id: RowId, user_id: RowId, body: UserPatch, db: Session = Depends(get_db)):
    b = _get(db, business_id)
    u = _get_user(db, b, user_id)
    sent = body.model_fields_set
    if ({"full_name", "mobile_number"} & sent) and u.status != AWAITING:
        raise HTTPException(409, "This person has already set up in the app, so the name and number cannot be edited here. "
                                 "A phone change goes through the normal PIN recovery path.")
    if ({"full_name", "mobile_number"} & sent) and db.query(BusinessUser.id).filter(BusinessUser.phone_key == u.phone_key, BusinessUser.id != u.id).first():
        raise HTTPException(409, "This Owner has more than one business, so the name and number are shared and cannot be edited here.")   # one person, one number
    if ({"can_see_purchases", "can_see_expenses"} & sent) and u.role == OWNER:
        raise HTTPException(422, "The Business Owner always sees both tiles, so there is nothing to choose.")
    if "full_name" in sent and body.full_name is not None:
        u.full_name = body.full_name
    if "mobile_number" in sent and body.mobile_number is not None and phone_key(body.mobile_number) != u.phone_key:
        c = find_phone_conflict(db, body.mobile_number)           # the person's OWN current number is not a clash (skipped above)
        if c:
            raise HTTPException(409, c["message"] + " Use a different number.")
        u.mobile_number, u.phone_key = body.mobile_number, phone_key(body.mobile_number)
    for f in ("can_see_purchases", "can_see_expenses"):
        if f in sent:
            if getattr(u, f) != getattr(body, f):
                u.perm_changed_at = datetime.now(timezone.utc)
            setattr(u, f, getattr(body, f))                       # True, False, or None = Same as business
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This number was just taken by another registration. Check the number and try again.")
    return _full(db, b)


@router.delete("/{business_id}/users/{user_id}")
def remove_user(business_id: RowId, user_id: RowId, db: Session = Depends(get_db)):
    b = _get(db, business_id)
    u = _get_user(db, b, user_id)
    if u.role == OWNER:
        raise HTTPException(409, "The Business Owner cannot be removed. Name another Owner first, or remove the whole business.")
    if u.status != AWAITING:
        raise HTTPException(409, "This person has already set up in the app, so they cannot be removed. Switch them off instead.")
    db.delete(u)
    db.commit()
    return _full(db, b)


@router.post("/{business_id}/users/{user_id}/deactivate")
def deactivate_user(business_id: RowId, user_id: RowId, db: Session = Depends(get_db)):
    b = _get(db, business_id)
    u = _get_user(db, b, user_id)
    if u.status == INACTIVE:
        raise HTTPException(409, "This person is already switched off.")
    if u.role == OWNER:
        raise HTTPException(409, "The Business Owner cannot be switched off on their own. Name another Owner first, or switch off the whole business.")
    u.status = INACTIVE
    db.commit()
    return _full(db, b)


@router.post("/{business_id}/users/{user_id}/reactivate")
def reactivate_user(business_id: RowId, user_id: RowId, db: Session = Depends(get_db)):
    b = _get(db, business_id)
    u = _get_user(db, b, user_id)
    if u.status != INACTIVE:
        raise HTTPException(409, "This person is not switched off.")
    if b.status == INACTIVE:
        raise HTTPException(409, "The business is switched off. Reactivate the business first.")
    u.status = REGISTERED if u.rider_id else AWAITING             # back to where they were: set up, or still waiting to set up
    db.commit()
    return _full(db, b)


@router.post("/{business_id}/change-owner")
def change_owner(business_id: RowId, body: ChangeOwnerIn, db: Session = Depends(get_db)):
    """One step: the old Owner becomes a Sales/Service Person (their own records stay with them; their tile choices start at
    "Same as business") and the named person becomes the Owner. There is never no Owner and never two."""
    b = _get(db, business_id)
    if b.status == INACTIVE:
        raise HTTPException(409, "This business is switched off. Reactivate it first.")
    new = _get_user(db, b, body.user_id)
    if new.role == OWNER:
        raise HTTPException(409, "This person is already the Business Owner.")
    if new.status == INACTIVE:
        raise HTTPException(409, "This person is switched off. Reactivate them first, or choose someone else.")
    old = db.query(BusinessUser).filter(BusinessUser.business_id == b.id, BusinessUser.role == OWNER, BusinessUser.status != INACTIVE).first()
    if old and db.query(BusinessUser.id).filter(BusinessUser.phone_key == old.phone_key, BusinessUser.id != old.id).first():
        raise HTTPException(409, f"{old.full_name} also owns another business, so they cannot stay in this one as a Sales/Service Person. A person is either an Owner or staff, never both.")
    if old:
        old.role, old.can_see_purchases, old.can_see_expenses = SALES_PERSON, None, None
        old.perm_changed_at = datetime.now(timezone.utc)
        db.flush()                                                # the database allows one active Owner: free the seat first
    new.role, new.can_see_purchases, new.can_see_expenses = OWNER, None, None
    db.commit()
    return _full(db, b)


def _lipa_rows(db: Session, business_id):
    """What is still owed: customers to the business and the business to its suppliers (pending records, balance = amount minus payments)."""
    from app.models.business_lipa_later import (BusinessLipaLaterRecord, BusinessLipaLaterPayment, BusinessSupplierLipaRecord,
                                                BusinessSupplierLipaPayment)
    rows = []
    for kind, Rec, Pay in (("customer", BusinessLipaLaterRecord, BusinessLipaLaterPayment), ("supplier", BusinessSupplierLipaRecord, BusinessSupplierLipaPayment)):
        paid = dict(db.query(Pay.lipa_later_id, func.coalesce(func.sum(Pay.amount_ksh), 0)).filter(Pay.business_id == business_id).group_by(Pay.lipa_later_id).all())
        for r in db.query(Rec).filter(Rec.business_id == business_id, Rec.status == "pending").all():
            rows.append({"kind": kind, "balance": max(0.0, float(r.amount) - float(paid.get(r.id, 0) or 0)), "due_date": r.due_date})
    return rows


@router.get("/{business_id}/performance")
def business_performance(business_id: RowId, view: str = Query("monthly"), periods: Optional[int] = Query(None, ge=1, le=90), db: Session = Depends(get_db)):
    """BUSINESS PERFORMANCE of one business for the Administrator (console and Admin app). Read only. Uses the same money formula as the Owner's reports."""
    from app.routers.business_ops import record_dicts
    b = _get(db, business_id)
    if view not in perf.VIEWS:
        raise HTTPException(422, "view must be one of: " + ", ".join(perf.VIEWS))
    recs, pays, users, spays = record_dicts(db, b.id)
    out = perf.build_performance(view, datetime.now(timezone.utc), recs, pays, users, spays, _lipa_rows(db, b.id), periods)
    out["business"] = {"id": str(b.id), "business_name": b.business_name, "status": b.status, "people": len(users)}
    return out
