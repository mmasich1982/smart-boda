# backend/app/services/group_plate_service.py
import re
from datetime import datetime, timezone
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.bike_profile import BikeProfile
from app.models.boda_group import BodaGroup, GroupMember

def normalize_plate(plate: str) -> str:
    """'kmfb 123a' -> 'KMFB123A'. Same result for KMFB-123A and KMFB123A."""
    return re.sub(r"[^A-Z0-9]", "", (plate or "").upper())

def is_valid_plate(norm: str) -> bool:
    return 6 <= len(norm) <= 12

def find_rider_id_by_plate(db: Session, plate_norm: str):
    """PLATE ONLY. No phone number is read or compared anywhere in this file."""
    expr = func.regexp_replace(func.upper(BikeProfile.number_plate), "[^A-Z0-9]", "", "g")
    bp = db.query(BikeProfile).filter(expr == plate_norm, BikeProfile.is_active == True).first()
    return bp.rider_id if bp else None

def link_members_for_plate(db: Session, rider_id, plate: str) -> int:
    """Call after a rider saves a bike profile: links any waiting members with this plate,
    and any group officer (Chairperson / Secretary General) waiting on this plate."""
    n = normalize_plate(plate)
    rows = db.query(GroupMember).filter(GroupMember.plate_norm == n, GroupMember.status == "active",
                                        GroupMember.linked_rider_id.is_(None)).all()
    for m in rows:
        m.linked_rider_id, m.link_status = rider_id, "linked"
        m.linked_at = datetime.now(timezone.utc)
    for g in db.query(BodaGroup).filter(BodaGroup.chair_plate == n, BodaGroup.chair_rider_id.is_(None)):
        g.chair_rider_id = rider_id
    for g in db.query(BodaGroup).filter(BodaGroup.secretary_plate == n, BodaGroup.secretary_rider_id.is_(None)):
        g.secretary_rider_id = rider_id
    db.commit()
    return len(rows)     # number of members linked (officer links are not counted)