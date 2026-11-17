# backend/app/routers/admin_business_types.py
# SMART BIZNA (admin side): maintain the Business Type list shown in Setup My Profile, as master data (like fuel types).
#   GET   /admin/business-types        -> every type, active or not, with how many businesses use it
#   POST  /admin/business-types        -> add a type (the code is made from the name)
#   PATCH /admin/business-types/{id}   -> rename, switch on/off, change the order
# A type is never deleted (businesses already use it): switch it off and it disappears from the app's list for NEW users only.
# At least one type must stay on, because Setup My Profile needs something to choose from.
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.auth import require_admin
from app.database import get_db
from app.models.business import Business, BusinessTypeMaster

router = APIRouter(prefix="/admin/business-types", tags=["admin-business-types"], dependencies=[Depends(require_admin)])


def _clean(v):
    v = re.sub(r"\s+", " ", v or "").strip()
    if len(v) < 2:
        raise ValueError("Enter a name of at least 2 characters.")
    return v


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:30] or "type"


class TypeIn(BaseModel):
    display_name: str = Field(min_length=2, max_length=60)
    sort_order: Optional[int] = Field(default=None, ge=0, le=9999)

    @field_validator("display_name")
    @classmethod
    def _n(cls, v):
        return _clean(v)


class TypePatch(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=2, max_length=60)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = Field(default=None, ge=0, le=9999)

    @field_validator("display_name")
    @classmethod
    def _n(cls, v):
        return None if v is None else _clean(v)


def _rows(db: Session):
    used = dict(db.query(Business.business_type_code, func.count(Business.id)).filter(Business.business_type_code.isnot(None))
                .group_by(Business.business_type_code).all())
    return [{"id": t.id, "code": t.code, "display_name": t.display_name, "is_active": bool(t.is_active), "sort_order": t.sort_order or 0,
             "businesses_using": used.get(t.code, 0)}
            for t in db.query(BusinessTypeMaster).order_by(BusinessTypeMaster.sort_order, BusinessTypeMaster.id).all()]


def _name_taken(db: Session, name: str, exclude_id=None) -> bool:
    q = db.query(BusinessTypeMaster.id).filter(func.lower(BusinessTypeMaster.display_name) == name.lower())
    if exclude_id is not None:
        q = q.filter(BusinessTypeMaster.id != exclude_id)
    return db.query(q.exists()).scalar()


@router.get("")
def list_types(db: Session = Depends(get_db)):
    rows = _rows(db)
    return {"total": len(rows), "active": sum(r["is_active"] for r in rows), "items": rows}


@router.post("", status_code=201)
def add_type(body: TypeIn, db: Session = Depends(get_db)):
    if _name_taken(db, body.display_name):
        raise HTTPException(409, "A business type with this name already exists.")
    code, i = _slug(body.display_name), 2
    while db.query(BusinessTypeMaster.id).filter_by(code=code).first():     # two names can make the same code: keep it unique
        code, i = f"{_slug(body.display_name)[:26]}_{i}", i + 1
    order = body.sort_order if body.sort_order is not None else (db.query(func.max(BusinessTypeMaster.sort_order)).scalar() or 0) + 1
    t = BusinessTypeMaster(code=code, display_name=body.display_name, is_active=True, sort_order=order)
    db.add(t)
    db.commit()
    return next(r for r in _rows(db) if r["id"] == t.id)


@router.patch("/{type_id}")
def update_type(type_id: int, body: TypePatch, db: Session = Depends(get_db)):
    t = db.get(BusinessTypeMaster, type_id)
    if not t:
        raise HTTPException(404, "Business type not found.")
    sent = body.model_fields_set
    if "display_name" in sent and body.display_name is not None:
        if _name_taken(db, body.display_name, exclude_id=t.id):
            raise HTTPException(409, "A business type with this name already exists.")
        t.display_name = body.display_name
    if "sort_order" in sent and body.sort_order is not None:
        t.sort_order = body.sort_order
    if "is_active" in sent and body.is_active is not None:
        if not body.is_active and t.is_active:
            others = db.query(BusinessTypeMaster.id).filter(BusinessTypeMaster.is_active.is_(True), BusinessTypeMaster.id != t.id).first()
            if not others:
                raise HTTPException(409, "At least one business type must stay on, because people choose from this list when they set up.")
        t.is_active = body.is_active
    db.commit()
    return next(r for r in _rows(db) if r["id"] == t.id)
