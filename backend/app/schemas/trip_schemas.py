"""
trip_schemas.py
Pydantic schemas for trip entry, correction, and void requests
"""

from pydantic import BaseModel, Field, validator
from typing import Optional
from datetime import datetime

# ============= Trip Entry Schemas =============

class TripEntryRequest(BaseModel):
    """Schema for new trip entry (RA-04-A)"""
    amount: float = Field(..., gt=0, description="Trip fare amount in KSh")
    payment_method: str = Field(..., description="Cash, MPesa, or LipaLater")
    note: Optional[str] = Field(None, max_length=255, description="Optional trip note")
    
    # Lipa Later fields
    lipa_later_customer_name: Optional[str] = Field(None, max_length=255)
    lipa_later_phone: Optional[str] = Field(None, max_length=20)
    lipa_later_due_date: Optional[datetime] = None
    
    @validator('payment_method')
    def validate_payment_method(cls, v):
        allowed = ['Cash', 'MPesa', 'LipaLater']
        if v not in allowed:
            raise ValueError(f'Payment method must be one of {allowed}')
        return v
    
    class Config:
        schema_extra = {
            "example": {
                "amount": 250.00,
                "payment_method": "Cash",
                "note": "Trip to Nairobi CBD",
                "lipa_later_customer_name": None,
            }
        }


class TripResponse(BaseModel):
    """Schema for trip responses"""
    id: int
    amount: float
    payment_method: str
    timestamp: datetime
    status: str  # 'active', 'voided'
    sync_status: str  # 'pending', 'synced'
    note: Optional[str]
    correction_reason: Optional[str]
    original_amount: Optional[float]
    lipa_later_customer_name: Optional[str]
    is_editable: bool
    hours_remaining: float
    
    class Config:
        from_attributes = True


# ============= Trip Correction Schemas (RA-04-B) =============

class TripCorrectionRequest(BaseModel):
    """Schema for trip correction within 24-hour window"""
    new_amount: float = Field(..., gt=0, description="Corrected fare amount")
    new_method: str = Field(..., description="New payment method")
    reason: str = Field(..., description="Correction reason")
    
    @validator('new_method')
    def validate_payment_method(cls, v):
        allowed = ['Cash', 'MPesa', 'LipaLater']
        if v not in allowed:
            raise ValueError(f'Payment method must be one of {allowed}')
        return v
    
    @validator('reason')
    def validate_reason(cls, v):
        allowed_reasons = [
            'Wrong amount entered',
            'Customer negotiated price',
            'Duplicate entry',
            'Test trip',
            'Other (specify in admin)',
        ]
        if v not in allowed_reasons:
            raise ValueError(f'Invalid correction reason')
        return v
    
    class Config:
        schema_extra = {
            "example": {
                "new_amount": 300.00,
                "new_method": "MPesa",
                "reason": "Wrong amount entered",
            }
        }


class TripVoidRequest(BaseModel):
    """Schema for trip void request"""
    reason: str = Field(..., description="Reason for voiding")
    
    @validator('reason')
    def validate_reason(cls, v):
        allowed_reasons = [
            'Wrong amount entered',
            'Customer negotiated price',
            'Duplicate entry',
            'Test trip',
            'Other (specify in admin)',
        ]
        if v not in allowed_reasons:
            raise ValueError(f'Invalid void reason')
        return v
    
    class Config:
        schema_extra = {
            "example": {
                "reason": "Duplicate entry",
            }
        }


class OutOfWindowCorrectionRequest(BaseModel):
    """Schema for out-of-window correction requests (after 24 hours)"""
    requested_amount: float = Field(..., gt=0, description="Requested corrected amount")
    reason: str = Field(..., max_length=500, description="Reason for correction request")
    
    class Config:
        schema_extra = {
            "example": {
                "requested_amount": 350.00,
                "reason": "Customer called back next morning about wrong amount",
            }
        }


class OutOfWindowCorrectionResponse(BaseModel):
    """Response for out-of-window correction submission"""
    request_id: int
    status: str  # 'pending'
    message: str
    
    class Config:
        schema_extra = {
            "example": {
                "request_id": 12345,
                "status": "pending",
                "message": "Your correction request has been submitted. We'll update you within 72 hours.",
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
    trips: list[TripResponse]
    pending_lipa_later_count: int
    settled_lipa_later_today: int
    settled_lipa_later_amount: float
    
    class Config:
        schema_extra = {
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


# ============= Sync Queue Schemas =============

class SyncQueueResponse(BaseModel):
    """Response for pending sync records"""
    queued_trips: int
    last_successful_sync: Optional[datetime]
    hours_since_sync: float
    connectivity_status: str  # 'online', 'offline'
    pending_records: list[dict]
    
    class Config:
        schema_extra = {
            "example": {
                "queued_trips": 3,
                "last_successful_sync": "2024-01-15T14:30:00Z",
                "hours_since_sync": 2.5,
                "connectivity_status": "online",
                "pending_records": [],
            }
        }