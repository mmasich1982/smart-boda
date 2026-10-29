# backend/app/services/individual_rider_service.py
# INDIVIDUAL RIDERS (no Treasurer, no group). Everything that decides "is this number free / who is waiting" lives here,
# so the Administrator's page, Setup My Profile and group creation all use the same rules and the same mobile key
# (the last 9 digits, as in group_roles.phone_key and group_member_link_service.rider_mobile_key).
from datetime import datetime, timezone
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.boda_group import BodaGroup, GroupMember
from app.models.individual_rider import IndividualRiderPreRegistration as Pre, AWAITING, REGISTERED
from app.models.pin_recovery_request import PinRecoveryRequest
from app.models.rider import Rider
from app.services.group_member_link_service import rider_mobile_key
from app.services.group_roles import phone_key


def _digits_key(col):
    """SQL twin of phone_key() for any text column."""
    return func.right(func.regexp_replace(col, "[^0-9]", "", "g"), 9)


def find_preregistration(db: Session, phone):
    """The Administrator's record for this number, or None. A 100% match on the indexed phone_key (last 9 digits)."""
    k = phone_key(phone)
    if len(k) != 9:
        return None
    return db.query(Pre).filter(Pre.phone_key == k).first()


def find_phone_conflict(db: Session, phone):
    """None when the number exists NOWHERE in Smart Boda; otherwise {"where": code, "message": text for the Administrator}.
    Looks at: the rider table, earlier pre-registrations, group members (ANY status), group Treasurer phones (ANY status)
    and PIN-recovery requests. A rider's customers (Lipa Later) are third parties, not riders, so they are not checked."""
    k = phone_key(phone)
    if len(k) != 9:
        return None
    r = db.query(Rider).filter(rider_mobile_key() == k).first()
    if r:
        name = (r.full_name or "").strip() or "no name yet"
        return {"where": "rider", "message": f"This number already belongs to a rider account ({name}, status: {r.registration_status or 'pending'})."}
    p = db.query(Pre).filter(Pre.phone_key == k).first()
    if p:
        return {"where": "preregistration", "message": f"This number was already pre-registered as an individual rider ({p.full_name}) and is waiting for the rider to register in the app."}
    gm = (db.query(GroupMember, BodaGroup).join(BodaGroup, BodaGroup.id == GroupMember.group_id)
          .filter(GroupMember.phone_key == k).first())
    if gm:
        return {"where": "group_member", "message": f"This number is already registered as a member ({gm[0].full_name}) of the group \u201c{gm[1].group_name}\u201d by its Treasurer."}
    g = db.query(BodaGroup).filter(_digits_key(BodaGroup.treasurer_phone) == k).first()
    if g:
        return {"where": "treasurer", "message": f"This number is the Treasurer number of the group \u201c{g.group_name}\u201d."}
    if db.query(PinRecoveryRequest.id).filter(_digits_key(PinRecoveryRequest.mobile_number) == k).first():
        return {"where": "pin_recovery", "message": "This number appears in a PIN recovery request."}
    return None


def mark_registered(db: Session, rider) -> bool:
    """Call when the rider row is created / resumed in Setup My Profile: the waiting record becomes 'registered'.
    No flush/commit here: it rides the caller's transaction. Returns True when a pre-registration existed."""
    pre = find_preregistration(db, rider.mobile_number)
    if not pre:
        return False
    if pre.status != REGISTERED or pre.registered_rider_id != rider.id:
        pre.status, pre.registered_rider_id = REGISTERED, rider.id
        pre.registered_at = pre.registered_at or datetime.now(timezone.utc)
    return True


def is_unlinked_individual(db: Session, rider) -> bool:
    """True for a rider who has never been added to any group and is linked to no Treasurer (any status). Such a rider
    may still be named the Treasurer of a NEW group by the Administrator."""
    k = phone_key(rider.mobile_number)
    q = db.query(GroupMember.id).filter(GroupMember.linked_rider_id == rider.id)
    if db.query(q.exists()).scalar():
        return False
    if len(k) == 9 and db.query(db.query(GroupMember.id).filter(GroupMember.phone_key == k).exists()).scalar():
        return False
    return True
