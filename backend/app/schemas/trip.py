"""
trip.py - CONSOLIDATED SCHEMA
Pydantic schemas for trip entry, correction, void requests, and related operations
Consolidates the previous trip.py, trip_schemas.py, and trips.py files
IMPORTANT: After applying fixes, delete trip_schemas.py and trips.py
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime

# ============= Trip Entry Schemas =============

class TripCreateRequest(BaseModel):
    """Schema for new trip entry (RA-04-A)"""
    rider_id: Optional[str] = Field(None, description="Rider ID (optional, taken from auth context)")
    amount: float = Field(..., gt=0, description="Trip fare amount in KSh")
    payment_channel_code: str = Field(..., description="Payment channel code (Cash, MPesa, LipaLater, etc.)")
    note: Optional[str] = Field(None, max_length=255, description="Optional trip note")
    recorded_at: datetime = Field(default_factory=datetime.utcnow, description="Rider's own submission timestamp")

    model_config = {
        "json_schema_extra": {
            "example": {
                "amount": 250.00,
                "payment_channel_code": "CASH",
                "note": "Trip to Nairobi CBD",
                "recorded_at": "2024-01-15T14:30:00Z",
            }
        }
    }


# Alias for backwards compatibility
TripEntryRequest = TripCreateRequest


class TripResponse(BaseModel):
    """Schema for trip responses"""
    id: int
    amount: float
    payment_method: str
    timestamp: datetime
    status: str  # 'active', 'voided'
    sync_status: str  # 'pending', 'synced'
    note: Optional[str] = None
    correction_reason: Optional[str] = None
    original_amount: Optional[float] = None
    lipa_later_customer_name: Optional[str] = None
    is_editable: bool = True
    hours_remaining: float = 24.0

    model_config = {"from_attributes": True}


# ============= Trip Correction Schemas (RA-04-B) =============

class TripCorrectionRequest(BaseModel):
    """Schema for trip correction within 24-hour window"""
    new_amount: float = Field(..., gt=0, description="Corrected fare amount")
    new_method: str = Field(..., description="New payment method")
    reason: str = Field(..., description="Correction reason")

    @field_validator('new_method')
    @classmethod
    def validate_payment_method(cls, v):
        allowed = ['Cash', 'MPesa', 'LipaLater']
        if v not in allowed:
            raise ValueError(f'Payment method must be one of {allowed}')
        return v

    @field_validator('reason')
    @classmethod
    def validate_reason(cls, v):
        allowed_reasons = [
            'Wrong amount entered',
            'Customer negotiated price',
            'Duplicate entry',
            'Test trip',
            'Other (specify in admin)',
        ]
        if v not in allowed_reasons:
            raise ValueError(f'Invalid correction reason: {v}')
        return v

    model_config = {
        "json_schema_extra": {
            "example": {
                "new_amount": 300.00,
                "new_method": "MPesa",
                "reason": "Wrong amount entered",
            }
        }
    }


class TripVoidRequest(BaseModel):
    """Schema for trip void request"""
    reason: str = Field(..., description="Reason for voiding")

    @field_validator('reason')
    @classmethod
    def validate_reason(cls, v):
        allowed_reasons = [
            'Wrong amount entered',
            'Customer negotiated price',
            'Duplicate entry',
            'Test trip',
            'Other (specify in admin)',
        ]
        if v not in allowed_reasons:
            raise ValueError(f'Invalid void reason: {v}')
        return v

    model_config = {
        "json_schema_extra": {
            "example": {
                "reason": "Duplicate entry",
            }
        }
    }


class OutOfWindowCorrectionRequest(BaseModel):
    """Schema for out-of-window correction requests (after 24 hours)"""
    requested_amount: float = Field(..., gt=0, description="Requested corrected amount")
    reason: str = Field(..., max_length=500, description="Reason for correction request")

    model_config = {
        "json_schema_extra": {
            "example": {
                "requested_amount": 350.00,
                "reason": "Customer called back next morning about wrong amount",
            }
        }
    }


class OutOfWindowCorrectionResponse(BaseModel):
    """Response for out-of-window correction submission"""
    request_id: int
    status: str  # 'pending'
    message: str

    model_config = {
        "json_schema_extra": {
            "example": {
                "request_id": 12345,
                "status": "pending",
                "message": "Your correction request has been submitted. We'll update you within 72 hours.",
            }
        }
    }


# ============= Daily Summary Schemas =============

class TripByChannel(BaseModel):
    """Trip grouped by payment channel"""
    method: str
    amount: float
    count: int
    percentage: float


class DailySummaryResponse(BaseModel):
    """Daily trade summary data"""
    trips_count: int
    total_amount: float
    by_channel: dict  # {method: amount}
    trips: Optional[List[TripResponse]] = []
    pending_lipa_later_count: int = 0
    settled_lipa_later_today: int = 0
    settled_lipa_later_amount: float = 0.0

    model_config = {
        "json_schema_extra": {
            "example": {
                "trips_count": 5,
                "total_amount": 1250.00,
                "by_channel": {
                    "Cash": 750.00,
                    "MPesa": 500.00,
                },
                "trips": [],
                "pending_lipa_later_count": 2,
                "settled_lipa_later_today": 1,
                "settled_lipa_later_amount": 300.00,
            }
        }
    }


# Alias for backwards compatibility
DailyTotalResponse = DailySummaryResponse


# ============= Sync Queue Schemas =============

class SyncQueueResponse(BaseModel):
    """Response for pending sync records"""
    queued_trips: int
    last_successful_sync: Optional[datetime] = None
    hours_since_sync: float = 0.0
    connectivity_status: str  # 'online', 'offline'
    pending_records: List[dict] = []

    model_config = {
        "json_schema_extra": {
            "example": {
                "queued_trips": 3,
                "last_successful_sync": "2024-01-15T14:30:00Z",
                "hours_since_sync": 2.5,
                "connectivity_status": "online",
                "pending_records": [],
            }
        }
    }


# ============= Additional Schemas for Transaction History =============

class TransactionItem(BaseModel):
    """Individual transaction item"""
    type: str  # 'income', 'expense'
    description: str
    amount: float
    timestamp: datetime
    id: int
    category: Optional[str] = None

    model_config = {
        "json_schema_extra": {
            "example": {
                "type": "income",
                "description": "Trip - Cash",
                "amount": 250.00,
                "timestamp": "2024-01-15T14:30:00Z",
                "id": 1,
            }
        }
    }


class TransactionListResponse(BaseModel):
    """List of transactions"""
    period: str
    transactions: List[TransactionItem]
    total_income: float = 0.0
    total_expenses: float = 0.0


class HistoricalTripData(BaseModel):
    """Historical trip data for analytics"""
    id: int
    amount: float
    payment_method: str
    recorded_at: datetime
    status: str
    note: Optional[str] = None
    lipa_later_details: Optional[dict] = None

    model_config = {"from_attributes": True}