# backend/app/schemas/maintenance_tracking.py
# UPDATED (UAT #2_Fuel_Battery_and_Service_Related.docx):
# - Removed notes field entirely
# - Made odometer_km optional (only required for Oil Change and General Service dated types)

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class MaintenanceEntryRequest(BaseModel):
    """Request to log a maintenance service entry."""
    rider_id: int
    bike_id: int
    service_type: str = Field(..., description="Oil Change, Chain & Sprocket, Brake Pads, Tyres, etc.")
    cost_ksh: float = Field(..., gt=0, description="Cost in KSh")
    # UPDATED: odometer_km is now optional - only required for dated services (Oil Change, General Service)
    odometer_km: Optional[float] = Field(None, gt=0, description="Odometer reading at service (required for Oil Change/General Service only)")
    oil_type: Optional[str] = Field(None, description="Oil type (required for Oil Change/General Service only)")
    # REMOVED (UAT): notes field is no longer accepted


class MaintenanceEntryResponse(BaseModel):
    """Response after logging a maintenance entry."""
    id: int
    service_type: str
    cost_ksh: float
    next_service_odometer: Optional[float] = None
    created_at: datetime


class DueServiceResponse(BaseModel):
    """Information about a due service."""
    service_type: str
    remaining_km: float
    next_due_odometer: float
    tier: str = Field(..., description="overdue | final | firm | first")
    icon: Optional[str] = None