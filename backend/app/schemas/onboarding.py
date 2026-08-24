# backend/app/schemas/onboarding.py
# ✓ VERIFIED: Already using Pydantic V2 syntax (field_validator, ConfigDict)
# No changes needed - file is correctly implemented

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
    device_id: Optional[str] = None
    full_name: str = Field(..., max_length=80, min_length=1)
    consent_accepted: bool
    consent_content_version: str

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