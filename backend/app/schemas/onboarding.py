# backend/app/schemas/onboarding.py
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
    device_id: str
    number_plate: str = Field(..., max_length=12, min_length=1)
    fuel_type_code: str

    # BR-SB02-001: auto-uppercase, EXC-SB02-007: blank/whitespace-only is invalid
    @field_validator("number_plate")
    @classmethod
    def normalise_plate(cls, v: str) -> str:
        cleaned = v.strip().upper()
        if not cleaned or not any(c.isalnum() for c in cleaned):
            raise ValueError("Number plate is required.")
        return cleaned

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
