# backend/app/services/correction_window_service.py — the SAME rule, authoritative once synced
from datetime import datetime, timezone

# EXC-SB07-009: server-side timestamp is definitive; client-side display is a best-effort estimate.
def within_correction_window(trip, correction_window_hours: int) -> bool:
    hours_since = (datetime.now(timezone.utc) - trip.recorded_at).total_seconds() / 3600
    return hours_since < correction_window_hours
