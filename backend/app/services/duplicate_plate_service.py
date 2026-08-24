# backend/app/services/duplicate_plate_service.py
import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.bike_profile import BikeProfile, DuplicatePlateCase

# BR-SB02-007: the DEFINITIVE check only ever runs here, at server sync time.
# BR-SB02-006 (the local, best-effort check) lives entirely on-device — see BikeProfileScreen.js.
def check_and_resolve_duplicate(db: Session, new_profile: BikeProfile):
    existing = (
        db.query(BikeProfile)
        .filter(BikeProfile.number_plate == new_profile.number_plate)
        .filter(BikeProfile.id != new_profile.id)
        .filter(BikeProfile.is_active == True)
        .first()
    )
    if not existing:
        new_profile.sync_status = "synced"
        db.commit()
        return {"status": "synced"}

    # EXC-SB02-010: earlier-timestamped submission is provisionally treated as the
    # likely legitimate holder pending human confirmation; the later one is flagged.
    earlier, later = (
        (existing, new_profile) if existing.submitted_at <= new_profile.submitted_at else (new_profile, existing)
    )
    earlier.sync_status = "pending_review"
    later.sync_status = "pending_review"

    # BR-SB02-008: escalate to Rider Account Support — never silently dropped/overwritten.
    case = DuplicatePlateCase(
        id=f"DPC-{uuid.uuid4().hex[:8].upper()}",
        number_plate=new_profile.number_plate,
        rider_a_id=earlier.rider_id,
        rider_b_id=later.rider_id,
        status="pending_review",
    )
    db.add(case)
    db.commit()
    # BR-SB02-009: NEITHER account is auto-suspended — only a human decision can do that.
    return {"status": "pending_review", "case_id": case.id}
