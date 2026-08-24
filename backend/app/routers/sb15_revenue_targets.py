# backend/app/routers/sb15_revenue_targets.py
# UPDATED: Revenue Targets & Achievement Streaks (RA-09, RA-10)
# Manages daily/weekly/monthly targets, progress tracking, and suggestions

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from uuid import UUID
from app.database import get_db
from app.auth import verify_token
from app.models import Rider, RevenueTarget, Trip
from app.schemas.revenue_targets import (
    RevenueTargetResponse,
    CreateRevenueTargetRequest,
    SuggestedTargetResponse,
    TargetsResponse,
)

router = APIRouter(prefix="/financial", tags=["revenue_targets"])


def get_period_start(period: str) -> datetime:
    """Calculate the start of a period (today, this_week, this_month)."""
    reference_date = datetime.utcnow()
    
    if period == "today":
        return reference_date.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "this_week":
        # Monday of this week
        days_since_monday = reference_date.weekday()
        start = reference_date - timedelta(days=days_since_monday)
        return start.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "this_month":
        return reference_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        return reference_date.replace(hour=0, minute=0, second=0, microsecond=0)


def calculate_income_for_period(db: Session, rider_id: int, period_start: datetime) -> float:
    """Calculate total realized income (from trips) since period_start."""
    trips = db.query(Trip).filter(
        Trip.rider_id == rider_id,
        Trip.status == "completed",
        Trip.completed_at >= period_start,
    ).all()
    
    total_income = 0.0
    for trip in trips:
        if trip.fare_amount:
            total_income += trip.fare_amount
    
    return total_income


def calculate_suggested_target(db: Session, rider_id: int, period: str) -> float:
    """
    Generate AI-suggested target based on recent earning history.
    - Daily: Round up average from last 7 days
    - Weekly: Round up last week's total
    - Monthly: Round up last week * 4.3 (weeks per month)
    """
    # Get last 7 days of income
    week_start = get_period_start("this_week")
    week_income = calculate_income_for_period(db, rider_id, week_start)
    
    # Need at least 7 trips for suggestion
    trips = db.query(Trip).filter(
        Trip.rider_id == rider_id,
        Trip.status == "completed",
        Trip.completed_at >= week_start,
    ).all()
    
    if len(trips) < 7:
        return None
    
    daily_avg = week_income / 7
    
    if period == "daily":
        # Round to nearest 50
        return round(daily_avg / 50) * 50
    elif period == "weekly":
        # Round to nearest 50
        return round(week_income / 50) * 50
    elif period == "monthly":
        # Round to nearest 50
        return round((week_income * 4.3) / 50) * 50
    
    return None


@router.get("/targets", response_model=TargetsResponse)
async def get_targets(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db),
    token: dict = Depends(verify_token),
):
    """Get all active revenue targets for a rider."""
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider ID format")
    
    # Verify the rider exists and belongs to the authenticated user
    rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
    if not rider or rider.mobile_number != token.get("sub"):
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    targets_db = db.query(RevenueTarget).filter(
        RevenueTarget.rider_id == rider_uuid,
        RevenueTarget.is_active == True,
    ).all()
    
    targets_dict = {}
    for target in targets_db:
        targets_dict[target.period] = RevenueTargetResponse(
            period=target.period,
            amount=target.target_amount_ksh,
            created_at=target.created_at,
        )
    
    return TargetsResponse(targets=targets_dict)


@router.get("/targets/suggestion")
async def get_suggested_target(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    period: str = Query("daily", description="Period: daily | weekly | monthly"),
    db: Session = Depends(get_db),
    token: dict = Depends(verify_token),
):
    """Get AI-suggested revenue target based on earning history."""
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider ID format")
    
    # Verify the rider exists and belongs to the authenticated user
    rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
    if not rider or rider.mobile_number != token.get("sub"):
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    suggestion = calculate_suggested_target(db, rider_uuid, period)
    
    return SuggestedTargetResponse(
        suggestion=suggestion,
        period=period,
    )


@router.post("/targets", response_model=RevenueTargetResponse)
async def create_target(
    req: CreateRevenueTargetRequest,
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db),
    token: dict = Depends(verify_token),
):
    """Create a new revenue target for a rider."""
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider ID format")
    
    # Verify the rider exists and belongs to the authenticated user
    rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
    if not rider or rider.mobile_number != token.get("sub"):
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Target amount must be greater than zero")
    
    # Archive existing target for this period
    existing = db.query(RevenueTarget).filter(
        RevenueTarget.rider_id == rider_uuid,
        RevenueTarget.period == req.period,
        RevenueTarget.is_active == True,
    ).first()
    
    if existing:
        existing.is_active = False
        db.add(existing)
    
    # Create new target
    target = RevenueTarget(
        rider_id=rider_uuid,
        period=req.period,
        target_amount_ksh=req.amount,
        is_active=True,
        created_at=datetime.utcnow(),
    )
    
    db.add(target)
    db.commit()
    db.refresh(target)
    
    return RevenueTargetResponse(
        period=target.period,
        amount=target.target_amount_ksh,
        created_at=target.created_at,
    )


@router.put("/targets")
async def update_target(
    req: CreateRevenueTargetRequest,
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db),
    token: dict = Depends(verify_token),
):
    """Update an existing revenue target."""
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider ID format")
    
    # Verify the rider exists and belongs to the authenticated user
    rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
    if not rider or rider.mobile_number != token.get("sub"):
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Target amount must be greater than zero")
    
    # Find existing target
    target = db.query(RevenueTarget).filter(
        RevenueTarget.rider_id == rider_uuid,
        RevenueTarget.period == req.period,
        RevenueTarget.is_active == True,
    ).first()
    
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    target.target_amount_ksh = req.amount
    db.add(target)
    db.commit()
    db.refresh(target)
    
    return RevenueTargetResponse(
        period=target.period,
        amount=target.target_amount_ksh,
        created_at=target.created_at,
    )


@router.delete("/targets")
async def delete_target(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    period: str = Query(..., description="Period: daily | weekly | monthly"),
    db: Session = Depends(get_db),
    token: dict = Depends(verify_token),
):
    """Remove/deactivate a revenue target."""
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider ID format")
    
    # Verify the rider exists and belongs to the authenticated user
    rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
    if not rider or rider.mobile_number != token.get("sub"):
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    target = db.query(RevenueTarget).filter(
        RevenueTarget.rider_id == rider_uuid,
        RevenueTarget.period == period,
        RevenueTarget.is_active == True,
    ).first()
    
    if target:
        target.is_active = False
        db.add(target)
        db.commit()
    
    return {"status": "deleted"}