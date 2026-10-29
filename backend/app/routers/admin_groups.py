# backend/app/routers/admin_groups.py
import re, secrets
from uuid import UUID as RowId   # NOT "UUID": star-imports of the models bring SQLAlchemy's UUID column type into scope
from datetime import datetime, timezone
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import require_admin
from app.models.admin_user import AdminUser
from app.models.boda_group import BodaGroup, GroupSlotRequest, AppNotification, GroupMember
from app.models.chama_finance import ChamaConfig, ChamaLedger, ChamaContribution, ChamaLoan, ChamaLoanPayment
from app.models.location_models import County, SubCounty, Ward
from app.services import slot_pool_service as POOL
from app.services.group_roles import same_phone, phone_key
from app.services.group_member_link_service import rider_mobile_key
from app.models.rider import Rider
from app.services.individual_rider_service import is_unlinked_individual

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
    group_type: Literal["mgr", "tb"]                      # Merry-Go-Round or Table Banking, chosen by the administrator (required)
    approved_slots: int = Field(ge=1, le=1000)
    treasurer_name: str = Field(min_length=2, max_length=80)
    treasurer_phone: str
    @field_validator("treasurer_phone")
    @classmethod
    def _p(cls, v): return _phone(v)                       # FORMAT ONLY

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

def _own_members(db: Session, group_id) -> int:
    return db.query(func.count(GroupMember.id)).filter(
        GroupMember.group_id == group_id, GroupMember.status == "active").scalar()

def _slots_used(db: Session, g) -> int:
    return POOL.slots_used(db, g)                      # the pair shares one pool; a rider in both uses one slot

def _row(db, g: BodaGroup) -> dict:
    c = db.get(County, g.county_id); s = db.get(SubCounty, g.sub_county_id); w = db.get(Ward, g.ward_id)
    used = _slots_used(db, g)
    pt = POOL.partner(db, g)
    return {"id": str(g.id), "slot_pool_id": str(g.slot_pool_id) if g.slot_pool_id else None,
            "shared_with": pt.group_name if pt else None, "shared_with_id": str(pt.id) if pt else None,
            "treasurer_registered": bool(g.treasurer_rider_id), "group_code": g.group_code, "group_name": g.group_name,
            "county_id": g.county_id, "county": c.county_name if c else None,
            "sub_county_id": g.sub_county_id, "sub_county": s.sub_county_name if s else None,
            "ward_id": g.ward_id, "ward": w.ward_name if w else None,
            "stage_name": g.stage_name, "group_type": g.group_type, "approved_slots": POOL.pool_allowance(db, g), "slots_used": used,
            "slots_available": POOL.pool_allowance(db, g) - used,
            "treasurer_name": g.treasurer_name, "treasurer_phone": g.treasurer_phone,
            "registered_at": g.registered_at.isoformat() if g.registered_at else None,
            "status": g.status}

@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    total = db.query(func.count(BodaGroup.id)).scalar()
    active = db.query(func.count(BodaGroup.id)).filter(BodaGroup.status == "active").scalar()
    own = db.query(func.coalesce(func.sum(BodaGroup.approved_slots), 0)).filter(BodaGroup.slot_pool_id.is_(None)).scalar()
    pooled = sum(n for (n,) in db.query(func.max(BodaGroup.approved_slots)).filter(BodaGroup.slot_pool_id.isnot(None))
                 .group_by(BodaGroup.slot_pool_id).all())          # a shared pool counts ONCE
    slots = (own or 0) + pooled
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
    _require_unused_phone(db, body.treasurer_phone, body.group_type)       # a new Treasurer number must be unique (no existing rider)
    POOL.require_free_type(db, body.treasurer_phone, body.group_type)      # one group of each type per Treasurer
    g = BodaGroup(**body.model_dump(), group_code=_new_code(db), status="active",
                  created_by_admin_id=admin.id)
    db.add(g)
    try:
        db.flush()
        db.add(ChamaConfig(group_id=g.id, chama_type=g.group_type))         # settings exist from day one
        POOL.relink_treasurer(db, g.treasurer_phone)                         # a Merry-Go-Round + Table Banking pair is linked automatically
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "A group with this name already exists in this ward.")
    db.refresh(g)
    return _row(db, g)

# ---- Treasurer phone check (must be declared BEFORE /{group_id}) ----
TYPE_NAME = {"mgr": "Merry-Go-Round", "tb": "Table Banking"}

def _rider_with_phone(db: Session, phone):
    """The rider account that already owns this number (matched on the last 9 digits), or None."""
    k = phone_key(str(phone or "").replace(" ", ""))
    if len(k) != 9:
        return None
    return db.query(Rider).filter(rider_mobile_key() == k).first()

def _pair_partner(db: Session, phone, group_type, exclude_id=None):
    """The ACTIVE group of the OTHER type already run by this Treasurer phone, or None. A new group of `group_type`
    for the same Treasurer would form a Merry-Go-Round + Table Banking pair with it (same rule as slot_pool_service.relink_treasurer)."""
    if group_type not in TYPE_NAME:
        return None
    q = db.query(BodaGroup).filter(BodaGroup.status == "active", BodaGroup.group_type != group_type,
                                   BodaGroup.group_type.in_(tuple(TYPE_NAME)))
    if exclude_id is not None:
        q = q.filter(BodaGroup.id != exclude_id)
    return next((x for x in q.all() if same_phone(x.treasurer_phone, phone)), None)

def _phone_taken_message(r: Rider) -> str:
    name = (r.full_name or "").strip() or "no name yet"
    return (f"This number already has an account ({name}, status: {r.registration_status or 'pending'}). "
            "The Treasurer will log in, not set up. Every new Treasurer must have a unique number, "
            "unless this is the same Treasurer's second group of the other type (Merry-Go-Round + Table Banking).")

def _require_unused_phone(db: Session, phone, group_type, exclude_id=None):
    """BLOCKS saving: a newly assigned Treasurer phone must not already belong to a rider account.
    The ONE exception is a pair: the same Treasurer already runs an active group of the OTHER type."""
    r = _rider_with_phone(db, phone)
    if not r:
        return
    if _pair_partner(db, phone, group_type, exclude_id):
        return                                                         # allowed: completes a Merry-Go-Round + Table Banking pair
    POOL.require_free_type(db, phone, group_type, exclude_id)          # clearer message when they already run a group of THIS type
    if is_unlinked_individual(db, r):
        return                                                         # allowed: an individual rider (in no group, linked to no Treasurer) may become a Treasurer
    raise HTTPException(409, _phone_taken_message(r))

@router.get("/phone-check")
def phone_check(phone: str, group_type: Optional[str] = None, exclude_group_id: Optional[RowId] = None,
                db: Session = Depends(get_db)):
    """Used by the form to show the result before the administrator presses Save. The same rule is enforced
    again on create and update, so this check can never be bypassed."""
    r = _rider_with_phone(db, phone)
    if not r:
        return {"has_account": False}
    name = (r.full_name or "").strip() or "no name yet"
    base = {"has_account": True, "rider_name": name, "status": r.registration_status or "pending"}
    pt = _pair_partner(db, phone, group_type, exclude_group_id)
    if pt:
        same = POOL.same_type_conflict(db, phone, group_type, exclude_group_id)
        if same:                                                       # already runs a group of this type: still blocked
            return {**base, "pair_ok": False,
                    "message": f"This Treasurer ({name}) already runs a {TYPE_NAME[group_type]} group ({same.group_name}). A Treasurer can run one group of each type."}
        return {**base, "pair_ok": True, "pair_group_name": pt.group_name, "pair_group_type": pt.group_type,
                "message": (f"This number belongs to {name}, who already runs the {TYPE_NAME[pt.group_type]} group "
                            f"\u201c{pt.group_name}\u201d. This new group will be paired with it and share its member-slot pool.")}
    same = POOL.same_type_conflict(db, phone, group_type, exclude_group_id)
    if same:
        return {**base, "pair_ok": False,
                "message": f"This Treasurer ({name}) already runs a {TYPE_NAME[group_type]} group ({same.group_name}). A Treasurer can run one group of each type."}
    if is_unlinked_individual(db, r):                                  # shown in green: this number can be used
        return {**base, "pair_ok": True,
                "message": f"This number belongs to {name}, an individual rider who is in no group. They can be named the Treasurer of this group."}
    return {**base, "pair_ok": False, "message": _phone_taken_message(r)}

# ---- Slot-request queue (must be declared BEFORE /{group_id}) ----
@router.get("/slot-requests")
def slot_requests(status: str = "pending", db: Session = Depends(get_db)):
    rows = (db.query(GroupSlotRequest, BodaGroup).join(BodaGroup, BodaGroup.id == GroupSlotRequest.group_id)
            .filter(GroupSlotRequest.status == status).order_by(GroupSlotRequest.requested_at).all())
    return [{"id": str(r.id), "group_id": str(g.id), "group_code": g.group_code, "group_name": g.group_name,
             "stage_name": g.stage_name, "treasurer_name": g.treasurer_name,
             "current_slots": POOL.pool_allowance(db, g), "slots_used": _slots_used(db, g),
             "shared_with": (POOL.partner(db, g).group_name if POOL.partner(db, g) else None),
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
def approve(req_id: RowId, body: DecisionIn, db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    r = _load_pending(db, req_id)
    g = db.query(BodaGroup).filter(BodaGroup.id == r.group_id).with_for_update().first()
    n = body.approved_slots or r.requested_slots
    POOL.set_approved(db, g, POOL.pool_allowance(db, g) + n)     # the hard limit rises automatically (for the whole pool)
    r.status, r.decided_slots, r.admin_comment = "approved", n, body.comment
    r.decided_by_admin_id, r.decided_at = admin.id, datetime.now(timezone.utc)
    _close_notifications(db, r.id, "decided")   # the "request sent" notice is no longer relevant
    db.add(AppNotification(recipient_type="rider", recipient_id=r.requested_by_rider_id,
        kind="slot_request_approved", title="Extra member slots approved",
        body=f"{n} more member slots are now available for {g.group_name}. You can add members now.",
        ref_type="slot_request", ref_id=r.id))
    db.commit()
    return {"ok": True, "new_approved_slots": POOL.pool_allowance(db, g)}

@router.post("/slot-requests/{req_id}/decline")
def decline(req_id: RowId, body: DecisionIn, db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
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

@router.get("/{group_id}/finance")
def group_finance(group_id: RowId, db: Session = Depends(get_db)):
    g = db.query(BodaGroup).filter(BodaGroup.id == group_id).first()
    if not g: raise HTTPException(404, "Group not found")
    cfg = db.get(ChamaConfig, g.id)
    def s(d): return db.query(func.coalesce(func.sum(ChamaLedger.amount), 0)).filter(
        ChamaLedger.group_id == g.id, ChamaLedger.direction == d).scalar()
    return {"configured": bool(cfg), "money_in": s("in"), "money_out": s("out"),
            "pool": (cfg.opening_pool if cfg else 0) + s("in") - s("out"),
            "active_loans": db.query(func.count(ChamaLoan.id)).filter_by(group_id=g.id, status="active").scalar(),
            "pending_confirmations": db.query(func.count(ChamaContribution.id)).filter_by(group_id=g.id, status="pending").scalar()
                + db.query(func.count(ChamaLoanPayment.id)).filter_by(group_id=g.id, status="pending").scalar()}

@router.get("/{group_id}")
def get_group(group_id: RowId, db: Session = Depends(get_db)):
    g = db.query(BodaGroup).filter(BodaGroup.id == group_id).first()
    if not g: raise HTTPException(404, "Group not found")
    return _row(db, g)

@router.put("/{group_id}")
def update_group(group_id: RowId, body: GroupIn, db: Session = Depends(get_db)):
    g = db.query(BodaGroup).filter(BodaGroup.id == group_id).with_for_update().first()
    if not g: raise HTTPException(404, "Group not found")
    if body.approved_slots < POOL.slots_used(db, g):
        raise HTTPException(422, "Approved slots cannot be lower than members already enrolled.")
    _check_location(db, body)
    if body.group_type != g.group_type and _own_members(db, g.id):
        raise HTTPException(409, "This group already has members, so its type cannot change.")
    if body.group_type != g.group_type:
        POOL.require_free_type(db, body.treasurer_phone, body.group_type, exclude_id=g.id)
    old_phone = g.treasurer_phone
    if not same_phone(body.treasurer_phone, old_phone):
        _require_unused_phone(db, body.treasurer_phone, body.group_type, exclude_id=g.id)   # only when the number is being changed
    person_changed = (body.treasurer_name != g.treasurer_name) or not same_phone(body.treasurer_phone, old_phone)
    if body.group_type != g.group_type:
        POOL.unlink_all(db, g)                                           # a type change leaves the old pair
    data = body.model_dump()
    treasurer_name, treasurer_phone = data.pop("treasurer_name"), data.pop("treasurer_phone")
    approved = data.pop("approved_slots")
    for k, v in data.items(): setattr(g, k, v)                           # group_code is never editable
    cfg = db.get(ChamaConfig, g.id)
    if cfg: cfg.chama_type = body.group_type
    else: db.add(ChamaConfig(group_id=g.id, chama_type=body.group_type))
    if person_changed:
        POOL.hand_over(db, g, treasurer_name, treasurer_phone)          # the new Treasurer inherits BOTH groups of the pair
    POOL.set_approved(db, g, approved)                                   # one allowance for the pair (or just this group)
    POOL.relink_treasurer(db, g.treasurer_phone)
    db.commit(); db.refresh(g)
    return _row(db, g)

@router.patch("/{group_id}/status")
def set_status(group_id: RowId, active: bool, db: Session = Depends(get_db)):
    g = db.query(BodaGroup).filter(BodaGroup.id == group_id).with_for_update().first()
    if not g: raise HTTPException(404, "Group not found")
    if active and g.status != "active":
        POOL.require_free_type(db, g.treasurer_phone, g.group_type, exclude_id=g.id)
    if not active: POOL.unlink_all(db, g)                                # the pair link ends when one group is switched off
    g.status = "active" if active else "inactive"
    POOL.relink_treasurer(db, g.treasurer_phone)
    db.commit()
    return _row(db, g)