# backend/app/services/group_roles.py
from fastapi import HTTPException
from app.models.boda_group import BodaGroup

# ---------------------------------------------------------------------------------------------------------------
# HOW SOMEONE BECOMES A TREASURER (code-driven, no self-declaration)
#   1. The Smart Boda Administrator creates the group, records the Treasurer's name and PHONE, and gives the
#      Chama Code to that person outside the app (phone / SMS).
#   2. That person onboards like any rider. There is no "I am a Treasurer" option.
#   3. The server recognises them: their verified phone matches the Treasurer phone of an active group that has no
#      Treasurer yet ("treasurer_invite" on /chama/me/profile), so the app shows an "Enter your Chama Code" card.
#   4. They enter the code (POST /groups/validate-code). The server checks code + phone and records them as Treasurer.
# A person may be named Treasurer of SEVERAL groups (for example a Merry-Go-Round and a Table Banking group), and a rider
# may be a member of several groups run by different Treasurers: the relationship is many-to-many.
# A rider is a Treasurer exactly when a group names them in treasurer_rider_id. rider.is_treasurer is only a mirror
# of that fact (kept for older app versions); it is never trusted on its own.
# ---------------------------------------------------------------------------------------------------------------

def phone_key(phone) -> str:
    """Comparable form of a Kenyan mobile number: the last 9 digits (0712345678, +254712345678 and 254712345678 all give 712345678)."""
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    return digits[-9:] if len(digits) >= 9 else digits

def same_phone(a, b) -> bool:
    ka, kb = phone_key(a), phone_key(b)
    return len(ka) == 9 and ka == kb

def treasurer_groups(db, rider):
    """Every group this rider is the registered Treasurer of (oldest first). A Treasurer may run several groups."""
    return db.query(BodaGroup).filter(BodaGroup.treasurer_rider_id == rider.id).order_by(BodaGroup.created_at, BodaGroup.id).all()

def treasurer_group(db, rider, lock=False, group_id=None):
    """The group this rider is the registered Treasurer of (or None). With several groups, pass group_id to pick one;
    without it the oldest group is used (older app versions never send a group)."""
    q = db.query(BodaGroup).filter(BodaGroup.treasurer_rider_id == rider.id)
    if group_id is not None: q = q.filter(BodaGroup.id == group_id)
    q = q.order_by(BodaGroup.created_at, BodaGroup.id)
    return (q.with_for_update() if lock else q).first()

def invited_groups(db, rider):
    """Active, still-unclaimed groups whose Treasurer phone is this rider's phone. Drives the "Enter your Chama Code" card.
    Nothing is returned for ordinary riders."""
    rows = db.query(BodaGroup).filter(BodaGroup.status == "active", BodaGroup.treasurer_rider_id.is_(None))\
             .order_by(BodaGroup.created_at, BodaGroup.id).all()
    return [g for g in rows if same_phone(g.treasurer_phone, rider.mobile_number)]

def invited_group(db, rider):
    """First invited group (kept for older callers). A rider who already treasures a group can still be invited to another."""
    rows = invited_groups(db, rider)
    return rows[0] if rows else None

def actor_group(db, rider, lock=False, group_id=None):
    """The group this rider runs as Treasurer. Returns (group, "treasurer"). Only the Treasurer role exists."""
    g = treasurer_group(db, rider, lock, group_id)
    if g: return g, "treasurer"
    raise HTTPException(403, "Only a group Treasurer can use this.")

def approvers(db, g, payer_rider_id):
    """Who is asked to confirm an item raised by payer_rider_id: the group's Treasurer."""
    return [g.treasurer_rider_id]
