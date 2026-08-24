# backend/app/routers/sb05_trip_entry.py
# ✅ CORRECTED: Fixed database column name mismatch
# ✅ UPDATED: Added 6-month data retention window support
# - Using payment_channel_code (matches database schema from 0002 migration)
# - rider_id passed as query parameter
# - UUID validation to prevent database errors
# - Proper error handling for 404 on missing rider
# - recorded_at timestamp captured from client
# - Retention window filtering for trip queries

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.trip import Trip
from app.models.rider import Rider
from app.models.trip_master_data import PaymentChannelMaster
from pydantic import BaseModel, Field, validator, ConfigDict
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID as PyUUID
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/trips", tags=["sb-05"])

# ✅ NEW: 6-month data retention window constant (from rider onboarding)
DATA_RETENTION_MONTHS = 6

class TripCreateRequest(BaseModel):
    """Schema for new trip entry (RA-03-A)"""
    amount: float = Field(..., gt=0, description="Trip fare amount in KSh")
    payment_channel_code: str = Field(..., description="Cash, MPesa, or LipaLater")
    note: Optional[str] = Field('', max_length=255, description="Optional trip note")
    recorded_at: datetime = Field(default_factory=datetime.utcnow, description="When trip was recorded")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "amount": 250.00,
                "payment_channel_code": "Cash",
                "note": "",
                "recorded_at": "2024-01-15T10:30:00"
            }
        }
    )
    
    @validator('payment_channel_code')
    def validate_payment_channel(cls, v):
        allowed = ['Cash', 'MPesa', 'LipaLater']
        if v not in allowed:
            raise ValueError(f'Payment channel must be one of {allowed}')
        return v


# ✅ NEW: Helper function to check retention window
def get_retention_window_end(rider: Rider) -> datetime:
    """Calculate the retention window end date (onboarding_date + 6 months)"""
    onboarded_date = rider.created_at if rider.created_at else datetime.utcnow()
    retention_end = onboarded_date + timedelta(days=DATA_RETENTION_MONTHS * 30)
    return retention_end


def is_within_retention_window(entry_date: datetime, rider: Rider) -> bool:
    """Check if an entry date falls within the rider's retention window"""
    if not entry_date or not rider.created_at:
        return True  # Allow if dates missing
    
    onboarded_date = rider.created_at
    retention_end = get_retention_window_end(rider)
    
    return onboarded_date <= entry_date <= retention_end


@router.get("/payment-channels")
def get_payment_channels(db: Session = Depends(get_db)):
    """Get available payment channels (RA-03-B/C)"""
    # BR-SB05-003/004: all active channels, no distinction in presentation
    rows = db.query(PaymentChannelMaster).filter_by(is_active=True).order_by(PaymentChannelMaster.sort_order).all()
    return [{"code": r.code, "display_name": r.display_name, "emoji": r.emoji} for r in rows]


def create_trip(payload: TripCreateRequest, rider_id: str, db: Session):
    """Internal trip creation logic shared by both endpoints
    
    BR-SB05-001: Amount must be > 0 (validated by Pydantic)
    BR-SB05-006: Rider's own timestamp is recorded
    ✅ NEW: Trip must be created within retention window
    """
    
    # ✅ Validate rider_id is a valid UUID format before querying
    try:
        rider_uuid = PyUUID(rider_id)
    except (ValueError, TypeError):
        logger.warning(f"Invalid rider_id format received: '{rider_id}'")
        raise HTTPException(
            status_code=400,
            detail=f"Invalid rider_id format. Expected a valid UUID, got: '{rider_id}'"
        )
    
    # Verify rider exists in database
    rider = db.query(Rider).filter_by(id=rider_uuid).first()
    if not rider:
        logger.warning(f"Rider not found: {rider_uuid}")
        raise HTTPException(
            status_code=404,
            detail=f"Rider not found: {rider_uuid}"
        )
    
    # ✅ NEW: Check if trip is being recorded within retention window
    if not is_within_retention_window(payload.recorded_at, rider):
        logger.warning(f"Trip outside retention window for rider {rider_uuid}")
        raise HTTPException(
            status_code=400,
            detail=f"Trip date is outside the {DATA_RETENTION_MONTHS}-month retention window from onboarding date"
        )
    
    # Create trip with correct database column names
    trip = Trip(
        rider_id=rider_uuid,
        amount=payload.amount,
        payment_channel_code=payload.payment_channel_code,  # Correct column name from database
        note=payload.note or '',
        recorded_at=payload.recorded_at,
        status="active",
        sync_status="pending",
    )
    
    db.add(trip)
    db.commit()
    db.refresh(trip)
    
    logger.info(f"Trip created: {trip.id} for rider {rider_uuid} amount {payload.amount}")
    
    return {
        "trip_id": str(trip.id),
        "status": "pending",
        "amount": float(trip.amount),
        "payment_channel_code": trip.payment_channel_code,
    }


@router.post("/create")
def create_trip_endpoint(
    payload: TripCreateRequest, 
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """Create a new trip entry (RA-03-A)
    
    Endpoint: POST /trips/create?rider_id={uuid}
    ✅ NEW: Validates trip date is within retention window
    """
    return create_trip(payload, rider_id, db)


@router.post("")
def create_trip_alt(
    payload: TripCreateRequest, 
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """Alternate endpoint for trip creation - supports POST /trips?rider_id={uuid}
    ✅ NEW: Validates trip date is within retention window
    """
    return create_trip(payload, rider_id, db)