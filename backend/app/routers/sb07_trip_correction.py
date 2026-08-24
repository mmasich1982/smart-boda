"""
sb07_trip_correction.py
Backend API Router for Trip Correction and Void functionality
Implements RA-04 Daily Trade Summary correction window and out-of-window request handling
✅ UPDATED: Added 6-month data retention window support
"""

from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.trip import Trip
from app.models.rider import Rider
from app.models.out_of_window_request import OutOfWindowRequest
from app.schemas.trip import TripCorrectionRequest, TripVoidRequest, OutOfWindowCorrectionRequest
from app.auth import get_current_rider
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/api/v1/trips', tags=['Trip Correction & Void'])

# Correction window: 24 hours
CORRECTION_WINDOW_HOURS = 24

# ✅ NEW: 6-month data retention window constant
DATA_RETENTION_MONTHS = 6

# Correction reasons
CORRECTION_REASONS = [
    'Wrong amount entered',
    'Customer negotiated price',
    'Duplicate entry',
    'Test trip',
    'Other (specify in admin)',
]


def get_rider_onboarding_date(rider: Rider) -> datetime:
    """Get rider's onboarding date"""
    return rider.created_at if rider.created_at else datetime.utcnow()


def get_retention_window_end(onboarding_date: datetime) -> datetime:
    """Calculate retention window end date"""
    return onboarding_date + timedelta(days=DATA_RETENTION_MONTHS * 30)


def is_within_retention_window(entry_date: datetime, onboarding_date: datetime) -> bool:
    """Check if entry is within retention window"""
    retention_end = get_retention_window_end(onboarding_date)
    return onboarding_date <= entry_date <= retention_end


def get_correction_window_remaining(trip_timestamp: datetime) -> float:
    """Calculate hours remaining in correction window"""
    if not trip_timestamp:
        return 0
    
    now = datetime.utcnow()
    elapsed = (now - trip_timestamp).total_seconds() / 3600  # Convert to hours
    remaining = max(0, CORRECTION_WINDOW_HOURS - elapsed)
    return remaining


def is_trip_editable(trip: Trip) -> bool:
    """Check if trip is within correction window"""
    return get_correction_window_remaining(trip.created_at) > 0


@router.get('/daily-summary')
def get_daily_summary(
    db: Session = Depends(get_db),
    current_rider = Depends(get_current_rider)
):
    """
    Get My Daily Trade Summary
    Returns today's trips grouped by payment method with totals
    ✅ NEW: Filters results by 6-month retention window
    """
    try:
        now = datetime.utcnow()
        # Trading day starts at 4 AM local time (using UTC for consistency)
        trading_day_start = datetime.utcfromtimestamp(
            int(now.timestamp()) - (int(now.timestamp()) % 86400) + 14400  # 4 AM offset
        )
        
        # ✅ NEW: Get rider's retention window
        rider = db.query(Rider).filter_by(id=current_rider.id).first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        
        onboarding_date = get_rider_onboarding_date(rider)
        retention_end = get_retention_window_end(onboarding_date)
        
        # Get today's trips within retention window
        today_trips = db.query(Trip).filter(
            Trip.rider_id == current_rider.id,
            Trip.created_at >= trading_day_start,
            Trip.created_at <= now,
            Trip.created_at >= onboarding_date,  # ✅ NEW: Within retention window
            Trip.created_at <= retention_end,    # ✅ NEW: Within retention window
            Trip.status.in_(['active', 'voided'])
        ).order_by(Trip.created_at.desc()).all()
        
        # Calculate realized income
        realized_trips = [t for t in today_trips if t.status == 'active' and not (
            t.payment_method == 'LipaLater' and not t.lipa_later_settled
        )]
        
        total_amount = sum(t.amount for t in realized_trips)
        
        # Group by payment method
        by_channel = {}
        for trip in realized_trips:
            method = trip.payment_method
            by_channel[method] = by_channel.get(method, 0) + trip.amount
        
        # Pending Lipa Later trips
        pending_lipa_later = [
            t for t in today_trips 
            if t.status == 'active' and t.payment_method == 'LipaLater' and not t.lipa_later_settled
        ]
        
        # Settled Lipa Later from before today
        settled_lipa_later = [
            t for t in db.query(Trip).filter(
                Trip.rider_id == current_rider.id,
                Trip.created_at < trading_day_start,
                Trip.payment_method == 'LipaLater',
                Trip.lipa_later_settled == True,
                Trip.updated_at >= trading_day_start,  # Settled during today
                Trip.created_at >= onboarding_date,     # ✅ NEW: Within retention window
                Trip.created_at <= retention_end        # ✅ NEW: Within retention window
            ).all()
        ]
        
        return {
            'status': 'success',
            'data': {
                'trips_count': len([t for t in today_trips if t.status == 'active']),
                'total_amount': total_amount,
                'by_channel': by_channel,
                'trips': [
                    {
                        'id': t.id,
                        'amount': t.amount,
                        'method': t.payment_method,
                        'timestamp': t.created_at.isoformat(),
                        'status': t.status,
                        'sync_status': t.sync_status,
                        'is_editable': is_trip_editable(t),
                        'hours_remaining': get_correction_window_remaining(t.created_at),
                        'customer_name': t.lipa_later_customer_name if t.payment_method == 'LipaLater' else None,
                        'correction_reason': t.correction_reason,
                        'original_amount': t.original_amount,
                    }
                    for t in today_trips
                ],
                'pending_lipa_later_count': len(pending_lipa_later),
                'settled_lipa_later_today': len(settled_lipa_later),
                'settled_lipa_later_amount': sum(t.amount for t in settled_lipa_later),
                # ✅ NEW: Retention window info
                'retention_window': {
                    'onboarding_date': onboarding_date.isoformat(),
                    'window_end': retention_end.isoformat(),
                    'months': DATA_RETENTION_MONTHS,
                    'is_within_window': now <= retention_end
                }
            }
        }
    except Exception as e:
        logger.error(f'get_daily_summary error: {e}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Error retrieving daily summary'
        )


@router.get('/trip/{trip_id}')
def get_trip_detail(
    trip_id: int,
    db: Session = Depends(get_db),
    current_rider = Depends(get_current_rider)
):
    """Get trip details for correction/void modal
    ✅ NEW: Checks retention window status
    """
    try:
        trip = db.query(Trip).filter(
            Trip.id == trip_id,
            Trip.rider_id == current_rider.id
        ).first()
        
        if not trip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail='Trip not found'
            )
        
        # ✅ NEW: Check retention window
        rider = db.query(Rider).filter_by(id=current_rider.id).first()
        onboarding_date = get_rider_onboarding_date(rider) if rider else datetime.utcnow()
        is_within_window = is_within_retention_window(trip.created_at, onboarding_date)
        
        return {
            'status': 'success',
            'data': {
                'id': trip.id,
                'amount': trip.amount,
                'original_amount': trip.original_amount,
                'method': trip.payment_method,
                'timestamp': trip.created_at.isoformat(),
                'is_editable': is_trip_editable(trip),
                'hours_remaining': get_correction_window_remaining(trip.created_at),
                'customer_name': trip.lipa_later_customer_name,
                'correction_reason': trip.correction_reason,
                'correction_reasons': CORRECTION_REASONS,
                'is_within_retention_window': is_within_window,  # ✅ NEW
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f'get_trip_detail error: {e}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Error retrieving trip details'
        )


@router.post('/trip/{trip_id}/correct')
def correct_trip(
    trip_id: int,
    request: TripCorrectionRequest,
    db: Session = Depends(get_db),
    current_rider = Depends(get_current_rider)
):
    """
    Correct a trip within the 24-hour window
    Updates amount, payment method, and records reason
    ✅ NEW: Validates correction is within retention window
    """
    try:
        trip = db.query(Trip).filter(
            Trip.id == trip_id,
            Trip.rider_id == current_rider.id
        ).first()
        
        if not trip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail='Trip not found'
            )
        
        # Check correction window
        if not is_trip_editable(trip):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Trip is outside the 24-hour correction window'
            )
        
        # ✅ NEW: Check retention window
        rider = db.query(Rider).filter_by(id=current_rider.id).first()
        onboarding_date = get_rider_onboarding_date(rider) if rider else datetime.utcnow()
        if not is_within_retention_window(trip.created_at, onboarding_date):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f'Trip is outside the {DATA_RETENTION_MONTHS}-month retention window'
            )
        
        # Validate input
        if not request.reason or request.reason not in CORRECTION_REASONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Invalid or missing correction reason'
            )
        
        if request.new_amount <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Corrected amount must be greater than zero'
            )
        
        # Store original amount if not already stored
        if trip.original_amount is None:
            trip.original_amount = trip.amount
        
        # Apply correction
        trip.amount = request.new_amount
        trip.payment_method = request.new_method
        trip.correction_reason = request.reason
        trip.corrected_at = datetime.utcnow()
        trip.sync_status = 'pending'
        
        # Remove Lipa Later data if changing away from Lipa Later
        if request.new_method != 'LipaLater':
            trip.lipa_later_customer_name = None
            trip.lipa_later_phone = None
            trip.lipa_later_due_date = None
            trip.lipa_later_settled = False
        
        db.commit()
        
        logger.info(f'Trip {trip_id} corrected by rider {current_rider.id}: {trip.original_amount} → {trip.amount}')
        
        return {
            'status': 'success',
            'message': 'Trip corrected successfully',
            'data': {
                'id': trip.id,
                'amount': trip.amount,
                'method': trip.payment_method,
                'correction_reason': trip.correction_reason,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f'correct_trip error: {e}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Error correcting trip'
        )


@router.post('/trip/{trip_id}/void')
def void_trip(
    trip_id: int,
    request: TripVoidRequest,
    db: Session = Depends(get_db),
    current_rider = Depends(get_current_rider)
):
    """
    Void a trip within the 24-hour window
    Removes trip from daily totals
    ✅ NEW: Validates void is within retention window
    """
    try:
        trip = db.query(Trip).filter(
            Trip.id == trip_id,
            Trip.rider_id == current_rider.id
        ).first()
        
        if not trip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail='Trip not found'
            )
        
        # Check correction window
        if not is_trip_editable(trip):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Trip is outside the 24-hour correction window'
            )
        
        # ✅ NEW: Check retention window
        rider = db.query(Rider).filter_by(id=current_rider.id).first()
        onboarding_date = get_rider_onboarding_date(rider) if rider else datetime.utcnow()
        if not is_within_retention_window(trip.created_at, onboarding_date):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f'Trip is outside the {DATA_RETENTION_MONTHS}-month retention window'
            )
        
        # Validate reason
        if not request.reason or request.reason not in CORRECTION_REASONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Invalid or missing void reason'
            )
        
        # Mark as voided
        trip.status = 'voided'
        trip.correction_reason = request.reason
        trip.voided_at = datetime.utcnow()
        trip.sync_status = 'pending'
        
        db.commit()
        
        logger.info(f'Trip {trip_id} voided by rider {current_rider.id}: {trip.amount}')
        
        return {
            'status': 'success',
            'message': 'Trip voided successfully',
            'data': {
                'id': trip.id,
                'status': trip.status,
                'void_reason': trip.correction_reason,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f'void_trip error: {e}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Error voiding trip'
        )


@router.post('/trip/{trip_id}/request-correction-oow')
def request_correction_out_of_window(
    trip_id: int,
    request: OutOfWindowCorrectionRequest,
    db: Session = Depends(get_db),
    current_rider = Depends(get_current_rider)
):
    """
    Request out-of-window correction
    Submits request to admin for manual review
    ✅ PHASE 2: Handles requests for data beyond retention window
    """
    try:
        trip = db.query(Trip).filter(
            Trip.id == trip_id,
            Trip.rider_id == current_rider.id
        ).first()
        
        if not trip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail='Trip not found'
            )
        
        # Create out-of-window request
        oow_request = OutOfWindowRequest(
            trip_id=trip_id,
            rider_id=current_rider.id,
            requested_amount=request.requested_amount,
            reason=request.reason,
            status='pending',
            created_at=datetime.utcnow(),
        )
        
        db.add(oow_request)
        db.commit()
        
        logger.info(f'Out-of-window correction request created: Trip {trip_id} by Rider {current_rider.id}')
        
        return {
            'status': 'success',
            'message': "Your correction request has been submitted. We'll update you within 72 hours.",
            'data': {
                'request_id': oow_request.id,
                'status': oow_request.status,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f'request_correction_out_of_window error: {e}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Error submitting correction request'
        )