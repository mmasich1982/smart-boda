# backend/tests/test_sb07_void.py
import pytest
from pydantic import ValidationError
from app.schemas.trip import TripVoidRequest

def test_void_rejects_missing_confirmation():
    with pytest.raises(ValidationError):
        TripVoidRequest(correction_reason_code="duplicate", void_confirm=False)  # BR-SB07-003

def test_void_accepts_reason_plus_explicit_confirmation():
    req = TripVoidRequest(correction_reason_code="duplicate", void_confirm=True)
    assert req.void_confirm is True

def test_already_voided_trip_is_a_noop(db_session, voided_trip_fixture):
    from app.routers.sb07_trip_correction import void_trip
    result = void_trip(voided_trip_fixture.id, TripVoidRequest(correction_reason_code="duplicate", void_confirm=True), db_session)
    assert result["already_voided"] is True  # EXC-SB07-008: never re-processed
