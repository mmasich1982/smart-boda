# backend/app/schemas/one_time_link.py
"""
One-Time Link Schemas - Request and response validation
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID


class OneTimeLinkCreate(BaseModel):
    """Schema for creating a new one-time link"""
    rider_id: UUID = Field(..., description="ID of the rider")
    expiry_hours: int = Field(24, ge=1, le=720, description="Hours until link expires (1-720 hours)")
    purpose: str = Field("app_share", description="Purpose of the link: app_share, referral, etc.")
    device_fingerprint: Optional[str] = Field(None, description="Optional device fingerprint to bind link")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")
    
    class Config:
        schema_extra = {
            "example": {
                "rider_id": "550e8400-e29b-41d4-a716-446655440000",
                "expiry_hours": 24,
                "purpose": "app_share",
                "metadata": {
                    "referral_code": "ABC123",
                    "campaign": "onboarding"
                }
            }
        }


class OneTimeLinkGenerateResponse(BaseModel):
    """Schema for generated link response"""
    id: UUID = Field(..., description="Unique link ID")
    token: str = Field(..., description="Secret token to share")
    rider_id: UUID = Field(..., description="Rider ID")
    status: str = Field(..., description="Current link status")
    created_at: datetime = Field(..., description="When link was created")
    expires_at: datetime = Field(..., description="When link expires")
    accessed_at: Optional[datetime] = Field(None, description="When link was accessed")
    purpose: str = Field(..., description="Purpose of the link")
    access_count: int = Field(0, description="Number of access attempts")
    share_url: str = Field(..., description="Full URL to share")
    share_qr_code: Optional[str] = Field(None, description="Base64 encoded QR code image")
    
    class Config:
        schema_extra = {
            "example": {
                "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "token": "aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK",
                "rider_id": "550e8400-e29b-41d4-a716-446655440000",
                "status": "active",
                "created_at": "2024-01-15T10:30:00Z",
                "expires_at": "2024-01-16T10:30:00Z",
                "accessed_at": None,
                "purpose": "app_share",
                "access_count": 0,
                "share_url": "https://smartboda.com/claim?token=aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK",
                "share_qr_code": "data:image/png;base64,..."
            }
        }


class OneTimeLinkClaimRequest(BaseModel):
    """Schema for claiming a one-time link"""
    token: str = Field(..., min_length=32, description="Link token to claim")
    device_fingerprint: str = Field(..., description="Device fingerprint of the claimer")
    user_agent: Optional[str] = Field(None, description="User agent string")
    ip_address: Optional[str] = Field(None, description="IP address of the claimer")
    
    class Config:
        schema_extra = {
            "example": {
                "token": "aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK",
                "device_fingerprint": "device_id_123-1706425800000",
                "user_agent": "Mozilla/5.0 (Linux; Android 12) ...",
                "ip_address": "192.168.1.1"
            }
        }


class OneTimeLinkClaimResponse(BaseModel):
    """Schema for successful link claim response"""
    is_valid: bool = Field(..., description="Whether link is valid")
    link_id: Optional[UUID] = Field(None, description="ID of the claimed link")
    rider_id: Optional[UUID] = Field(None, description="Rider ID from the link")
    status: Optional[str] = Field(None, description="Link status")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Link metadata")
    error: Optional[str] = Field(None, description="Error message if invalid")
    error_code: Optional[str] = Field(None, description="Error code for client handling")
    access_count: Optional[int] = Field(None, description="Number of access attempts")
    
    class Config:
        schema_extra = {
            "example": {
                "is_valid": True,
                "link_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "rider_id": "550e8400-e29b-41d4-a716-446655440000",
                "status": "used",
                "metadata": {"referral_code": "ABC123"},
                "error": None,
                "error_code": None,
                "access_count": 1
            }
        }


class OneTimeLinkValidateResponse(BaseModel):
    """Schema for link validation response"""
    is_valid: bool = Field(..., description="Whether link is valid")
    link_id: Optional[UUID] = Field(None, description="ID of the link")
    rider_id: Optional[UUID] = Field(None, description="Rider ID from the link")
    status: Optional[str] = Field(None, description="Link status")
    error: Optional[str] = Field(None, description="Error message if invalid")
    expires_at: Optional[datetime] = Field(None, description="When link expires")
    
    class Config:
        schema_extra = {
            "example": {
                "is_valid": True,
                "link_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "rider_id": "550e8400-e29b-41d4-a716-446655440000",
                "status": "active",
                "error": None,
                "expires_at": "2024-01-16T10:30:00Z"
            }
        }


class AccessLogEntry(BaseModel):
    """Schema for individual access log entries"""
    timestamp: datetime = Field(..., description="When access was attempted")
    ip_address: Optional[str] = Field(None, description="IP address of the attempt")
    user_agent: Optional[str] = Field(None, description="User agent string")
    device_fingerprint: Optional[str] = Field(None, description="Device fingerprint")
    success: bool = Field(..., description="Whether attempt was successful")
    error_message: Optional[str] = Field(None, description="Error message if failed")


class OneTimeLinkDetails(BaseModel):
    """Complete one-time link details"""
    id: UUID
    token: str
    rider_id: UUID
    status: str
    created_at: datetime
    expires_at: datetime
    accessed_at: Optional[datetime]
    purpose: str
    access_count: int
    failed_attempts: int
    device_fingerprint: Optional[str]
    created_from_ip: Optional[str]
    created_from_user_agent: Optional[str]
    accessed_from_ip: Optional[str]
    accessed_from_user_agent: Optional[str]
    is_shared: bool
    share_count: int
    access_log: List[AccessLogEntry] = []
    metadata: Dict[str, Any] = {}
    
    class Config:
        from_attributes = True


class OneTimeLinkRevokeRequest(BaseModel):
    """Schema for revoking a link"""
    token: str = Field(..., description="Token to revoke")
    reason: Optional[str] = Field(None, description="Reason for revocation")


class OneTimeLinkListResponse(BaseModel):
    """Schema for listing links"""
    total: int = Field(..., description="Total number of links")
    links: List[OneTimeLinkDetails] = Field(..., description="List of link details")
    
    class Config:
        schema_extra = {
            "example": {
                "total": 5,
                "links": []
            }
        }


class ReferralLinkResponse(BaseModel):
    """Schema for referral link response with sharing options"""
    link_id: UUID = Field(..., description="Link ID")
    token: str = Field(..., description="Share token")
    share_url: str = Field(..., description="Full share URL")
    share_qr_code: str = Field(..., description="QR code as base64")
    expires_at: datetime = Field(..., description="Expiration time")
    whatsapp_share_url: str = Field(..., description="WhatsApp share link")
    sms_share_text: str = Field(..., description="SMS share text")
    copy_link_text: str = Field(..., description="Text for copying to clipboard")
    
    class Config:
        schema_extra = {
            "example": {
                "link_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "token": "aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK",
                "share_url": "https://smartboda.com/claim?token=aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK",
                "share_qr_code": "data:image/png;base64,...",
                "expires_at": "2024-01-16T10:30:00Z",
                "whatsapp_share_url": "https://wa.me/?text=...",
                "sms_share_text": "Join Smart Boda: https://smartboda.com/claim?token=...",
                "copy_link_text": "https://smartboda.com/claim?token=aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK"
            }
        }


class LinkStatistics(BaseModel):
    """Schema for link statistics"""
    total_links_created: int
    active_links: int
    used_links: int
    expired_links: int
    revoked_links: int
    failed_links: int
    total_claims: int
    successful_claims: int
    failed_claims: int
    average_claim_time_minutes: Optional[float]