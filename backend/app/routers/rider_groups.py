# backend/app/routers/rider_groups.py
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_rider
from app.models.rider import Rider
from app.models.boda_group import BodaGroup, GroupMember, GroupSlotRequest, AppNotification
from app.models.chama_finance import ChamaCategory, ChamaConfig, ChamaLoan, ChamaMgrCircle, ChamaMgrHand
from app.models.location_models import County, SubCounty, Ward
from app.services.group_member_link_service import find_rider_id_by_mobile, mask_phone
from app.services.group_roles import phone_key
from app.services.chama_finance_service import new_ref, ensure_config
from app.services import slot_pool_service as POOL
from app.services.group_roles import treasurer_group, treasurer_groups, same_phone
import re
from uuid import UUID                  # request bodies
from uuid import UUID as RowId   # NOT "UUID": star-imports of the models bring SQLAlchemy's UUID column type into scope

# Bearer-token rider auth, exactly as the other rider routers use it.
router = APIRouter(prefix="/groups", tags=["rider-groups"])
notif_router = APIRouter(prefix="/notifications", tags=["notifications"])
PHONE_RE = re.compile(r"^(\+254|0)(7|1)[0-9]{8}$")

class CodeIn(BaseModel):
    group_code: str = Field(min_length=4, max_length=12)

class CircleSeat(BaseModel):
    circle_id: UUID
    hands: int = Field(default=1, ge=1, le=2)                              # 2 = double turn

class MemberIn(BaseModel):
    full_name: str = Field(min_length=3, max_length=80)
    phone: str
    category_id: Optional[UUID] = None                                   # Table Banking
    opening_savings: Optional[Decimal] = Field(default=None, ge=0, le=10000000)
    has_active_loan: Optional[bool] = None
    loan_principal: Optional[Decimal] = Field(default=None, gt=0, le=10000000)
    loan_outstanding: Optional[Decimal] = Field(default=None, gt=0, le=10000000)
    loan_interest_outstanding: Optional[Decimal] = Field(default=None, ge=0, le=10000000)
    loan_due_date: Optional[date] = None
    circles: Optional[list["CircleSeat"]] = None                          # Merry-Go-Round: which circles, single or double turn
    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        v = re.sub(r"[\s-]", "", v)
        if not PHONE_RE.match(v):                                        # FORMAT ONLY
            raise ValueError("Enter a valid mobile number, e.g. 0712345678.")
        return v

class SlotReqIn(BaseModel):
    requested_slots: int = Field(ge=1, le=200)
    reason: str = Field(min_length=5)

def _used(db, g) -> int:
    """Slots used by the group's pool (the pair shares one allowance; a rider in both groups uses one slot)."""
    return POOL.slots_used(db, g)

def _payload(db, g: BodaGroup) -> dict:
    c, s, w = db.get(County, g.county_id), db.get(SubCounty, g.sub_county_id), db.get(Ward, g.ward_id)
    used = _used(db, g)
    pt = POOL.partner(db, g)
    return {"id": str(g.id), "group_code": g.group_code, "group_name": g.group_name,
            "county": c.county_name, "sub_county": s.sub_county_name, "ward": w.ward_name,
            "stage_name": g.stage_name, "approved_slots": POOL.pool_allowance(db, g),
            "slots_used": used, "slots_available": POOL.pool_allowance(db, g) - used,
            "slots_shared": bool(pt), "shared_with": pt.group_name if pt else None,
            "treasurer_name": g.treasurer_name, "treasurer_phone": g.treasurer_phone,
            "status": g.status}

def _my_group(db: Session, rider: Rider, lock: bool = False, group_id=None) -> BodaGroup:
    # The role is enforced on the SERVER and comes from the group itself (treasurer_rider_id), never from a flag the rider set.
    # A Treasurer may run several groups: group_id picks one (without it, the oldest is used).
    g = treasurer_group(db, rider, lock, group_id)
    if not g:
        raise HTTPException(404, "Enter your Chama Code first.")
    return g

@router.post("/validate-code")
def validate_code(body: CodeIn, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Activates the Treasurer named by the Smart Boda Administrator. Two things must both be true: the code is right
    AND the rider's verified phone is the Treasurer phone the administrator recorded for this group. A code that
    leaks therefore cannot be used by anyone else."""
    g = db.query(BodaGroup).filter(BodaGroup.group_code == body.group_code.strip().upper()).with_for_update().first()
    if not g:
        raise HTTPException(404, "That Chama Code was not found. Check it with your Smart Boda Administrator.")
    if g.status != "active":
        raise HTTPException(403, "This group is inactive. Contact the Smart Boda Administrator.")
    # Phone first, so a stranger gets the same answer whether or not the group has already been claimed.
    if not same_phone(g.treasurer_phone, rider.mobile_number):
        raise HTTPException(403, "This Chama Code was issued to a different Treasurer. Contact the Smart Boda Administrator.")
    if g.treasurer_rider_id and g.treasurer_rider_id != rider.id:
        raise HTTPException(409, "This group already has a registered Treasurer. Contact the Smart Boda Administrator.")
    pair = POOL.claim_pair(db, g, rider)                 # one code, once: the Treasurer's pair (or single group) is activated together
    for x in pair: ensure_config(db, x)
    rider.is_treasurer = True                            # mirror of the fact above, kept for older app versions
    db.commit()
    return {**_payload(db, g), "groups": [_payload(db, x) for x in pair]}

@router.get("/managed")
def managed_groups(db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Every group this rider is the Treasurer of: drives the Merry-Go-Round / Table Banking tabs of Manage Chama."""
    out = []
    for g in treasurer_groups(db, rider):
        cfg = db.get(ChamaConfig, g.id)
        out.append({**_payload(db, g), "group_type": (cfg.chama_type if cfg else g.group_type)})
    return out

@router.get("/mine")
def my_group(group_id: Optional[RowId] = Query(None), db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g = _my_group(db, rider, group_id=group_id)
    cfg = db.get(ChamaConfig, g.id)
    return {**_payload(db, g), "group_type": (cfg.chama_type if cfg else g.group_type)}

@router.get("/mine/members")
def list_members(group_id: Optional[RowId] = Query(None), db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g = _my_group(db, rider, group_id=group_id)
    rows = db.query(GroupMember).filter(GroupMember.group_id == g.id, GroupMember.status == "active")\
             .order_by(GroupMember.created_at).all()
    seats = {}
    for h, c in db.query(ChamaMgrHand, ChamaMgrCircle).join(ChamaMgrCircle, ChamaMgrCircle.id == ChamaMgrHand.circle_id)\
                  .filter(ChamaMgrCircle.group_id == g.id).all():
        d = seats.setdefault(h.member_id, {}).setdefault(c.id, {"circle_id": str(c.id), "circle": c.name, "hands": 0, "turns": []})
        d["hands"] += 1; d["turns"].append(h.turn_no)
    return [{"id": str(m.id), "full_name": m.full_name, "phone": m.phone,
             "link_status": m.link_status,
             "category_id": str(m.category_id) if m.category_id else None,
             "opening_savings": m.opening_savings, "circles": list(seats.get(m.id, {}).values())} for m in rows]

def _complete(db, **flt):
    db.query(AppNotification).filter_by(status="active", **flt).update(
        {"status": "completed", "completion_reason": "action_done",
         "completed_at": datetime.now(timezone.utc)}, synchronize_session=False)

@router.post("/mine/members", status_code=201)
def add_member(body: MemberIn, group_id: Optional[RowId] = Query(None), db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g = _my_group(db, rider, lock=True, group_id=group_id)               # row lock: two taps cannot both take the last slot
    if g.status != "active":
        raise HTTPException(403, "This group is inactive. Contact the Smart Boda Administrator.")
    cfg = ensure_config(db, g)
    if not cfg:
        raise HTTPException(409, "Set up your Chama first (choose the Chama type).")
    key = phone_key(body.phone)                                          # the rider's mobile number is THE key
    # THE HARD LIMIT, counted on the pool. A bike that already holds a slot in the pair needs no new slot.
    if not POOL.has_slot(db, g, key) and _used(db, g) >= POOL.pool_allowance(db, g):
        raise HTTPException(409, "Member limit reached. Request more slots to add members.")
    # A rider may belong to SEVERAL groups. They can be in any one group only once.
    if db.query(GroupMember.id).filter(GroupMember.group_id == g.id, GroupMember.phone_key == key, GroupMember.status == "active").first():
        raise HTTPException(409, "This mobile number is already registered in this group.")

    cat_id, seats = None, []
    if cfg.chama_type == "tb":
        cats = db.query(ChamaCategory).filter_by(group_id=g.id, is_active=True).all()
        if cats:
            cat = next((c for c in cats if c.id == body.category_id), None)
            if not cat: raise HTTPException(422, "Select a Chama category.")
            if not cat.amount: raise HTTPException(422, "Set the contribution amount for this category first.")
            cat_id = cat.id
        if body.opening_savings is None:
            raise HTTPException(422, "Enter the member's current savings balance (enter 0 if none).")
        if body.has_active_loan is None:
            raise HTTPException(422, "Answer: Does this member currently have an active loan?")
        details = [body.loan_principal, body.loan_outstanding, body.loan_due_date]
        if body.has_active_loan and (not all(details) or body.loan_interest_outstanding is None):
            raise HTTPException(422, "Enter the loan principal, the amount still owed, the interest still owed (0 if none) and the due date.")
        if body.has_active_loan and body.loan_interest_outstanding >= body.loan_outstanding:
            raise HTTPException(422, "Interest still owed must be less than the total amount still owed.")
        if not body.has_active_loan and (any(details) or body.loan_interest_outstanding is not None):
            raise HTTPException(422, "Remove the loan details, or answer Yes to the loan question.")
    else:                                                                # Merry-Go-Round
        if body.opening_savings or body.has_active_loan or body.loan_principal:
            raise HTTPException(422, "Opening savings and loans do not apply to a Merry-Go-Round Chama.")
        for seat in body.circles or []:                                  # optional: put the member in a circle right away
            c = db.query(ChamaMgrCircle).filter_by(id=seat.circle_id, group_id=g.id).first()
            if not c: raise HTTPException(422, "Choose a circle of this group.")
            seats.append((c, seat.hands))

    linked = find_rider_id_by_mobile(db, body.phone)                     # mobile-number match
    now = datetime.now(timezone.utc)
    tb = cfg.chama_type == "tb"
    m = GroupMember(group_id=g.id, treasurer_rider_id=rider.id, full_name=body.full_name.strip(),
        phone=body.phone, phone_key=key, category_id=cat_id,
        linked_rider_id=linked, link_status="linked" if linked else "awaiting_signup",
        linked_at=now if linked else None,
        opening_savings=(body.opening_savings or 0) if tb else 0,
        had_active_loan=body.has_active_loan if tb else None)
    db.add(m); db.flush()
    if tb and body.has_active_loan:                                      # historical loan migration
        db.add(ChamaLoan(reference=new_ref("TBL"), application_id=None, group_id=g.id, member_id=m.id,
            principal=body.loan_principal, opening_principal=body.loan_principal, rate_pct=0, months=1,
            interest=body.loan_interest_outstanding, opening_interest=body.loan_interest_outstanding,
            total=body.loan_outstanding, installment=body.loan_outstanding, paid=0,
            status="active", is_migrated=True, due_date=body.loan_due_date, disbursed_at=now))
    for c, hands in seats:                                               # new people join a running circle from its next cycle
        top = db.query(func.max(ChamaMgrHand.turn_no)).filter_by(circle_id=c.id).scalar() or 0
        for no in range(1, hands + 1):
            running = c.status == "active"
            db.add(ChamaMgrHand(circle_id=c.id, member_id=m.id, hand_no=no,
                                turn_no=None if running else top + no, joins_next_cycle=running))
    _complete(db, recipient_type="rider", recipient_id=rider.id, kind="slot_request_approved")
    try:
        db.commit()
    except IntegrityError:                                               # lost a race on mobile number / turn / loan
        db.rollback()
        raise HTTPException(409, "This member could not be saved because another change happened at the same time. Try again.")
    return {"id": str(m.id), "link_status": m.link_status,
            "slots_available": POOL.pool_allowance(db, g) - _used(db, g)}

@router.post("/mine/slot-requests", status_code=201)
def request_slots(body: SlotReqIn, group_id: Optional[RowId] = Query(None), db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g = _my_group(db, rider, lock=True, group_id=group_id)
    left = POOL.pool_allowance(db, g) - _used(db, g)
    if left > 0:
        raise HTTPException(409, f"You still have {left} available slot{'s' if left > 1 else ''}. Request more only after all slots are used.")
    if db.query(GroupSlotRequest.id).filter(GroupSlotRequest.group_id.in_([x.id for x in POOL.pool_groups(db, g)]),
                                            GroupSlotRequest.status == "pending").first():
        raise HTTPException(409, "You already have a request awaiting the Smart Boda Administrator.")
    r = GroupSlotRequest(group_id=g.id, requested_by_rider_id=rider.id,
                         requested_slots=body.requested_slots, reason=body.reason.strip())
    db.add(r); db.flush()
    db.add(AppNotification(recipient_type="admin", recipient_id=None, kind="slot_request_incoming",
        title="New member slot request", body=f"{g.group_name} asks for {body.requested_slots} more slots.",
        ref_type="slot_request", ref_id=r.id))
    db.add(AppNotification(recipient_type="rider", recipient_id=rider.id, kind="slot_request_pending",
        title="Request sent", body="Waiting for the Smart Boda Administrator to review your request.",
        ref_type="slot_request", ref_id=r.id))
    db.commit()
    return {"id": str(r.id), "status": "pending"}

@router.get("/mine/slot-requests/latest")
def latest_request(group_id: Optional[RowId] = Query(None), db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g = _my_group(db, rider, group_id=group_id)
    pend = db.query(GroupSlotRequest).filter_by(group_id=g.id, status="pending").first()
    last = db.query(GroupSlotRequest).filter(GroupSlotRequest.group_id == g.id, GroupSlotRequest.status != "pending")\
             .order_by(GroupSlotRequest.decided_at.desc()).first()
    note = None
    if last:
        note = db.query(AppNotification).filter_by(ref_type="slot_request", ref_id=last.id, status="active",
                                                   recipient_type="rider").first()
    return {"pending": {"slots": pend.requested_slots, "reason": pend.reason} if pend else None,
            "last": {"ok": last.status == "approved", "slots": last.decided_slots or last.requested_slots,
                     "comment": last.admin_comment, "notification_id": str(note.id) if note else None} if last else None}

# ---- Notifications (rider side): only ACTIVE items are ever returned ----
@notif_router.get("")
def my_notifications(db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    rows = db.query(AppNotification).filter_by(recipient_type="rider", recipient_id=rider.id, status="active")\
             .order_by(AppNotification.created_at.desc()).all()
    return [{"id": str(n.id), "kind": n.kind, "title": n.title, "body": n.body, "created_at": n.created_at.isoformat()} for n in rows]

@notif_router.post("/{nid}/complete")
def complete_notification(nid: RowId, db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """Safe to repeat. The rider app may send this acknowledgement through its offline SyncQueue, which retries
    until it succeeds, so a notice that is already completed answers OK and keeps its original completion reason
    (e.g. "action_done"). An id that does not exist is still a clean 404 (see tests_groups/test_id_validation.py);
    the app only queues acknowledgements for notices it has just received from the server, and notices are
    completed, never deleted, so a queued acknowledgement always has a notice to land on."""
    n = db.query(AppNotification).filter_by(id=nid, recipient_type="rider", recipient_id=rider.id).first()
    if not n: raise HTTPException(404, "Notification not found")
    if n.status == "active":                             # never overwrite an earlier reason such as "action_done"
        n.status, n.completion_reason, n.completed_at = "completed", "acknowledged", datetime.now(timezone.utc)
        db.commit()
    return {"id": nid, "ok": True}