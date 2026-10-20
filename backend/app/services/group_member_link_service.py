# backend/app/services/group_member_link_service.py
# A rider is linked to the groups that registered them by MOBILE NUMBER only (the last 9 digits).
from datetime import datetime, timezone
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.boda_group import GroupMember
from app.models.rider import Rider
from app.services.group_roles import phone_key

def rider_mobile_key():
    """SQL twin of phone_key(): the last 9 digits of rider.mobile_number (indexed by 002_mobile_match_index.sql)."""
    return func.right(func.regexp_replace(Rider.mobile_number, "[^0-9]", "", "g"), 9)

def find_rider_id_by_mobile(db: Session, phone):
    """The rider account that owns this mobile number, if any."""
    k = phone_key(phone)
    if len(k) != 9: return None
    r = db.query(Rider.id).filter(rider_mobile_key() == k).first()
    return r[0] if r else None

def mask_phone(phone) -> str:
    """0712 ••• 678: enough for a Treasurer to recognise a member, not enough to copy the number from a list."""
    d = "".join(ch for ch in str(phone or "") if ch.isdigit())
    return f"{d[:4]} ••• {d[-3:]}" if len(d) >= 9 else ""

def link_members_for_rider(db: Session, rider) -> int:
    """Call when a rider finishes Setup My Profile: links every waiting group membership registered with their mobile number.
    Silent: the rider gets no notification; My Savings / My Loans appear because they are now a member."""
    k = phone_key(rider.mobile_number)
    if len(k) != 9: return 0
    rows = db.query(GroupMember).filter(GroupMember.phone_key == k, GroupMember.status == "active",
                                        GroupMember.linked_rider_id.is_(None)).all()
    for m in rows:
        m.linked_rider_id, m.link_status = rider.id, "linked"
        m.linked_at = datetime.now(timezone.utc)
    db.flush()
    return len(rows)
