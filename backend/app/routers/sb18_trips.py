# backend/app/routers/sb18_trips.py
# ✅ UPDATED: Trip Management API with 6-month retention window
# Handles trip creation, retrieval, daily totals, and income tracking
# ✅ FIXED: Changed imports from app.schemas.trips to app.schemas.trip
# ✅ NEW: Implements 6-month data retention filtering on all queries

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.database import get_db
from app.auth import verify_token
from app.models import Rider, Trip
from app.schemas.trip import (
    TripCreateRequest,
    TripResponse,
)

router = APIRouter(prefix="/trips", tags=["trips"])

# ✅ NEW: 6-month data retention window constant
DATA_RETENTION_MONTHS = 6


def get_retention_window_for_rider(rider: Rider) -> tuple[datetime, datetime]:
    """Get the retention window for a rider
    Returns: (window_start, window_end)
    """
    onboarding_date = rider.created_at if rider.created_at else datetime.utcnow()
    window_end = onboarding_date + timedelta(days=DATA_RETENTION_MONTHS * 30)
    return onboarding_date, window_end


@router.post("/create", response_model=TripResponse)
async def create_trip(
    req: TripCreateRequest,
    db: Session = Depends(get_db),
    token: dict = Depends(verify_token),
):
    """Create a new trip entry with income.
    ✅ NEW: Validates trip is within retention window
    """
    # Verify rider
    rider = db.query(Rider).filter(Rider.id == req.rider_id).first()
    if not rider or rider.mobile_number != token.get("sub"):
        raise HTTPException(status_code=403, detail="Unauthorized")

    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    # ✅ NEW: Check retention window
    onboarding_date, window_end = get_retention_window_for_rider(rider)
    trip_date = req.recorded_at or datetime.utcnow()
    
    if not (onboarding_date <= trip_date <= window_end):
        raise HTTPException(
            status_code=400, 
            detail=f"Trip date is outside the {DATA_RETENTION_MONTHS}-month retention window"
        )

    # Create trip
    trip = Trip(
        rider_id=req.rider_id,
        amount=req.amount,
        payment_channel_code=req.payment_channel_code,
        note=req.note or None,
        recorded_at=req.recorded_at or datetime.utcnow(),
        status='active',
        sync_status='synced',  # this endpoint is only reached once the device is actually online
    )

    db.add(trip)
    db.commit()
    db.refresh(trip)

    return TripResponse(
        id=trip.id,
        amount=trip.amount,
        payment_method=trip.payment_channel_code,
        timestamp=trip.recorded_at,
        status=trip.status,
        sync_status=trip.sync_status,
        note=trip.note,
        is_editable=True,
        hours_remaining=24,
    )


@router.get("/today-total")
async def get_today_total(
    rider_id: int = Query(...),
    db: Session = Depends(get_db),
    token: dict = Depends(verify_token),
):
    """Get today's cumulative trip income (running fare total).
    ✅ NEW: Filters by retention window
    """
    # Verify rider
    rider = db.query(Rider).filter(Rider.id == rider_id).first()
    if not rider or rider.mobile_number != token.get("sub"):
        raise HTTPException(status_code=403, detail="Unauthorized")

    # Get today's trips (trading day starts at 6am)
    now = datetime.utcnow()
    if now.hour < 6:
        today_start = (now - timedelta(days=1)).replace(hour=6, minute=0, second=0, microsecond=0)
    else:
        today_start = now.replace(hour=6, minute=0, second=0, microsecond=0)
    
    # ✅ NEW: Get retention window
    onboarding_date, window_end = get_retention_window_for_rider(rider)
    
    # ✅ NEW: Filter by retention window
    today_trips = db.query(Trip).filter(
        Trip.rider_id == rider_id,
        Trip.recorded_at >= today_start,
        Trip.status == 'active',
        Trip.recorded_at >= onboarding_date,  # ✅ Within retention window
        Trip.recorded_at <= window_end        # ✅ Within retention window
    ).all()

    total_fare = sum(t.amount for t in today_trips if t.amount)

    return {
        "total_fare": total_fare,
        "trip_count": len(today_trips),
        "date": today_start.date(),
    }


@router.get("/history")
async def get_trip_history(
    rider_id: int = Query(...),
    period: str = Query("today", description="today | week | month | all"),
    db: Session = Depends(get_db),
    token: dict = Depends(verify_token),
):
    """Get trip history for a specified period.
    ✅ NEW: Filters by retention window
    """
    # Verify rider
    rider = db.query(Rider).filter(Rider.id == rider_id).first()
    if not rider or rider.mobile_number != token.get("sub"):
        raise HTTPException(status_code=403, detail="Unauthorized")

    # Calculate period start
    now = datetime.utcnow()
    if period == "today":
        # Trading day starts at 6am
        if now.hour < 6:
            start = (now - timedelta(days=1)).replace(hour=6, minute=0, second=0, microsecond=0)
        else:
            start = now.replace(hour=6, minute=0, second=0, microsecond=0)
    elif period == "week":
        days_since_monday = now.weekday()
        start = now - timedelta(days=days_since_monday)
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:  # all
        start = None

    # ✅ NEW: Get retention window
    onboarding_date, window_end = get_retention_window_for_rider(rider)

    query = db.query(Trip).filter(
        Trip.rider_id == rider_id, 
        Trip.status == 'active',
        Trip.recorded_at >= onboarding_date,  # ✅ Within retention window
        Trip.recorded_at <= window_end        # ✅ Within retention window
    )

    if start:
        query = query.filter(Trip.recorded_at >= start)

    trips = query.order_by(Trip.recorded_at.desc()).all()
    total_income = sum(t.amount for t in trips if t.amount)

    return {
        "trips": [
            {
                "id": t.id,
                "amount": t.amount,
                "payment_method": t.payment_channel_code,
                "recorded_at": t.recorded_at,
                "status": t.status,
                "note": t.note,
            }
            for t in trips
        ],
        "total_income": total_income,
        "trip_count": len(trips),
        "period": period,
        "retention_window": {  # ✅ NEW: Include retention info
            "window_start": onboarding_date.isoformat(),
            "window_end": window_end.isoformat(),
            "is_within_window": now <= window_end,
            "months": DATA_RETENTION_MONTHS
        }
    }


@router.get("/monthly-summary")
async def get_monthly_summary(
    rider_id: int = Query(...),
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
    token: dict = Depends(verify_token),
):
    """Get monthly trip summary for daily trade history.
    ✅ NEW: Filters by retention window
    """
    # Verify rider
    rider = db.query(Rider).filter(Rider.id == rider_id).first()
    if not rider or rider.mobile_number != token.get("sub"):
        raise HTTPException(status_code=403, detail="Unauthorized")

    # Get all trips for the month
    start = datetime(year, month, 1)
    if month == 12:
        end = datetime(year + 1, 1, 1)
    else:
        end = datetime(year, month + 1, 1)

    # ✅ NEW: Get retention window
    onboarding_date, window_end = get_retention_window_for_rider(rider)

    # ✅ NEW: Filter by retention window
    trips = db.query(Trip).filter(
        Trip.rider_id == rider_id,
        Trip.recorded_at >= start,
        Trip.recorded_at < end,
        Trip.status == 'active',
        Trip.recorded_at >= onboarding_date,  # ✅ Within retention window
        Trip.recorded_at <= window_end        # ✅ Within retention window
    ).all()

    # Group by date
    daily_summary = {}
    for trip in trips:
        date_key = trip.recorded_at.date()
        if date_key not in daily_summary:
            daily_summary[date_key] = {'income': 0.0, 'trips': 0}
        daily_summary[date_key]['income'] += trip.amount
        daily_summary[date_key]['trips'] += 1

    return {
        "month": month,
        "year": year,
        "daily_summary": daily_summary,
        "total_income": sum(t.amount for t in trips if t.amount),
        "total_trips": len(trips),
        "retention_window": {  # ✅ NEW: Include retention info
            "window_start": onboarding_date.isoformat(),
            "window_end": window_end.isoformat(),
            "months": DATA_RETENTION_MONTHS
        }
    }