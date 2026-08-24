# backend/app/routers/mobile_number.py
# ✅ ENHANCED: Comprehensive mobile number validation with duplicate detection
# Provides clear error messages and guidance to customers

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import logging
import re

from app.database import get_db
from app.models.rider import Rider
from app.schemas.onboarding import MobileNumberRequest, ProfileConfirmRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboarding", tags=["Mobile Number"])

# Kenya mobile number patterns
VALID_MOBILE_PATTERNS = [
    r'^(\+254|0)(7|1)[0-9]{8}$',  # Kenya format: +254712345678 or 0712345678
]


# ============================================================================
# UTILITY: Validate and Normalize Mobile Number
# ============================================================================

def validate_mobile_number(mobile: str) -> tuple[bool, str, str]:
    """
    Validate mobile number format and normalize it.
    
    Returns: (is_valid, normalized_number, error_message)
    
    Accepts formats:
    - +254712345678
    - 0712345678
    - 254712345678
    
    Returns normalized format: +254712345678
    """
    if not mobile or not mobile.strip():
        return False, "", "Mobile number cannot be empty"
    
    cleaned = mobile.strip()
    
    # Remove all spaces and hyphens
    cleaned = cleaned.replace(" ", "").replace("-", "")
    
    # Normalize to +254 format
    if cleaned.startswith("0"):
        # 0712345678 → +254712345678
        normalized = "+254" + cleaned[1:]
    elif cleaned.startswith("254"):
        # 254712345678 → +254712345678
        normalized = "+" + cleaned
    elif cleaned.startswith("+254"):
        # Already in +254 format
        normalized = cleaned
    else:
        return False, "", f"Invalid mobile format. Please use: +254712345678 or 0712345678"
    
    # Validate against Kenya patterns
    base_number = normalized[1:]  # Remove +
    is_valid = any(re.match(pattern, normalized) for pattern in VALID_MOBILE_PATTERNS)
    
    if not is_valid:
        return False, "", f"Invalid mobile number format. Please enter a valid Kenya phone number."
    
    return True, normalized, ""


# ============================================================================
# ENDPOINT: Check Mobile Number Uniqueness (Real-time Validation)
# ============================================================================

@router.get("/check-mobile-uniqueness/{mobile_number}")
def check_mobile_uniqueness(mobile_number: str, db: Session = Depends(get_db)):
    """
    GET /onboarding/check-mobile-uniqueness/0712345678
    
    Check if a mobile number is already registered in the system.
    Provides real-time validation feedback for the mobile number screen.
    
    Returns:
    {
        "exists": false,
        "mobile_number": "+254712345678",
        "message": "This number is available",
        "status": "available",
        "formatted": "0712345678"
    }
    
    Possible statuses:
    - available: No registration found, number can be used
    - registered_verified: Number registered and verified to another account
    - registered_pending: Number associated with a pending registration (can update)
    """
    
    # Validate and normalize
    is_valid, normalized, error_msg = validate_mobile_number(mobile_number)
    
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    # Check if mobile exists
    existing_rider = db.query(Rider).filter_by(mobile_number=normalized).first()
    
    if existing_rider:
        if existing_rider.mobile_verified:
            # Registered and verified to someone else
            rider_name = existing_rider.full_name or "Another rider"
            return {
                "exists": True,
                "mobile_number": normalized,
                "formatted": normalized[3:],  # Remove +254, show as 0
                "message": f"This number is already registered and verified to {rider_name}. "
                          f"Please use a different number or login if this is your account.",
                "status": "registered_verified",
                "registered_to": rider_name,
                "can_reuse": False
            }
        else:
            # Registered but pending - can update
            return {
                "exists": True,
                "mobile_number": normalized,
                "formatted": normalized[3:],
                "message": "You previously started registration with this number. You can continue.",
                "status": "registered_pending",
                "rider_id": str(existing_rider.id),
                "can_reuse": True,
                "action": "continue_registration"
            }
    
    # No conflicts found
    return {
        "exists": False,
        "mobile_number": normalized,
        "formatted": normalized[3:],  # Show as 0712345678
        "message": "This mobile number is available and ready to use!",
        "status": "available",
        "can_use": True
    }


# ============================================================================
# ENDPOINT: Submit Mobile Number (Initial Registration Step)
# ============================================================================

@router.post("/mobile-number")
def submit_mobile_number(
    payload: MobileNumberRequest,
    db: Session = Depends(get_db)
):
    """
    POST /onboarding/mobile-number
    
    Submit mobile number to start registration.
    
    Validation:
    - Mobile number must be valid Kenya format
    - Mobile number must not be registered to another verified account
    - Can reuse pending registration numbers (allows retry)
    
    Returns:
    {
        "rider_id": "UUID",
        "status": "new_registration" | "continuing_registration",
        "message": "...",
        "mobile_number": "+254712345678",
        "action": "proceed_to_next_step"
    }
    
    Error scenarios:
    - 400: Invalid mobile format
    - 409: Mobile already registered and verified (Conflict)
    - 500: Database error
    """
    
    # Validate and normalize mobile number
    is_valid, normalized, error_msg = validate_mobile_number(payload.mobile_number)
    
    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mobile format: {error_msg}"
        )
    
    # Check if mobile is already registered
    existing_rider = db.query(Rider).filter_by(mobile_number=normalized).first()
    
    if existing_rider:
        if existing_rider.mobile_verified:
            # Phone verified to another account - block registration
            rider_name = existing_rider.full_name or "Another rider"
            raise HTTPException(
                status_code=409,
                detail=f"This number is already registered to {rider_name}. "
                       f"Please use a different number or login if this is your account. "
                       f"Contact support if you believe this is an error."
            )
        else:
            # Pending registration - allow user to continue/retry
            logger.info(f"Rider {existing_rider.id} restarting registration with mobile {normalized}")
            return {
                "rider_id": str(existing_rider.id),
                "status": "continuing_registration",
                "message": "Welcome back! Let's continue your registration.",
                "mobile_number": normalized,
                "formatted_mobile": normalized[3:],
                "action": "proceed_to_next_step"
            }
    
    # Create new rider with pending status
    try:
        new_rider = Rider(
            mobile_number=normalized,
            mobile_verified=False,
            registration_status="pending",
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            updated_at=datetime.now(timezone.utc).replace(tzinfo=None)
        )
        db.add(new_rider)
        db.commit()
        db.refresh(new_rider)
        
        logger.info(f"New rider {new_rider.id} registered with mobile {normalized}")
        
        return {
            "rider_id": str(new_rider.id),
            "status": "new_registration",
            "message": f"Mobile number registered successfully. A verification OTP will be sent to {normalized}",
            "mobile_number": normalized,
            "formatted_mobile": normalized[3:],
            "action": "proceed_to_verification"  # This will lead to OTP verification when implemented
        }
    
    except Exception as e:
        db.rollback()
        logger.error(f"Error submitting mobile number: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to register mobile number. Please try again or contact support."
        )


# ============================================================================
# ENDPOINT: Confirm Rider Profile (Name & Consent)
# ============================================================================

@router.post("/profile-confirm")
def profile_confirm(
    payload: ProfileConfirmRequest,
    rider_id: str = Query(..., description="Rider UUID"),
    db: Session = Depends(get_db)
):
    """
    POST /onboarding/profile-confirm?rider_id=UUID
    
    Confirm rider profile with full name and consent acceptance.
    
    Validation:
    - Rider must exist
    - Full name must be provided (not empty/whitespace)
    - Consent must be accepted
    - Full name must not already be registered to another verified rider
    
    Returns:
    {
        "status": "confirmed",
        "message": "Profile confirmed. Proceed to bike registration.",
        "rider_id": "UUID",
        "full_name": "John Doe",
        "next_step": "bike_profile"
    }
    
    Error scenarios:
    - 404: Rider not found
    - 422: Missing full name or consent not accepted
    - 409: Full name already registered to another verified rider (Conflict)
    - 500: Database error
    """
    
    # Validate consent first
    if not payload.consent_accepted:
        raise HTTPException(
            status_code=422,
            detail="You must accept the terms and conditions to proceed. "
                   "Please read and check the consent box.",
            headers={"X-Error-Code": "CONSENT_REQUIRED"}
        )
    
    # Check if rider exists
    rider = db.query(Rider).get(rider_id)
    if not rider:
        raise HTTPException(
            status_code=404,
            detail="Rider account not found. Please start registration from the beginning."
        )
    
    # Validate full name is provided
    if not payload.full_name or not payload.full_name.strip():
        raise HTTPException(
            status_code=422,
            detail="Full name is required. Please enter your complete name.",
            headers={"X-Error-Code": "FULL_NAME_REQUIRED"}
        )
    
    # Normalize full name
    full_name_clean = payload.full_name.strip()
    
    # Validate name length
    if len(full_name_clean) < 2 or len(full_name_clean) > 80:
        raise HTTPException(
            status_code=422,
            detail="Full name must be between 2-80 characters.",
            headers={"X-Error-Code": "FULL_NAME_INVALID"}
        )
    
    # Check if full name is already registered by another VERIFIED rider
    # Only check verified riders to avoid conflicts with other pending registrations
    existing_rider_with_name = db.query(Rider).filter(
        Rider.full_name == full_name_clean,
        Rider.id != rider_id,
        Rider.mobile_verified == True  # Only check verified accounts
    ).first()
    
    if existing_rider_with_name:
        # Full name conflict with another verified account
        raise HTTPException(
            status_code=409,
            detail="This full name is already registered to a verified account. "
                   f"Please verify your details and enter the correct name. "
                   f"Contact support if you believe this is an error.",
            headers={"X-Error-Code": "FULL_NAME_EXISTS"}
        )
    
    # Update rider profile
    try:
        rider.full_name = full_name_clean
        rider.consent_accepted_at = datetime.now(timezone.utc).replace(tzinfo=None)
        rider.consent_content_version = payload.consent_content_version
        rider.registration_status = "verified_incomplete"  # Mobile verified but PIN not yet created
        rider.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        
        db.commit()
        db.refresh(rider)
        
        logger.info(f"Rider {rider_id} confirmed profile with name: {full_name_clean}")
        
        return {
            "status": "confirmed",
            "message": f"Thank you {full_name_clean}! Your profile has been confirmed.",
            "rider_id": str(rider.id),
            "full_name": rider.full_name,
            "mobile_number": rider.mobile_number,
            "next_step": "bike_profile",
            "progress": "2/5"  # Show registration progress
        }
    
    except Exception as e:
        db.rollback()
        logger.error(f"Error confirming profile for rider {rider_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to save your profile. Please try again or contact support.",
            headers={"X-Error-Code": "PROFILE_SAVE_FAILED"}
        )


# ============================================================================
# ENDPOINT: Get Rider Mobile Details (Internal Use)
# ============================================================================

@router.get("/mobile-details/{rider_id}")
def get_mobile_details(
    rider_id: str,
    db: Session = Depends(get_db)
):
    """
    GET /onboarding/mobile-details/UUID
    
    Get mobile number and verification status for a rider.
    
    Returns:
    {
        "rider_id": "UUID",
        "mobile_number": "+254712345678",
        "formatted": "0712345678",
        "mobile_verified": false,
        "verified_at": null,
        "registration_status": "pending" | "verified_incomplete" | "active"
    }
    """
    
    rider = db.query(Rider).get(rider_id)
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    # Format mobile for display
    formatted_mobile = rider.mobile_number
    if formatted_mobile.startswith("+254"):
        formatted_mobile = "0" + formatted_mobile[4:]
    
    return {
        "rider_id": str(rider.id),
        "mobile_number": rider.mobile_number,
        "formatted": formatted_mobile,
        "mobile_verified": rider.mobile_verified,
        "verified_at": rider.updated_at.isoformat() if rider.mobile_verified else None,
        "registration_status": rider.registration_status,
        "full_name": rider.full_name
    }


# ============================================================================
# ENDPOINT: Update Mobile Number (For Support Cases)
# ============================================================================

@router.put("/mobile-number/{rider_id}")
def update_mobile_number(
    rider_id: str,
    new_mobile: str = Query(..., description="New mobile number"),
    reason: str = Query(default="", description="Reason for update"),
    db: Session = Depends(get_db)
):
    """
    PUT /onboarding/mobile-number/UUID?new_mobile=0712345678&reason=...
    
    Update a rider's mobile number (for pending registrations or with admin approval).
    
    Restrictions:
    - Can only update if rider is in pending or verified_incomplete status
    - New number must not be registered to another account
    - Cannot update verified mobile without special handling
    
    Returns: Updated mobile number
    """
    
    # Validate new mobile
    is_valid, normalized, error_msg = validate_mobile_number(new_mobile)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    # Get rider
    rider = db.query(Rider).get(rider_id)
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    # Can only update if not yet verified
    if rider.mobile_verified:
        raise HTTPException(
            status_code=403,
            detail="Cannot update a verified mobile number. Contact support if you need assistance."
        )
    
    # Check new mobile isn't already in use
    existing = db.query(Rider).filter(
        Rider.mobile_number == normalized,
        Rider.id != rider_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Mobile number {normalized} is already in use. Please use a different number."
        )
    
    # Update mobile number
    try:
        old_mobile = rider.mobile_number
        rider.mobile_number = normalized
        rider.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        
        logger.info(f"Rider {rider_id} updated mobile from {old_mobile} to {normalized}. Reason: {reason}")
        
        return {
            "status": "updated",
            "message": "Mobile number updated successfully",
            "old_mobile": old_mobile,
            "new_mobile": normalized,
            "formatted": normalized[3:]
        }
    
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating mobile for rider {rider_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update mobile number")