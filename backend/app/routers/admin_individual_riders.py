# backend/app/routers/admin_individual_riders.py
# INDIVIDUAL RIDERS (admin side). The Smart Boda Administrator pre-creates a rider who has no Treasurer and no group:
# name + mobile number. The number must exist NOWHERE in Smart Boda (rider table, earlier pre-registrations, group members,
# group Treasurer phones, PIN-recovery requests). Saved records wait in individual_rider_preregistration as
# "awaiting_registration"; the rider then registers in the app (routers/setup_profile.py finds the record by mobile number).
#
#   GET    /admin/individual-riders/phone-check?phone=   -> {available, message, ...}   (shown before Save; enforced again on create)
#   GET    /admin/individual-riders                      -> {total, awaiting, registered, items}
#   POST   /admin/individual-riders                      -> creates the record (409 when the number is taken)
#   DELETE /admin/individual-riders/{id}                 -> removes a record that is still awaiting (typo clean-up)
import re
from uuid import UUID as RowId   # NOT "UUID": star-imports of the models bring SQLAlchemy's UUID column type into scope
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.auth import require_admin
from app.database import get_db
from app.models.admin_user import AdminUser
from app.models.individual_rider import IndividualRiderPreRegistration as Pre, AWAITING, REGISTERED
from app.models.rider import Rider
from app.routers.mobile_number import validate_mobile_number
from app.services.group_roles import phone_key
from app.services.individual_rider_service import find_phone_conflict

router = APIRouter(prefix="/admin/individual-riders", tags=["admin-individual-riders"],
                   dependencies=[Depends(require_admin)])


class IndividualRiderIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    mobile_number: str = Field(min_length=9, max_length=20)

    @field_validator("full_name")
    @classmethod
    def _name(cls, v):
        v = re.sub(r"\s+", " ", v or "").strip()
        if len(v) < 2:
            raise ValueError("Enter the rider's full name.")
        return v

    @field_validator("mobile_number")
    @classmethod
    def _mobile(cls, v):                                  # FORMAT ONLY (same rule as the rest of Smart Boda); uniqueness is below
        ok, normalized, err = validate_mobile_number(v)
        if not ok:
            raise ValueError(err or "Enter a valid Kenyan mobile number, e.g. 0712345678.")
        return normalized


def _row(p: Pre, rider_status=None) -> dict:
    return {"id": str(p.id), "full_name": p.full_name, "mobile_number": p.mobile_number, "status": p.status,
            "rider_status": rider_status,                 # registration_status of the rider account once it exists
            "registered_at": p.registered_at.isoformat() if p.registered_at else None,
            "created_at": p.created_at.isoformat() if p.created_at else None}


@router.get("/phone-check")
def phone_check(phone: str, db: Session = Depends(get_db)):
    """Used by the form to show the result before the Administrator presses Save. Create enforces the same rule again."""
    ok, normalized, err = validate_mobile_number(phone)
    if not ok:
        raise HTTPException(400, err or "Enter a valid Kenyan mobile number.")
    c = find_phone_conflict(db, normalized)
    if c:
        return {"available": False, "mobile_number": normalized, "where": c["where"], "message": c["message"]}
    return {"available": True, "mobile_number": normalized, "message": "This number is available."}


@router.get("")
def list_individual_riders(q: str = None, status: str = None, page: int = Query(1, ge=1),
                           page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    qry = db.query(Pre, Rider.registration_status).outerjoin(Rider, Rider.id == Pre.registered_rider_id)
    if q and q.strip():
        conds = [Pre.full_name.ilike(f"%{q.strip()}%")]
        d = re.sub(r"\D", "", q)
        d = d[3:] if d.startswith("254") else d[1:] if d.startswith("0") else d
        if d:
            conds.append(Pre.phone_key.like(f"%{d[-9:]}%"))
        qry = qry.filter(or_(*conds))
    if status in (AWAITING, REGISTERED):
        qry = qry.filter(Pre.status == status)
    total = qry.count()
    rows = qry.order_by(Pre.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    counts = dict(db.query(Pre.status, func.count(Pre.id)).group_by(Pre.status).all())
    return {"total": total, "page": page, "page_size": page_size,
            "awaiting": counts.get(AWAITING, 0), "registered": counts.get(REGISTERED, 0),
            "items": [_row(p, rs) for p, rs in rows]}


@router.post("", status_code=201)
def create_individual_rider(body: IndividualRiderIn, db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    c = find_phone_conflict(db, body.mobile_number)
    if c:
        raise HTTPException(409, c["message"] + " Use a different number.")
    p = Pre(full_name=body.full_name, mobile_number=body.mobile_number, phone_key=phone_key(body.mobile_number),
            status=AWAITING, created_by_admin_id=admin.id)
    db.add(p)
    try:
        db.commit()
    except IntegrityError:                               # two saves at the same moment: the unique index wins
        db.rollback()
        c = find_phone_conflict(db, body.mobile_number)
        raise HTTPException(409, (c["message"] + " Use a different number.") if c else "This number could not be saved. Try again.")
    db.refresh(p)
    return _row(p)


@router.delete("/{pre_id}")
def remove_individual_rider(pre_id: RowId, db: Session = Depends(get_db)):
    p = db.get(Pre, pre_id)
    if not p:
        raise HTTPException(404, "Record not found.")
    if p.status != AWAITING:
        raise HTTPException(409, "This rider has already registered in the app, so the record cannot be removed.")
    db.delete(p)
    db.commit()
    return {"removed": True}
