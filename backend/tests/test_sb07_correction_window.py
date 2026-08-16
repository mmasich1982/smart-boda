# backend/tests/test_sb07_correction_window.py
from datetime import datetime, timedelta, timezone
from app.services.correction_window_service import within_correction_window

class FakeTrip:
    def __init__(self, recorded_at): self.recorded_at = recorded_at

def test_trip_within_window_is_editable():
    trip = FakeTrip(datetime.now(timezone.utc) - timedelta(hours=2))
    assert within_correction_window(trip, 24) is True

def test_trip_just_past_window_is_locked():
    trip = FakeTrip(datetime.now(timezone.utc) - timedelta(hours=24, minutes=1))
    assert within_correction_window(trip, 24) is False  # BR-SB07-006

def test_correction_window_is_configurable_not_hardcoded():
    trip = FakeTrip(datetime.now(timezone.utc) - timedelta(hours=30))
    assert within_correction_window(trip, 24) is False
    assert within_correction_window(trip, 48) is True  # BR-SB07-001: same trip, different governed window
