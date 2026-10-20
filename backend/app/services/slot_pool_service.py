# backend/app/services/slot_pool_service.py
# ----------------------------------------------------------------------------------------------------------------
# ONE TREASURER, ONE GROUP PER TYPE, AUTOMATIC PAIR, ONE SLOT POOL.
#   * A Treasurer runs at most one Merry-Go-Round group and one Table Banking group.
#   * When both exist (same Treasurer phone, both active) they are a PAIR: linked automatically, nobody clicks "link".
#   * A pair shares ONE member-slot allowance. A rider in both uses ONE slot (counted by bike registration).
#   * The link ends by itself when one of the two groups is deactivated or its Treasurer changes to a different person.
#   * A new Treasurer named by the administrator on one group of a pair takes over BOTH groups.
# ----------------------------------------------------------------------------------------------------------------
import uuid
from fastapi import HTTPException
from sqlalchemy import func
from app.models.boda_group import BodaGroup, GroupMember
from app.services.group_roles import phone_key, same_phone

def pool_groups(db, g) -> list:
    if not g.slot_pool_id: return [g]
    return db.query(BodaGroup).filter(BodaGroup.slot_pool_id == g.slot_pool_id).order_by(BodaGroup.created_at, BodaGroup.id).all()

def partner(db, g):
    """The other group of the pair, or None."""
    return next((x for x in pool_groups(db, g) if x.id != g.id), None)

def slots_used(db, g) -> int:
    """Slots taken: distinct riders (by mobile number) among the active members of every group in the pool."""
    ids = [x.id for x in pool_groups(db, g)]
    return db.query(func.count(func.distinct(GroupMember.phone_key))).filter(
        GroupMember.group_id.in_(ids), GroupMember.status == "active").scalar() or 0

def has_slot(db, g, phone_key_) -> bool:
    """True when this rider already holds a slot in the pool, so joining the other group of the pair costs nothing."""
    ids = [x.id for x in pool_groups(db, g)]
    return db.query(GroupMember.id).filter(GroupMember.group_id.in_(ids), GroupMember.phone_key == phone_key_,
                                           GroupMember.status == "active").first() is not None

def set_approved(db, g, n: int):
    for x in pool_groups(db, g): x.approved_slots = n

def pool_allowance(db, g) -> int:
    return max(x.approved_slots for x in pool_groups(db, g))

def same_type_conflict(db, phone, group_type, exclude_id=None):
    """An ACTIVE group of this type already run by the same Treasurer phone (or None)."""
    if not group_type or not phone_key(phone): return None
    q = db.query(BodaGroup).filter(BodaGroup.status == "active", BodaGroup.group_type == group_type)
    if exclude_id is not None: q = q.filter(BodaGroup.id != exclude_id)
    return next((x for x in q.all() if same_phone(x.treasurer_phone, phone)), None)

def relink_treasurer(db, phone):
    """Re-evaluate the pool for one Treasurer phone. Exactly one active Merry-Go-Round + one active Table Banking group with
    that phone are linked (and share the larger of their two allowances); anything else is unlinked."""
    if not phone_key(phone): return
    gs = [x for x in db.query(BodaGroup).filter(BodaGroup.group_type.in_(("mgr", "tb"))).all() if same_phone(x.treasurer_phone, phone)]
    act = [x for x in gs if x.status == "active"]
    mgr = [x for x in act if x.group_type == "mgr"]; tb = [x for x in act if x.group_type == "tb"]
    if len(mgr) == 1 and len(tb) == 1:
        pid = mgr[0].slot_pool_id or tb[0].slot_pool_id or uuid.uuid4()
        n = max(mgr[0].approved_slots, tb[0].approved_slots)
        for x in (mgr[0], tb[0]): x.slot_pool_id, x.approved_slots = pid, n
        keep = {mgr[0].id, tb[0].id}
    else:
        keep = set()
    for x in gs:
        if x.id not in keep: x.slot_pool_id = None
    db.flush()

def unlink_all(db, g):
    """Used when a group leaves a pool (type, phone, status change): drop the link on both sides."""
    for x in pool_groups(db, g): x.slot_pool_id = None
    db.flush()

def require_free_type(db, phone, group_type, exclude_id=None):
    c = same_type_conflict(db, phone, group_type, exclude_id)
    if c:
        kind = "Merry-Go-Round" if group_type == "mgr" else "Table Banking"
        raise HTTPException(409, f"This Treasurer already runs a {kind} group ({c.group_name}). A Treasurer can run one group of each type.")

def claim_pair(db, g, rider):
    """The Treasurer entered the Chama Code of g. g and its pair partner (same Treasurer phone) are both assigned, once."""
    out = [g]
    g.treasurer_rider_id = rider.id
    for x in db.query(BodaGroup).filter(BodaGroup.status == "active", BodaGroup.id != g.id).with_for_update().all():
        if same_phone(x.treasurer_phone, g.treasurer_phone) and x.treasurer_rider_id in (None, rider.id) \
                and x.group_type and x.group_type != g.group_type:
            x.treasurer_rider_id = rider.id; out.append(x)
    return out

def hand_over(db, g, name, phone):
    """The administrator changed the Treasurer of g. The new Treasurer inherits BOTH groups of the pair and must enter the
    Chama Code once. Returns the groups changed. Riders who no longer treasure anything lose the mirror flag."""
    old_phone = g.treasurer_phone
    changed_person = not same_phone(old_phone, phone)
    grp = pool_groups(db, g)
    # same-type clash for the NEW person (each group checks its own type)
    for x in grp: require_free_type(db, phone, x.group_type, exclude_id=x.id) if changed_person else None
    old_riders = {x.treasurer_rider_id for x in grp if x.treasurer_rider_id}
    for x in grp:
        x.treasurer_name, x.treasurer_phone = name, phone
        if changed_person: x.treasurer_rider_id = None
    db.flush()
    if changed_person:
        from app.models.rider import Rider
        for rid in old_riders:
            if not db.query(BodaGroup.id).filter(BodaGroup.treasurer_rider_id == rid).first():
                r = db.get(Rider, rid)
                if r: r.is_treasurer = False
        relink_treasurer(db, old_phone)
    relink_treasurer(db, phone)
    return grp
