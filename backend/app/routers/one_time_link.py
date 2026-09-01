# backend/app/routers/one_time_link.py
"""
One-Time Link API Router
Endpoints for generating, validating, and claiming one-time use links
"""

import logging
import qrcode
import io
import base64
from typing import Optional
from uuid import UUID
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models.one_time_link import OneTimeLink, LinkStatus
from app.schemas.one_time_link import (
    OneTimeLinkCreate, OneTimeLinkGenerateResponse, OneTimeLinkClaimRequest,
    OneTimeLinkClaimResponse, OneTimeLinkValidateResponse, OneTimeLinkDetails,
    OneTimeLinkRevokeRequest, OneTimeLinkListResponse, ReferralLinkResponse,
    LinkStatistics
)
from app.services.one_time_link_service import OneTimeLinkService, SecurityMonitor

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/one-time-links", tags=["one-time-links"])

# Configuration
BASE_URL = "https://smartboda.app"  # Should be from environment
CLAIM_PATH = "/claim"


def get_client_ip(request: Request) -> str:
    """Extract client IP from request"""
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    
    return request.client.host if request.client else "unknown"


def generate_qr_code(data: str) -> str:
    """
    Generate QR code and return as base64-encoded PNG
    
    Args:
        data: Data to encode in QR code
    
    Returns:
        Base64-encoded PNG image
    """
    try:
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(data)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        img_str = base64.b64encode(buffer.getvalue()).decode()
        
        return f"data:image/png;base64,{img_str}"
    except Exception as e:
        logger.error(f"Error generating QR code: {str(e)}")
        return ""


def generate_share_urls(token: str, rider_id: UUID) -> dict:
    """Generate various sharing URLs for the link"""
    share_url = f"{BASE_URL}{CLAIM_PATH}?token={token}"
    
    # WhatsApp share
    wa_message = f"Join me on Smart Boda! Click here to get started: {share_url}"
    whatsapp_url = f"https://wa.me/?text={quote(wa_message)}"
    
    # SMS share
    sms_text = f"Join Smart Boda: {share_url}"
    
    # Email share
    email_subject = "Join Smart Boda Rider App"
    email_body = f"I'd like to invite you to Smart Boda. Use this link to get started: {share_url}"
    
    return {
        "share_url": share_url,
        "whatsapp_url": whatsapp_url,
        "sms_text": sms_text,
        "email_subject": email_subject,
        "email_body": email_body,
    }


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/generate", response_model=OneTimeLinkGenerateResponse)
async def generate_link(
    request: Request,
    body: OneTimeLinkCreate,
    db: Session = Depends(get_db)
):
    """
    Generate a new one-time use link
    
    - Can only be used once
    - Expires after specified hours
    - Prevents resharing via device fingerprinting
    """
    try:
        client_ip = get_client_ip(request)
        user_agent = request.headers.get("user-agent", "")
        
        # Create link in database
        link = OneTimeLinkService.create_link(
            db=db,
            rider_id=body.rider_id,
            expiry_hours=body.expiry_hours,
            purpose=body.purpose,
            device_fingerprint=body.device_fingerprint,
            created_from_ip=client_ip,
            created_from_user_agent=user_agent,
            metadata=body.metadata
        )
        
        # Generate sharing URLs
        share_info = generate_share_urls(link.token, link.rider_id)
        share_url = share_info["share_url"]
        
        # Generate QR code
        qr_code = generate_qr_code(share_url)
        
        return OneTimeLinkGenerateResponse(
            id=link.id,
            token=link.token,
            rider_id=link.rider_id,
            status=link.status,
            created_at=link.created_at,
            expires_at=link.expires_at,
            accessed_at=link.accessed_at,
            purpose=link.purpose,
            access_count=link.access_count,
            share_url=share_url,
            share_qr_code=qr_code,
        )
    
    except IntegrityError as e:
        db.rollback()
        logger.error(f"Database integrity error: {str(e)}")
        raise HTTPException(status_code=409, detail="Link creation failed - token already exists")
    
    except Exception as e:
        logger.error(f"Error generating link: {str(e)}")
        raise HTTPException(status_code=500, detail="Error generating link")


@router.post("/validate")
async def validate_link(
    token: str = Query(..., description="Link token to validate"),
    db: Session = Depends(get_db)
) -> OneTimeLinkValidateResponse:
    """
    Validate a link without claiming it
    Check if link is valid for use
    """
    try:
        is_valid, link, error = OneTimeLinkService.validate_link(db, token)
        
        return OneTimeLinkValidateResponse(
            is_valid=is_valid,
            link_id=link.id if link else None,
            rider_id=link.rider_id if link else None,
            status=link.status if link else None,
            error=error,
            expires_at=link.expires_at if link else None,
        )
    
    except Exception as e:
        logger.error(f"Error validating link: {str(e)}")
        raise HTTPException(status_code=500, detail="Error validating link")


@router.post("/claim", response_model=OneTimeLinkClaimResponse)
async def claim_link(
    request: Request,
    body: OneTimeLinkClaimRequest,
    db: Session = Depends(get_db)
):
    """
    Claim a one-time link (mark as used)
    
    - Validates device fingerprint to prevent sharing
    - Logs access attempt for security audit
    - Marks link as used on successful claim
    - Returns error if:
      - Link not found
      - Link already used
      - Link expired
      - Device fingerprint mismatch
      - Too many failed attempts
    """
    try:
        client_ip = get_client_ip(request)
        
        # Check for abuse patterns
        SecurityMonitor.check_link_abuse_patterns(db, body.token)
        
        # Validate and redeem link
        is_valid, link, error = OneTimeLinkService.validate_and_redeem_link(
            db=db,
            token=body.token,
            device_fingerprint=body.device_fingerprint,
            ip_address=client_ip or body.ip_address,
            user_agent=body.user_agent
        )
        
        if not is_valid:
            # Determine error code for client handling
            error_code = "LINK_INVALID"
            if link:
                if link.status == LinkStatus.USED:
                    error_code = "LINK_ALREADY_USED"
                elif link.status == LinkStatus.EXPIRED:
                    error_code = "LINK_EXPIRED"
                elif link.status == LinkStatus.REVOKED:
                    error_code = "LINK_REVOKED"
                elif link.failed_attempts >= link.max_failed_attempts:
                    error_code = "LINK_MAX_ATTEMPTS"
                elif "device" in (error or "").lower():
                    error_code = "DEVICE_MISMATCH"
            
            return OneTimeLinkClaimResponse(
                is_valid=False,
                link_id=link.id if link else None,
                rider_id=link.rider_id if link else None,
                status=link.status if link else None,
                error=error,
                error_code=error_code,
                access_count=link.access_count if link else 0,
            )
        
        # Link successfully claimed
        return OneTimeLinkClaimResponse(
            is_valid=True,
            link_id=link.id,
            rider_id=link.rider_id,
            status=link.status,
            metadata=link.metadata,
            error=None,
            error_code=None,
            access_count=link.access_count,
        )
    
    except Exception as e:
        logger.error(f"Error claiming link: {str(e)}")
        raise HTTPException(status_code=500, detail="Error processing link claim")


@router.get("/details/{link_id}", response_model=OneTimeLinkDetails)
async def get_link_details(
    link_id: UUID,
    db: Session = Depends(get_db)
):
    """Get detailed information about a specific link"""
    try:
        link = OneTimeLinkService.get_link_by_id(db, link_id)
        
        if not link:
            raise HTTPException(status_code=404, detail="Link not found")
        
        return OneTimeLinkDetails.from_orm(link)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching link details: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching link")


@router.get("/rider/{rider_id}", response_model=OneTimeLinkListResponse)
async def get_rider_links(
    rider_id: UUID,
    status: Optional[str] = Query(None, description="Filter by status"),
    db: Session = Depends(get_db)
):
    """Get all one-time links for a rider"""
    try:
        links = OneTimeLinkService.get_links_for_rider(db, rider_id, status)
        
        return OneTimeLinkListResponse(
            total=len(links),
            links=[OneTimeLinkDetails.from_orm(link) for link in links]
        )
    
    except Exception as e:
        logger.error(f"Error fetching rider links: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching links")


@router.post("/revoke", response_model=dict)
async def revoke_link(
    body: OneTimeLinkRevokeRequest,
    db: Session = Depends(get_db)
):
    """Revoke a link, preventing further use"""
    try:
        success, error = OneTimeLinkService.revoke_link(db, body.token, body.reason)
        
        if not success:
            raise HTTPException(status_code=404, detail=error)
        
        return {
            "success": True,
            "message": "Link revoked successfully"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revoking link: {str(e)}")
        raise HTTPException(status_code=500, detail="Error revoking link")


@router.post("/referral", response_model=ReferralLinkResponse)
async def create_referral_link(
    request: Request,
    rider_id: UUID = Query(..., description="Rider creating the referral link"),
    db: Session = Depends(get_db)
):
    """
    Create a referral link with sharing options
    Includes pre-formatted sharing texts for WhatsApp, SMS, and email
    """
    try:
        client_ip = get_client_ip(request)
        user_agent = request.headers.get("user-agent", "")
        
        # Create link
        link = OneTimeLinkService.create_link(
            db=db,
            rider_id=rider_id,
            expiry_hours=30 * 24,  # 30 days for referrals
            purpose="referral",
            created_from_ip=client_ip,
            created_from_user_agent=user_agent,
        )
        
        # Generate sharing URLs
        share_info = generate_share_urls(link.token, rider_id)
        share_url = share_info["share_url"]
        
        # Generate QR code
        qr_code = generate_qr_code(share_url)
        
        return ReferralLinkResponse(
            link_id=link.id,
            token=link.token,
            share_url=share_url,
            share_qr_code=qr_code,
            expires_at=link.expires_at,
            whatsapp_share_url=share_info["whatsapp_url"],
            sms_share_text=share_info["sms_text"],
            copy_link_text=share_url,
        )
    
    except Exception as e:
        logger.error(f"Error creating referral link: {str(e)}")
        raise HTTPException(status_code=500, detail="Error creating referral link")


@router.get("/statistics", response_model=LinkStatistics)
async def get_statistics(
    rider_id: Optional[UUID] = Query(None, description="Optional rider ID for specific stats"),
    db: Session = Depends(get_db)
):
    """Get statistics about link usage"""
    try:
        stats = OneTimeLinkService.get_link_statistics(db, rider_id)
        
        return LinkStatistics(**stats)
    
    except Exception as e:
        logger.error(f"Error calculating statistics: {str(e)}")
        raise HTTPException(status_code=500, detail="Error calculating statistics")


@router.post("/cleanup")
async def cleanup_expired_links(db: Session = Depends(get_db)):
    """
    Clean up expired and old links
    Should be called periodically (e.g., daily via Celery task)
    """
    try:
        count = OneTimeLinkService.cleanup_expired_links(db)
        
        return {
            "success": True,
            "deleted_links": count,
            "message": f"Cleaned up {count} expired links"
        }
    
    except Exception as e:
        logger.error(f"Error cleaning up links: {str(e)}")
        raise HTTPException(status_code=500, detail="Error cleaning up links")


@router.post("/abuse/report")
async def report_abuse(
    token: str = Query(..., description="Token to report"),
    reason: str = Query(..., description="Reason for abuse report"),
    db: Session = Depends(get_db)
):
    """Report a link as potentially abusive"""
    try:
        link = db.query(OneTimeLink).filter(OneTimeLink.token == token).first()
        
        if not link:
            raise HTTPException(status_code=404, detail="Link not found")
        
        # Log abuse report
        logger.warning(f"ABUSE REPORT: Link {token[:10]}... - Reason: {reason}")
        
        # Check for patterns
        is_abusive, pattern = OneTimeLinkService.check_link_abuse(db, token)
        
        # Optionally revoke if already showing abuse patterns
        if is_abusive:
            OneTimeLinkService.revoke_link(db, token, f"Reported as abusive: {reason}")
            return {
                "success": True,
                "message": "Link has been revoked due to abuse patterns",
                "abuse_detected": True
            }
        
        return {
            "success": True,
            "message": "Abuse report received",
            "abuse_detected": False
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reporting abuse: {str(e)}")
        raise HTTPException(status_code=500, detail="Error reporting abuse")


@router.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "service": "one-time-links"
    }