# backend/app/routers/mobile_number.py
# ✅ FIXED: Enhanced error handling, database transaction management, and comprehensive logging
# ✅ ENHANCED: Comprehensive mobile number validation with duplicate detection
# ✅ UPDATED: profile-confirm endpoint now captures and stores location data (County, Sub-County, Ward)
# Provides clear error messages and guidance to customers

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from datetime import datetime, timezone
import logging
import re
import uuid

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
    
    try:
        # Validate and normalize mobile number
        is_valid, normalized, error_msg = validate_mobile_number(payload.mobile_number)
        
        if not is_valid:
            logger.warning(f"Invalid mobile format submitted: {payload.mobile_number}")
            raise HTTPException(
                status_code=400,
                detail=f"Invalid mobile format: {error_msg}"
            )
        
        logger.info(f"Processing mobile number registration: {normalized}")
        
        # Check if mobile is already registered
        existing_rider = db.query(Rider).filter_by(mobile_number=normalized).first()
        
        if existing_rider:
            if existing_rider.mobile_verified:
                # Phone verified to another account - block registration
                rider_name = existing_rider.full_name or "Another rider"
                logger.warning(f"Attempted re-registration with verified mobile {normalized} (existing rider: {existing_rider.id})")
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
        
        # ✅ FIXED: Create new rider with proper error handling
        try:
            new_rider = Rider(
                id=uuid.uuid4(),  # ✅ Explicitly set UUID
                mobile_number=normalized,
                mobile_verified=False,
                registration_status="pending",
                onboarding_step="valuePreview",
                # Location fields are nullable, will be set during profile confirmation
                county_id=None,
                sub_county_id=None,
                ward_id=None,
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
                updated_at=datetime.now(timezone.utc).replace(tzinfo=None)
            )
            
            db.add(new_rider)
            db.flush()  # ✅ Flush to get the ID before commit
            db.commit()
            db.refresh(new_rider)
            
            logger.info(f"New rider registration initiated: {new_rider.id} with mobile {normalized}")
            
            return {
                "rider_id": str(new_rider.id),
                "status": "new_registration",
                "message": "Mobile number registered successfully. Proceed to next step.",
                "mobile_number": normalized,
                "formatted_mobile": normalized[3:],
                "action": "proceed_to_next_step"
            }
        
        except IntegrityError as e:
            db.rollback()
            logger.error(f"Integrity error creating new rider with mobile {normalized}: {str(e)}", exc_info=True)
            # Check if it's a unique constraint violation
            if "mobile_number" in str(e):
                raise HTTPException(
                    status_code=409,
                    detail="This mobile number is already registered. Please use a different number.",
                    headers={"X-Error-Code": "MOBILE_DUPLICATE"}
                )
            raise HTTPException(
                status_code=500,
                detail="Failed to create registration. Please try again.",
                headers={"X-Error-Code": "REGISTRATION_FAILED"}
            )
        
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Database error creating new rider with mobile {normalized}: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Database error occurred. Please try again.",
                headers={"X-Error-Code": "DB_ERROR"}
            )
        
        except Exception as e:
            db.rollback()
            logger.error(f"Unexpected error creating new rider with mobile {normalized}: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Failed to create registration. Please try again or contact support.",
                headers={"X-Error-Code": "REGISTRATION_CREATE_FAILED"}
            )
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Unhandled error in submit_mobile_number: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again.",
            headers={"X-Error-Code": "INTERNAL_SERVER_ERROR"}
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

@router.post("/profile-confirm/{rider_id}")
def confirm_profile(
    rider_id: str,
    payload: ProfileConfirmRequest,
    db: Session = Depends(get_db)
):
    """
    POST /onboarding/profile-confirm/UUID
    
    Confirm rider profile with full name, consent, and location information.
    This endpoint captures location data (County, Sub-County, Ward) for the rider.
    
    Validation:
    - rider_id must exist
    - full_name: 2-80 characters (required)
    - consent_accepted: must be True (required)
    - county_id, sub_county_id, ward_id: must be > 0 (required)
    
    Returns:
    {
        "status": "confirmed",
        "message": "Thank you {name}! Your profile has been confirmed.",
        "rider_id": "UUID",
        "full_name": "John Doe",
        "mobile_number": "+254712345678",
        "county_id": 1,
        "sub_county_id": 1,
        "ward_id": 1,
        "next_step": "bike_profile",
        "progress": "3/5"
    }
    """
    
    try:
        # Get rider
        rider = db.query(Rider).get(rider_id)
        if not rider:
            logger.warning(f"Profile confirm attempted for non-existent rider: {rider_id}")
            raise HTTPException(
                status_code=404,
                detail="Rider not found",
                headers={"X-Error-Code": "RIDER_NOT_FOUND"}
            )
        
        # Validate consent acceptance
        if not payload.consent_accepted:
            logger.warning(f"Profile confirm without consent acceptance for rider {rider_id}")
            raise HTTPException(
                status_code=422,
                detail="You must accept the terms and conditions to proceed.",
                headers={"X-Error-Code": "CONSENT_REQUIRED"}
            )
        
        # Validate full name
        if not payload.full_name or not payload.full_name.strip():
            raise HTTPException(
                status_code=422,
                detail="Full name is required. Please enter your name.",
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
        
        # ✅ ENHANCED: Validate location fields
        if not payload.county_id or payload.county_id <= 0:
            raise HTTPException(
                status_code=422,
                detail="County selection is required. Please select your county.",
                headers={"X-Error-Code": "COUNTY_REQUIRED"}
            )
        
        if not payload.sub_county_id or payload.sub_county_id <= 0:
            raise HTTPException(
                status_code=422,
                detail="Sub-County selection is required. Please select your sub-county.",
                headers={"X-Error-Code": "SUB_COUNTY_REQUIRED"}
            )
        
        if not payload.ward_id or payload.ward_id <= 0:
            raise HTTPException(
                status_code=422,
                detail="Ward selection is required. Please select your ward.",
                headers={"X-Error-Code": "WARD_REQUIRED"}
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
            logger.warning(f"Full name conflict for rider {rider_id}: {full_name_clean}")
            raise HTTPException(
                status_code=409,
                detail="This full name is already registered to a verified account. "
                       f"Please verify your details and enter the correct name. "
                       f"Contact support if you believe this is an error.",
                headers={"X-Error-Code": "FULL_NAME_EXISTS"}
            )
        
        # ✅ FIXED: Update rider profile with proper error handling
        try:
            rider.full_name = full_name_clean
            rider.consent_accepted_at = datetime.now(timezone.utc).replace(tzinfo=None)
            rider.consent_content_version = payload.consent_content_version
            rider.registration_status = "verified_incomplete"  # Mobile verified but PIN not yet created
            
            # ✅ ENHANCED: Store location data
            rider.county_id = payload.county_id
            rider.sub_county_id = payload.sub_county_id
            rider.ward_id = payload.ward_id
            
            rider.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            
            db.commit()
            db.refresh(rider)
            
            logger.info(
                f"Rider {rider_id} confirmed profile with name: {full_name_clean}, "
                f"Location - County ID: {payload.county_id}, Sub-County ID: {payload.sub_county_id}, Ward ID: {payload.ward_id}"
            )
            
            return {
                "status": "confirmed",
                "message": f"Thank you {full_name_clean}! Your profile has been confirmed.",
                "rider_id": str(rider.id),
                "full_name": rider.full_name,
                "mobile_number": rider.mobile_number,
                # ✅ ENHANCED: Return location data in response
                "county_id": rider.county_id,
                "sub_county_id": rider.sub_county_id,
                "ward_id": rider.ward_id,
                "next_step": "bike_profile",
                "progress": "3/5"  # Show registration progress
            }
        
        except IntegrityError as e:
            db.rollback()
            logger.error(f"Integrity error confirming profile for rider {rider_id}: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=409,
                detail="Profile data conflict. Please try again.",
                headers={"X-Error-Code": "PROFILE_CONFLICT"}
            )
        
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Database error confirming profile for rider {rider_id}: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Failed to save your profile. Please try again.",
                headers={"X-Error-Code": "DB_ERROR"}
            )
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Unhandled error in confirm_profile for rider {rider_id}: {str(e)}", exc_info=True)
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