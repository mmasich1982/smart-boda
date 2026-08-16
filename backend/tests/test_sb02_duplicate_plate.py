# backend/tests/test_sb02_duplicate_plate.py
import pytest
import uuid
from datetime import datetime, timedelta, timezone
from app.services.duplicate_plate_service import check_and_resolve_duplicate
from app.models.bike_profile import BikeProfile

def test_no_conflict_syncs_cleanly(db_session):
    profile = BikeProfile(rider_id=str(uuid.uuid4()), number_plate="KDA123X", fuel_type_code="petrol", submitted_at=datetime.now(timezone.utc))
    db_session.add(profile); db_session.commit(); db_session.refresh(profile)
    result = check_and_resolve_duplicate(db_session, profile)
    assert result["status"] == "synced"  # BR-SB02-007

def test_genuine_conflict_escalates_and_never_auto_suspends(db_session):
    now = datetime.now(timezone.utc)
    earlier = BikeProfile(rider_id=str(uuid.uuid4()), number_plate="KDA999Z", fuel_type_code="petrol", submitted_at=now)
    later = BikeProfile(rider_id=str(uuid.uuid4()), number_plate="KDA999Z", fuel_type_code="electric", submitted_at=now + timedelta(minutes=5))
    db_session.add_all([earlier, later]); db_session.commit()
    db_session.refresh(earlier); db_session.refresh(later)

    result = check_and_resolve_duplicate(db_session, later)

    assert result["status"] == "pending_review"       # BR-SB02-008: escalated, not resolved automatically
    assert earlier.sync_status == "pending_review"       # BR-SB02-009: NEITHER account is auto-suspended
    assert later.sync_status == "pending_review"
    assert earlier.is_active is True                   # still fully usable while the case is open
    assert later.is_active is True
