# backend/app/routers/mobile_number.py
# ✅ FIXED: Enhanced error handling, database transaction management, and comprehensive logging
# ✅ ENHANCED: Comprehensive mobile number validation with duplicate detection
# NOTE: the old POST /onboarding/mobile-number and /profile-confirm endpoints were removed. Riders are created by
# routers/setup_profile.py (Setup My Profile), only for numbers a Group Treasurer registered.
# Provides clear error messages and guidance to customers

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from datetime import datetime, timezone
import logging
import re
import uuid

from app.database import get_db
from app.models.rider import Rider

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
    
    try:
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
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking mobile uniqueness for {mobile_number}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to check mobile number availability. Please try again.",
            headers={"X-Error-Code": "CHECK_MOBILE_FAILED"}
        )


# ============================================================================
# ENDPOINT: Confirm Mobile Number (Mobile Verification Step)
# ============================================================================

@router.post("/mobile-confirm/{rider_id}")
def confirm_mobile_number(
    rider_id: str,
    db: Session = Depends(get_db)
):
    """
    POST /onboarding/mobile-confirm/UUID
    
    Confirm/verify the mobile number for a rider.
    This endpoint marks the mobile as verified after successful OTP validation.
    
    Returns:
    {
        "status": "verified",
        "message": "Mobile number verified successfully",
        "rider_id": "UUID",
        "mobile_number": "+254712345678",
        "next_step": "profile_confirm"
    }
    """
    
    try:
        # Get rider
        rider = db.query(Rider).get(rider_id)
        if not rider:
            logger.warning(f"Mobile confirm attempted for non-existent rider: {rider_id}")
            raise HTTPException(
                status_code=404,
                detail="Rider not found",
                headers={"X-Error-Code": "RIDER_NOT_FOUND"}
            )
        
        # ✅ FIXED: Add proper error handling for mobile verification
        try:
            rider.mobile_verified = True
            rider.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            
            db.commit()
            db.refresh(rider)
            
            logger.info(f"Mobile number verified for rider {rider_id}: {rider.mobile_number}")
            
            return {
                "status": "verified",
                "message": "Mobile number verified successfully",
                "rider_id": str(rider.id),
                "mobile_number": rider.mobile_number,
                "next_step": "profile_confirm",
                "progress": "1/5"
            }
        
        except IntegrityError as e:
            db.rollback()
            logger.error(f"Integrity error confirming mobile for rider {rider_id}: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=409,
                detail="Mobile number conflict. Please contact support.",
                headers={"X-Error-Code": "MOBILE_CONFLICT"}
            )
        
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Database error confirming mobile for rider {rider_id}: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Failed to verify mobile number. Please try again.",
                headers={"X-Error-Code": "DB_ERROR"}
            )
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Unhandled error in confirm_mobile_number for rider {rider_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to verify mobile number. Please try again.",
            headers={"X-Error-Code": "VERIFICATION_FAILED"}
        )


# ============================================================================
# ENDPOINT: Confirm Profile (Profile Information Step)
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
    
    try:
        rider = db.query(Rider).get(rider_id)
        if not rider:
            logger.warning(f"Mobile details requested for non-existent rider: {rider_id}")
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
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving mobile details for rider {rider_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve mobile details.",
            headers={"X-Error-Code": "RETRIEVE_FAILED"}
        )


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
    
    try:
        # Validate new mobile
        is_valid, normalized, error_msg = validate_mobile_number(new_mobile)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)
        
        # Get rider
        rider = db.query(Rider).get(rider_id)
        if not rider:
            logger.warning(f"Mobile update attempted for non-existent rider: {rider_id}")
            raise HTTPException(status_code=404, detail="Rider not found")
        
        # Can only update if not yet verified
        if rider.mobile_verified:
            logger.warning(f"Attempted to update verified mobile for rider {rider_id}")
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
            logger.warning(f"Attempted mobile update to already-used number {normalized} for rider {rider_id}")
            raise HTTPException(
                status_code=409,
                detail=f"Mobile number {normalized} is already in use. Please use a different number."
            )
        
        # ✅ FIXED: Update mobile number with proper error handling
        try:
            old_mobile = rider.mobile_number
            rider.mobile_number = normalized
            rider.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            
            db.commit()
            db.refresh(rider)
            
            logger.info(f"Rider {rider_id} updated mobile from {old_mobile} to {normalized}. Reason: {reason}")
            
            return {
                "status": "updated",
                "message": "Mobile number updated successfully",
                "old_mobile": old_mobile,
                "new_mobile": normalized,
                "formatted": normalized[3:]
            }
        
        except IntegrityError as e:
            db.rollback()
            logger.error(f"Integrity error updating mobile for rider {rider_id}: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=409,
                detail="Mobile number is already in use.",
                headers={"X-Error-Code": "MOBILE_DUPLICATE"}
            )
        
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Database error updating mobile for rider {rider_id}: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Failed to update mobile number.",
                headers={"X-Error-Code": "DB_ERROR"}
            )
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Unhandled error updating mobile for rider {rider_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to update mobile number",
            headers={"X-Error-Code": "UPDATE_FAILED"}
        )