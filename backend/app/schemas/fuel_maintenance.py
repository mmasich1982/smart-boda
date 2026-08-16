# backend/app/schemas/fuel_maintenance.py
from pydantic import BaseModel, Field
from typing import Optional

class FuelEntryRequest(BaseModel):
    mode: str = Field(..., pattern="^(petrol|swap|charging)$")  # BR-SB09-005/BR-SB10-001
    litres: Optional[float] = None          # petrol only, BR-SB09-001
    cost: float = Field(..., gt=0)                # BR-SB09-002/BR-SB10-011
    swap_partner_id: Optional[str] = None        # swap only, BR-SB10-004
    odometer_reading: Optional[int] = None     # swap + charging, BR-SB10-006

class OdometerReadingRequest(BaseModel):
    value_km: int = Field(..., gt=0)              # BR-SB11-002
    is_reset_override: bool = False            # BR-SB11-012

class MaintenanceEntryRequest(BaseModel):
    service_type_code: str
    cost: float = Field(..., gt=0)                # BR-SB12-011
    odometer_reading: Optional[float] = None     # dated types only, BR-SB12-003 (SB-11 becomes SB-12-A here)
    oil_type_code: Optional[str] = None          # dated types only, BR-SB12-002