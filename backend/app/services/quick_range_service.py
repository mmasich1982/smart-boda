# backend/app/services/quick_range_service.py
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.trip import Trip
from app.models.fuel_entry import FuelEntry
from app.models.maintenance_entry import MaintenanceEntry
from app.models.other_expense import OtherExpense

# BR-SB19-001/002/003/004: five genuinely distinct, non-overlapping ranges — never pulled
# forward or collapsed just because a period happens to be empty.
def quick_range_bounds(quick_select: str, now: datetime, rider, db: Session = None) -> tuple[datetime, datetime]:
    this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if quick_select == "this_month":
        return this_month_start, now
    if quick_select == "last_month":
        last_month_end = this_month_start - timedelta(seconds=1)  # BR-SB19-002: fixed end boundary, not pulled forward
        return last_month_end.replace(day=1, hour=0, minute=0, second=0), this_month_start
    if quick_select == "last_3":
        return now - timedelta(days=91), now
    if quick_select == "last_6":
        return now - timedelta(days=182), now
    if quick_select == "since_joining":
        earliest = earliest_transaction_date(db, rider.id) or rider.created_at  # BR-SB19-003: fall back to registration date only if no data yet
        return earliest, now
    raise ValueError("unknown quick_select")

def earliest_transaction_date(db: Session, rider_id: str):
    # AUDIT FIX (found during full-codebase sweep): this was a stub (`pass`, returning None
    # unconditionally), so "Since Joining" always silently fell back to the rider's
    # registration date rather than their actual earliest transaction, no matter what data
    # existed. Now genuinely checks all four source tables and returns the earliest.
    candidates = []
    trip = db.query(Trip).filter(Trip.rider_id == rider_id).order_by(Trip.recorded_at.asc()).first()
    if trip: candidates.append(trip.recorded_at)
    fuel = db.query(FuelEntry).filter(FuelEntry.rider_id == rider_id).order_by(FuelEntry.submitted_at.asc()).first()
    if fuel: candidates.append(fuel.submitted_at)
    maint = db.query(MaintenanceEntry).filter(MaintenanceEntry.rider_id == rider_id).order_by(MaintenanceEntry.submitted_at.asc()).first()
    if maint: candidates.append(maint.submitted_at)
    other = db.query(OtherExpense).filter(OtherExpense.rider_id == rider_id).order_by(OtherExpense.submitted_at.asc()).first()
    if other: candidates.append(other.submitted_at)
    return min(candidates) if candidates else None
