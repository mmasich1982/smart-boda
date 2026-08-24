# backend/app/routers/bike_profile.py
# ✅ ENHANCED: Comprehensive bike profile validation with duplicate number plate detection
# Provides clear error messages and helpful guidance to customers

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import logging

from app.database import get_db
from app.models.bike_profile import BikeProfile, DuplicatePlateCase
from app.models.master_data import FuelTypeMaster
from app.models.rider import Rider
from app.schemas.onboarding import BikeProfileRequest
from app.services.duplicate_plate_service import check_and_resolve_duplicate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboarding", tags=["Bike Profile"])


# ============================================================================
# ENDPOINT: Get Available Fuel Types
# ============================================================================

@router.get("/fuel-types")
def get_fuel_types(db: Session = Depends(get_db)):
    """
    GET /onboarding/fuel-types
    
    Get list of available fuel types for bike registration.
    Returns: [{code, display_name, description}]
    """
    fuel_types = db.query(FuelTypeMaster).filter_by(is_active=True).order_by(FuelTypeMaster.sort_order).all()
    
    return [
        {
            "code": ft.code,
            "display_name": ft.display_name,
            "description": getattr(ft, 'description', f"Fuel type: {ft.display_name}"),
            "sort_order": ft.sort_order
        }
        for ft in fuel_types
    ]


# ============================================================================
# ENDPOINT: Check Number Plate Uniqueness (Real-time Validation)
# ============================================================================

@router.get("/check-plate-uniqueness/{number_plate}")
def check_plate_uniqueness(number_plate: str, db: Session = Depends(get_db)):
    """
    GET /onboarding/check-plate-uniqueness/KCA123A
    
    Check if a number plate is already registered in the system.
    Provides real-time validation feedback for the bike profile screen.
    
    Returns:
    {
        "exists": false,                              # Is this plate already registered?
        "number_plate": "KCA123A",                   # Cleaned (uppercase, trimmed) plate
        "message": "This plate is available",        # User-friendly message
        "status": "available"                         # Status: available | duplicate | duplicate_pending
    }
    
    Possible statuses:
    - available: No registration found, plate can be used
    - duplicate: Same plate registered to another active rider
    - duplicate_pending: Same plate involved in a duplicate case under review
    """
    # Validate input
    if not number_plate or not number_plate.strip():
        raise HTTPException(
            status_code=400,
            detail="Number plate cannot be empty"
        )
    
    # Clean the plate: uppercase and trim whitespace
    cleaned_plate = number_plate.strip().upper()
    
    # Validate format (basic check)
    if len(cleaned_plate) < 5 or len(cleaned_plate) > 12:
        raise HTTPException(
            status_code=400,
            detail="Number plate must be between 5-12 characters. Format: KCA123A"
        )
    
    # Check for exact match in bike profiles
    existing_bike = db.query(BikeProfile).filter(
        BikeProfile.number_plate == cleaned_plate,
        BikeProfile.is_active == True
    ).first()
    
    if existing_bike:
        # Get the rider details for the message
        rider = db.query(Rider).get(existing_bike.rider_id)
        rider_name = rider.full_name if rider and rider.full_name else "another rider"
        
        return {
            "exists": True,
            "number_plate": cleaned_plate,
            "message": f"This number plate is already registered to {rider_name}. Please check and re-enter if incorrect.",
            "status": "duplicate",
            "registered_to": rider_name if rider else "Unknown",
            "registered_at": existing_bike.submitted_at.isoformat() if existing_bike.submitted_at else None
        }
    
    # Check if there's a duplicate case pending for this plate
    pending_case = db.query(DuplicatePlateCase).filter(
        DuplicatePlateCase.number_plate == cleaned_plate,
        DuplicatePlateCase.status == "pending_review"
    ).first()
    
    if pending_case:
        return {
            "exists": True,
            "number_plate": cleaned_plate,
            "message": "This plate is currently under review due to a duplicate registration claim. Please contact support.",
            "status": "duplicate_pending",
            "case_id": pending_case.id,
            "note": "Your registration may be temporarily held pending resolution"
        }
    
    # No conflicts found
    return {
        "exists": False,
        "number_plate": cleaned_plate,
        "message": "This plate is available and ready to use!",
        "status": "available"
    }


# ============================================================================
# ENDPOINT: Submit Bike Profile with Validation
# ============================================================================

@router.post("/bike-profile")
def submit_bike_profile(
    payload: BikeProfileRequest,
    rider_id: str = Query(..., description="Rider UUID"),
    db: Session = Depends(get_db)
):
    """
    POST /onboarding/bike-profile?rider_id=UUID
    
    Submit bike profile with number plate and fuel type.
    
    Validation:
    - Number plate must be unique (not registered to any other rider)
    - Number plate format validated (5-12 characters)
    - Fuel type must exist and be active
    - Rider must exist
    
    Returns:
    {
        "bike_profile_id": "UUID",
        "status": "success" | "conflict" | "error",
        "message": "...",
        "number_plate": "KCA123A",
        "duplicate_detected": false,
        "duplicate_case_id": null
    }
    
    Error scenarios:
    - 404: Rider not found
    - 400: Invalid number plate format
    - 409: Number plate already exists (Conflict)
    - 422: Invalid fuel type
    - 500: Database error
    """
    
    # Verify rider exists
    rider = db.query(Rider).get(rider_id)
    if not rider:
        raise HTTPException(
            status_code=404,
            detail="Rider not found. Please complete registration first."
        )
    
    # Clean and validate number plate
    cleaned_plate = payload.number_plate.strip().upper()
    
    if len(cleaned_plate) < 5 or len(cleaned_plate) > 12:
        raise HTTPException(
            status_code=400,
            detail="Number plate must be between 5-12 characters. Example: KCA123A"
        )
    
    # Check for duplicate BEFORE creation
    duplicate_bike = db.query(BikeProfile).filter(
        BikeProfile.number_plate == cleaned_plate,
        BikeProfile.is_active == True
    ).first()
    
    if duplicate_bike:
        dup_rider = db.query(Rider).get(duplicate_bike.rider_id)
        dup_rider_name = dup_rider.full_name if dup_rider else "Unknown"
        
        raise HTTPException(
            status_code=409,
            detail=f"Number plate '{cleaned_plate}' is already registered to {dup_rider_name}. "
                   f"Please verify and use a different plate. Contact support if this is incorrect."
        )
    
    # Validate fuel type exists
    fuel_type = db.query(FuelTypeMaster).filter_by(
        code=payload.fuel_type_code,
        is_active=True
    ).first()
    
    if not fuel_type:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid fuel type: {payload.fuel_type_code}. Please select from available options."
        )
    
    # Create bike profile
    try:
        bike_profile = BikeProfile(
            rider_id=rider_id,
            number_plate=cleaned_plate,
            fuel_type_code=payload.fuel_type_code,
            submitted_at=datetime.now(timezone.utc).replace(tzinfo=None),
            sync_status="pending_sync",
            is_active=True
        )
        db.add(bike_profile)
        db.commit()
        db.refresh(bike_profile)
        
        # Check and resolve any duplicate issues (if any)
        duplicate_result = check_and_resolve_duplicate(db, bike_profile)
        
        return {
            "bike_profile_id": str(bike_profile.id),
            "status": "success",
            "message": f"Bike profile registered successfully with plate {cleaned_plate}",
            "number_plate": cleaned_plate,
            "fuel_type": payload.fuel_type_code,
            "duplicate_detected": duplicate_result.get("duplicate_detected", False),
            "duplicate_case_id": duplicate_result.get("case_id"),
            "sync_status": bike_profile.sync_status
        }
    
    except Exception as e:
        db.rollback()
        logger.error(f"Error submitting bike profile for rider {rider_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to save bike profile. Please try again or contact support."
        )


# ============================================================================
# ENDPOINT: Get Rider's Current Bike Profile
# ============================================================================

@router.get("/bike-profile/{rider_id}")
def get_bike_profile(
    rider_id: str,
    db: Session = Depends(get_db)
):
    """
    GET /onboarding/bike-profile/UUID
    
    Get the bike profile for a rider (if it exists).
    
    Returns:
    {
        "bike_profile_id": "UUID",
        "number_plate": "KCA123A",
        "fuel_type": "petrol",
        "fuel_type_display": "Petrol",
        "submitted_at": "2024-01-15T10:30:00Z",
        "is_active": true,
        "current_odometer_km": 12500,
        "battery_range_km": null
    }
    
    Returns 404 if no profile found
    """
    bike_profile = db.query(BikeProfile).filter_by(
        rider_id=rider_id,
        is_active=True
    ).first()
    
    if not bike_profile:
        raise HTTPException(
            status_code=404,
            detail="No bike profile found for this rider. Please complete registration."
        )
    
    # Get fuel type display name
    fuel_type = db.query(FuelTypeMaster).get(bike_profile.fuel_type_code)
    fuel_display = fuel_type.display_name if fuel_type else bike_profile.fuel_type_code
    
    return {
        "bike_profile_id": str(bike_profile.id),
        "number_plate": bike_profile.number_plate,
        "fuel_type": bike_profile.fuel_type_code,
        "fuel_type_display": fuel_display,
        "submitted_at": bike_profile.submitted_at.isoformat() if bike_profile.submitted_at else None,
        "is_active": bike_profile.is_active,
        "current_odometer_km": bike_profile.current_odometer_km or 0,
        "battery_range_km": bike_profile.battery_range_km
    }


# ============================================================================
# ENDPOINT: Update Bike Profile
# ============================================================================

@router.put("/bike-profile/{rider_id}")
def update_bike_profile(
    rider_id: str,
    payload: BikeProfileRequest,
    db: Session = Depends(get_db)
):
    """
    PUT /onboarding/bike-profile/UUID
    
    Update an existing bike profile.
    
    Validation:
    - Number plate must be unique (allowing current plate or a new unique one)
    - Fuel type must be valid
    
    Returns: Updated bike profile or error
    """
    
    # Get current profile
    bike_profile = db.query(BikeProfile).filter_by(
        rider_id=rider_id,
        is_active=True
    ).first()
    
    if not bike_profile:
        raise HTTPException(
            status_code=404,
            detail="No bike profile found to update"
        )
    
    # Clean new plate
    cleaned_plate = payload.number_plate.strip().upper()
    
    # If changing plate, check for duplicates
    if cleaned_plate != bike_profile.number_plate:
        duplicate = db.query(BikeProfile).filter(
            BikeProfile.number_plate == cleaned_plate,
            BikeProfile.is_active == True,
            BikeProfile.id != bike_profile.id  # Exclude current profile
        ).first()
        
        if duplicate:
            dup_rider = db.query(Rider).get(duplicate.rider_id)
            dup_name = dup_rider.full_name if dup_rider else "Unknown"
            
            raise HTTPException(
                status_code=409,
                detail=f"Number plate '{cleaned_plate}' is already registered to {dup_name}"
            )
    
    # Validate fuel type
    fuel_type = db.query(FuelTypeMaster).filter_by(
        code=payload.fuel_type_code,
        is_active=True
    ).first()
    
    if not fuel_type:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid fuel type: {payload.fuel_type_code}"
        )
    
    # Update profile
    try:
        bike_profile.number_plate = cleaned_plate
        bike_profile.fuel_type_code = payload.fuel_type_code
        db.commit()
        
        return {
            "bike_profile_id": str(bike_profile.id),
            "status": "success",
            "message": "Bike profile updated successfully",
            "number_plate": cleaned_plate,
            "fuel_type": payload.fuel_type_code
        }
    
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating bike profile: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to update bike profile"
        )


# ============================================================================
# ENDPOINT: Report Duplicate Plate (Support)
# ============================================================================

@router.post("/report-duplicate-plate")
def report_duplicate_plate(
    reported_plate: str = Query(..., description="The duplicate plate"),
    reason: str = Query(..., description="Why you believe this is a duplicate"),
    rider_id: str = Query(..., description="Your rider ID"),
    db: Session = Depends(get_db)
):
    """
    POST /onboarding/report-duplicate-plate?reported_plate=KCA123A&reason=...&rider_id=UUID
    
    Allow riders to report suspected duplicate plates for admin review.
    
    Returns: Case ID for tracking
    """
    
    # Verify rider exists
    rider = db.query(Rider).get(rider_id)
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    cleaned_plate = reported_plate.strip().upper()
    
    # Find the bike with this plate
    bike = db.query(BikeProfile).filter_by(
        number_plate=cleaned_plate,
        is_active=True
    ).first()
    
    if not bike:
        raise HTTPException(
            status_code=404,
            detail=f"Plate '{cleaned_plate}' not found in system"
        )
    
    # Create or update duplicate case
    try:
        case = db.query(DuplicatePlateCase).filter_by(
            number_plate=cleaned_plate
        ).first()
        
        if not case:
            case = DuplicatePlateCase(
                id=cleaned_plate,
                number_plate=cleaned_plate,
                rider_a_id=bike.rider_id,
                rider_b_id=rider_id,
                status="pending_review"
            )
            db.add(case)
        else:
            # Update case if one exists
            if case.rider_b_id != rider_id:
                case.rider_b_id = rider_id
        
        db.commit()
        
        return {
            "case_id": case.id,
            "status": "reported",
            "message": f"Duplicate plate case created. Admin will review within 24 hours.",
            "plate": cleaned_plate,
            "case_status": case.status
        }
    
    except Exception as e:
        db.rollback()
        logger.error(f"Error reporting duplicate plate: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to report duplicate plate"
        )