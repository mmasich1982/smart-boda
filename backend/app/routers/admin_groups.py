# backend/app/routers/admin_groups.py
import re, secrets
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import require_admin
from app.models.admin_user import AdminUser
from app.models.boda_group import BodaGroup, GroupSlotRequest, AppNotification
from app.models.location_models import County, SubCounty, Ward

# Same guard style as payment_admin.py: every route below needs a logged-in admin.
router = APIRouter(prefix="/admin/groups", tags=["admin-groups"],
                   dependencies=[Depends(require_admin)])

PHONE_RE = re.compile(r'^(\+254|0)(7|1)[0-9]{8}$')   # identical rule to mobile_number.py
CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"          # no 0/O/1/I: easy to read aloud

def _phone(v: str) -> str:
    v = v.replace(" ", "")
    if not PHONE_RE.match(v):                          # FORMAT ONLY, never a uniqueness/match test
        raise ValueError("Enter a valid Kenyan number, e.g. 0712345678")
    return v

class GroupIn(BaseModel):
    group_name: str = Field(min_length=2, max_length=120)
    county_id: int
    sub_county_id: int
    ward_id: int
    stage_name: str = Field(min_length=2, max_length=120)
    approved_slots: int = Field(ge=1, le=1000)
    chair_name: str = Field(min_length=2, max_length=80)
    chair_phone: str
    treasurer_name: str = Field(min_length=2, max_length=80)
    treasurer_phone: str
    @field_validator("chair_phone", "treasurer_phone")
    @classmethod
    def _p(cls, v): return _phone(v)

class DecisionIn(BaseModel):
    approved_slots: Optional[int] = Field(default=None, ge=1, le=200)
    comment: Optional[str] = None

def _new_code(db: Session) -> str:
    for _ in range(10):
        code = "BG-" + "".join(secrets.choice(CODE_CHARS) for _ in range(6))
        if not db.query(BodaGroup.id).filter(BodaGroup.group_code == code).first():
            return code
    raise HTTPException(500, "Could not generate a unique group code. Try again.")

def _check_location(db: Session, d: GroupIn):
    # Server-side twin of the cascade: ward must belong to the sub-county, sub-county to the county.
    sc = db.query(SubCounty).filter(SubCounty.id == d.sub_county_id, SubCounty.county_id == d.county_id).first()
    w = db.query(Ward).filter(Ward.id == d.ward_id, Ward.sub_county_id == d.sub_county_id).first()
    if not sc or not w:
        raise HTTPException(422, "Sub-county or ward does not belong to the selected county.")

def _slots_used(db: Session, group_id) -> int:
    return 0  # PART 2 replaces this with a count of group_member rows (members added by the Treasurer)

def _row(db, g: BodaGroup) -> dict:
    c = db.get(County, g.county_id); s = db.get(SubCounty, g.sub_county_id); w = db.get(Ward, g.ward_id)
    used = _slots_used(db, g.id)
    return {"id": str(g.id), "group_code": g.group_code, "group_name": g.group_name,
            "county_id": g.county_id, "county": c.county_name if c else None,
            "sub_county_id": g.sub_county_id, "sub_county": s.sub_county_name if s else None,
            "ward_id": g.ward_id, "ward": w.ward_name if w else None,
            "stage_name": g.stage_name, "approved_slots": g.approved_slots, "slots_used": used,
            "slots_available": g.approved_slots - used,
            "chair_name": g.chair_name, "chair_phone": g.chair_phone,
            "treasurer_name": g.treasurer_name, "treasurer_phone": g.treasurer_phone,
            "registered_at": g.registered_at.isoformat() if g.registered_at else None,
            "status": g.status}

@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    total = db.query(func.count(BodaGroup.id)).scalar()
    active = db.query(func.count(BodaGroup.id)).filter(BodaGroup.status == "active").scalar()
    slots = db.query(func.coalesce(func.sum(BodaGroup.approved_slots), 0)).scalar()
    pending = db.query(func.count(GroupSlotRequest.id)).filter(GroupSlotRequest.status == "pending").scalar()
    return {"total_groups": total, "active_groups": active, "inactive_groups": total - active,
            "total_approved_slots": int(slots), "pending_slot_requests": pending}

@router.get("")
def list_groups(q: Optional[str] = None, status: Optional[str] = None,
                county_id: Optional[int] = None, page: int = Query(1, ge=1),
                page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    qry = db.query(BodaGroup)
    if q:
        like = f"%{q}%"
        qry = qry.filter(or_(BodaGroup.group_name.ilike(like), BodaGroup.group_code.ilike(like),
                             BodaGroup.stage_name.ilike(like)))
    if status in ("active", "inactive"): qry = qry.filter(BodaGroup.status == status)
    if county_id: qry = qry.filter(BodaGroup.county_id == county_id)
    total = qry.count()
    items = qry.order_by(BodaGroup.created_at.desc()).offset((page-1)*page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "items": [_row(db, g) for g in items]}

@router.post("", status_code=201)
def create_group(body: GroupIn, db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    _check_location(db, body)
    g = BodaGroup(**body.model_dump(), group_code=_new_code(db), status="active",
                  created_by_admin_id=admin.id)
    db.add(g)
    try: db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "A group with this name already exists in this ward.")
    db.refresh(g)
    return _row(db, g)

# ---- Slot-request queue (must be declared BEFORE /{group_id}) ----
@router.get("/slot-requests")
def slot_requests(status: str = "pending", db: Session = Depends(get_db)):
    rows = (db.query(GroupSlotRequest, BodaGroup).join(BodaGroup, BodaGroup.id == GroupSlotRequest.group_id)
            .filter(GroupSlotRequest.status == status).order_by(GroupSlotRequest.requested_at).all())
    return [{"id": str(r.id), "group_id": str(g.id), "group_code": g.group_code, "group_name": g.group_name,
             "stage_name": g.stage_name, "treasurer_name": g.treasurer_name,
             "current_slots": g.approved_slots, "slots_used": _slots_used(db, g.id),
             "requested_slots": r.requested_slots, "reason": r.reason, "status": r.status,
             "admin_comment": r.admin_comment, "requested_at": r.requested_at.isoformat()} for r, g in rows]

def _close_notifications(db, req_id, reason):
    db.query(AppNotification).filter(AppNotification.ref_type == "slot_request",
        AppNotification.ref_id == req_id, AppNotification.status == "active"
        ).update({"status": "completed", "completion_reason": reason,
                  "completed_at": datetime.now(timezone.utc)}, synchronize_session=False)

def _load_pending(db, req_id):
    r = db.query(GroupSlotRequest).filter(GroupSlotRequest.id == req_id).with_for_update().first()
    if not r: raise HTTPException(404, "Request not found")
    if r.status != "pending": raise HTTPException(409, "This request was already decided.")
    return r

@router.post("/slot-requests/{req_id}/approve")
def approve(req_id: str, body: DecisionIn, db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    r = _load_pending(db, req_id)
    g = db.query(BodaGroup).filter(BodaGroup.id == r.group_id).with_for_update().first()
    n = body.approved_slots or r.requested_slots
    g.approved_slots += n                       # the hard limit rises automatically
    r.status, r.decided_slots, r.admin_comment = "approved", n, body.comment
    r.decided_by_admin_id, r.decided_at = admin.id, datetime.now(timezone.utc)
    _close_notifications(db, r.id, "decided")   # the "request sent" notice is no longer relevant
    db.add(AppNotification(recipient_type="rider", recipient_id=r.requested_by_rider_id,
        kind="slot_request_approved", title="Extra member slots approved",
        body=f"{n} more member slots are now available for {g.group_name}. You can add members now.",
        ref_type="slot_request", ref_id=r.id))
    db.commit()
    return {"ok": True, "new_approved_slots": g.approved_slots}

@router.post("/slot-requests/{req_id}/decline")
def decline(req_id: str, body: DecisionIn, db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    if not body.comment or len(body.comment.strip()) < 5:
        raise HTTPException(422, "A reason of at least 5 characters is required to decline.")
    r = _load_pending(db, req_id)
    r.status, r.admin_comment = "declined", body.comment.strip()
    r.decided_by_admin_id, r.decided_at = admin.id, datetime.now(timezone.utc)
    _close_notifications(db, r.id, "decided")
    db.add(AppNotification(recipient_type="rider", recipient_id=r.requested_by_rider_id,
        kind="slot_request_declined", title="Slot request declined",
        body="Reason from Smart Boda Administrator: " + body.comment.strip(),
        ref_type="slot_request", ref_id=r.id))
    db.commit()
    return {"ok": True}

@router.get("/{group_id}")
def get_group(group_id: str, db: Session = Depends(get_db)):
    g = db.query(BodaGroup).filter(BodaGroup.id == group_id).first()
    if not g: raise HTTPException(404, "Group not found")
    return _row(db, g)

@router.put("/{group_id}")
def update_group(group_id: str, body: GroupIn, db: Session = Depends(get_db)):
    g = db.query(BodaGroup).filter(BodaGroup.id == group_id).first()
    if not g: raise HTTPException(404, "Group not found")
    if body.approved_slots < _slots_used(db, g.id):
        raise HTTPException(422, "Approved slots cannot be lower than members already enrolled.")
    _check_location(db, body)
    for k, v in body.model_dump().items(): setattr(g, k, v)   # group_code is never editable
    db.commit(); db.refresh(g)
    return _row(db, g)

@router.patch("/{group_id}/status")
def set_status(group_id: str, active: bool, db: Session = Depends(get_db)):
    g = db.query(BodaGroup).filter(BodaGroup.id == group_id).first()
    if not g: raise HTTPException(404, "Group not found")
    g.status = "active" if active else "inactive"
    db.commit()
    return _row(db, g)