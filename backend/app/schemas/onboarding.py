# backend/app/schemas/onboarding.py
# Setup My Profile replaces the old bike-profile / mobile-number / profile-confirm screens (no number plate anywhere).
# ✅ ENHANCED: Added county_id, sub_county_id, and ward_id to ProfileConfirmRequest
# These fields capture the rider's selected operating location during profile confirmation
# ✓ VERIFIED: Using Pydantic V2 syntax (field_validator, ConfigDict)

from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional
from datetime import datetime

class LanguageSelectRequest(BaseModel):
    device_id: str
    language_code: str

class BikeProfileRequest(BaseModel):
    """The rider's fuel type, queued by the app (sync type "bike_profile") and sent after the rider_id exists.
    There is NO number plate: the rider is identified by mobile number."""
    device_id: str
    fuel_type_code: str
    mobile_number: Optional[str] = Field(default=None, max_length=15)

class SetupProfileRequest(BaseModel):
    """Setup My Profile: the rider types the mobile number their Group Treasurer registered, picks the fuel type and accepts the terms.
    The full name and operating location come from the Treasurer's record, never from the rider."""
    device_id: Optional[str] = None
    mobile_number: str = Field(..., max_length=15)
    fuel_type_code: str
    consent_accepted: bool
    consent_content_version: str
    language_code: Optional[str] = None

class MobileNumberRequest(BaseModel):
    mobile_number: str = Field(..., max_length=15)

    # BR-SB03-001: Kenyan numbering plan (07XXXXXXXX / 01XXXXXXXX / +2547XXXXXXXX)
    @field_validator("mobile_number")
    @classmethod
    def validate_kenyan_msisdn(cls, v: str) -> str:
        import re
        if not re.match(r"^(\+254|0)(7|1)\d{8}$", v):
            raise ValueError("Enter a valid Kenyan mobile number.")
        return v

class ProfileConfirmRequest(BaseModel):
    """
    Profile confirmation request with location selection.
    
    Enhanced to capture rider's operating location (County, Sub-County, Ward)
    for better location-based services and analytics.
    
    Fields:
    - device_id: Optional device identifier
    - full_name: Rider's full name (required, 1-80 characters)
    - consent_accepted: Must be True to proceed (required)
    - consent_content_version: Version of terms accepted (required)
    - county_id: Selected county ID (required)
    - sub_county_id: Selected sub-county ID (required)
    - ward_id: Selected ward ID (required)
    """
    device_id: Optional[str] = None
    full_name: str = Field(..., max_length=80, min_length=1)
    consent_accepted: bool
    consent_content_version: str
    # (is_treasurer was removed: a Treasurer is activated by the administrator's Chama Code, not self-declared.
    #  Older app versions that still send it are accepted and the value is ignored.)
    
    # ✅ ENHANCED: Location fields for rider profile
    county_id: int = Field(..., gt=0, description="County ID (must be > 0)")
    sub_county_id: int = Field(..., gt=0, description="Sub-County ID (must be > 0)")
    ward_id: int = Field(..., gt=0, description="Ward ID (must be > 0)")

class PinCreateRequest(BaseModel):
    device_id: Optional[str] = None
    pin: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$")
    pin_confirm: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$")

class PinLoginRequest(BaseModel):
    rider_id: str
    pin: str = Field(..., min_length=4, max_length=4)

class PinRecoveryConfirmRequest(BaseModel):
    recovery_request_id: str  # must be Super-Admin-approved before this call is accepted
    new_pin: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$")
    new_pin_confirm: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$")
