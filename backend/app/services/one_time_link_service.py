# backend/app/services/one_time_link_service.py
"""
One-Time Link Service - Business logic for secure link generation and claiming
Implements security best practices for preventing sharing and misuse
"""

import secrets
import logging
from datetime import datetime, timedelta
from typing import Tuple, Optional, Dict, Any, List
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.models.one_time_link import OneTimeLink, LinkStatus
from app.schemas.one_time_link import OneTimeLinkCreate, LinkStatistics

logger = logging.getLogger(__name__)


class OneTimeLinkService:
    """Service for managing one-time use links"""
    
    # Token generation settings
    TOKEN_LENGTH = 32  # 256 bits
    TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    
    # Security settings
    MAX_FAILED_ATTEMPTS = 3
    MAX_DEVICE_CHANGES = 1
    SUSPICIOUS_IP_CHANGE_THRESHOLD = 1  # Flag after 1 IP change
    
    @staticmethod
    def generate_token() -> str:
        """
        Generate a cryptographically secure random token
        Returns URL-safe, randomly generated token
        """
        return ''.join(secrets.choice(OneTimeLinkService.TOKEN_ALPHABET) 
                      for _ in range(OneTimeLinkService.TOKEN_LENGTH))
    
    @staticmethod
    def create_link(
        db: Session,
        rider_id: UUID,
        expiry_hours: int = 24,
        purpose: str = "app_share",
        device_fingerprint: Optional[str] = None,
        created_from_ip: Optional[str] = None,
        created_from_user_agent: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> OneTimeLink:
        """
        Create a new one-time use link
        
        Args:
            db: Database session
            rider_id: UUID of the rider
            expiry_hours: Hours until link expires (default 24)
            purpose: Purpose of the link (app_share, referral, etc.)
            device_fingerprint: Optional fingerprint to bind link to device
            created_from_ip: IP address where link was created
            created_from_user_agent: User agent of creator
            metadata: Additional metadata to store with link
        
        Returns:
            Created OneTimeLink object
        """
        try:
            token = OneTimeLinkService.generate_token()
            expires_at = datetime.utcnow() + timedelta(hours=expiry_hours)
            
            link = OneTimeLink(
                token=token,
                rider_id=rider_id,
                purpose=purpose,
                expires_at=expires_at,
                device_fingerprint=device_fingerprint,
                created_from_ip=created_from_ip,
                created_from_user_agent=created_from_user_agent,
                status=LinkStatus.ACTIVE,
                link_metadata=metadata or {},
                access_log=[]
            )
            
            db.add(link)
            db.commit()
            db.refresh(link)
            
            logger.info(f"✓ Created one-time link {link.id} for rider {rider_id}")
            return link
            
        except Exception as e:
            db.rollback()
            logger.error(f"✗ Failed to create link: {str(e)}")
            raise
    
    @staticmethod
    def validate_link(db: Session, token: str) -> Tuple[bool, Optional[OneTimeLink], Optional[str]]:
        """
        Validate a link without redeeming it
        Checks expiration and status only
        
        Returns:
            Tuple of (is_valid, link_object, error_message)
        """
        try:
            link = db.query(OneTimeLink).filter(OneTimeLink.token == token).first()
            
            if not link:
                return False, None, "Link not found"
            
            if link.status == LinkStatus.USED:
                return False, link, "Link has already been used"
            
            if link.status == LinkStatus.EXPIRED:
                return False, link, "Link has expired"
            
            if link.status == LinkStatus.REVOKED:
                return False, link, "Link has been revoked"
            
            if link.status == LinkStatus.MAX_ATTEMPTS_EXCEEDED:
                return False, link, "Link has been deactivated due to too many failed attempts"
            
            if link.is_expired():
                link.status = LinkStatus.EXPIRED
                db.commit()
                return False, link, "Link has expired"
            
            if link.failed_attempts >= link.max_failed_attempts:
                link.status = LinkStatus.MAX_ATTEMPTS_EXCEEDED
                db.commit()
                return False, link, "Link has been deactivated due to too many failed attempts"
            
            return True, link, None
            
        except Exception as e:
            logger.error(f"✗ Error validating link: {str(e)}")
            return False, None, "Error validating link"
    
    @staticmethod
    def validate_and_redeem_link(
        db: Session,
        token: str,
        device_fingerprint: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Tuple[bool, Optional[OneTimeLink], Optional[str]]:
        """
        Validate and redeem a link (mark as used)
        Enforces device fingerprinting and IP validation
        
        Returns:
            Tuple of (is_valid, link_object, error_message)
        """
        try:
            # Step 1: Validate basic link status
            is_valid, link, error = OneTimeLinkService.validate_link(db, token)
            if not is_valid:
                return False, link, error
            
            # Step 2: Check device fingerprint if bound
            if link.device_fingerprint and device_fingerprint:
                if link.device_fingerprint != device_fingerprint:
                    link.increment_failed_attempts()
                    link.add_access_log_entry(
                        ip_address=ip_address,
                        user_agent=user_agent,
                        device_fingerprint=device_fingerprint,
                        success=False,
                        error_message="Device fingerprint mismatch - link cannot be used on different device"
                    )
                    db.commit()
                    logger.warning(
                        f"✗ Device fingerprint mismatch for link {link.id}. "
                        f"Original: {link.device_fingerprint}, Attempted: {device_fingerprint}"
                    )
                    return False, link, "Link cannot be used on a different device"
            
            # Step 3: Check IP validation if available
            if link.created_from_ip and ip_address:
                if link.created_from_ip != ip_address:
                    logger.warning(
                        f"⚠ IP change detected for link {link.id}. "
                        f"Original: {link.created_from_ip}, New: {ip_address}"
                    )
                    # Track but allow (with warning logged)
                    link.accessed_from_ip = ip_address
            
            # Step 4: Check if already used
            if link.status == LinkStatus.USED:
                link.increment_failed_attempts()
                link.add_access_log_entry(
                    ip_address=ip_address,
                    user_agent=user_agent,
                    device_fingerprint=device_fingerprint,
                    success=False,
                    error_message="Link has already been used"
                )
                db.commit()
                return False, link, "Link has already been used"
            
            # Step 5: Mark as used
            link.mark_as_used()
            link.accessed_from_ip = ip_address
            link.accessed_from_user_agent = user_agent
            link.add_access_log_entry(
                ip_address=ip_address,
                user_agent=user_agent,
                device_fingerprint=device_fingerprint,
                success=True,
                error_message=None
            )
            
            db.commit()
            logger.info(f"✓ Successfully claimed link {link.id} for rider {link.rider_id}")
            
            return True, link, None
            
        except Exception as e:
            db.rollback()
            logger.error(f"✗ Error redeeming link: {str(e)}")
            return False, None, "Error processing link claim"
    
    @staticmethod
    def get_link_by_id(db: Session, link_id: UUID) -> Optional[OneTimeLink]:
        """Get a link by ID"""
        try:
            return db.query(OneTimeLink).filter(OneTimeLink.id == link_id).first()
        except Exception as e:
            logger.error(f"✗ Error fetching link: {str(e)}")
            return None
    
    @staticmethod
    def get_links_for_rider(db: Session, rider_id: UUID, status: Optional[str] = None) -> List[OneTimeLink]:
        """Get all links for a rider, optionally filtered by status"""
        try:
            query = db.query(OneTimeLink).filter(OneTimeLink.rider_id == rider_id)
            
            if status:
                query = query.filter(OneTimeLink.status == status)
            
            return query.order_by(OneTimeLink.created_at.desc()).all()
        except Exception as e:
            logger.error(f"✗ Error fetching rider links: {str(e)}")
            return []
    
    @staticmethod
    def revoke_link(db: Session, token: str, reason: Optional[str] = None) -> Tuple[bool, Optional[str]]:
        """
        Revoke a link, preventing further use
        
        Returns:
            Tuple of (success, error_message)
        """
        try:
            link = db.query(OneTimeLink).filter(OneTimeLink.token == token).first()
            
            if not link:
                return False, "Link not found"
            
            link.revoke()
            db.commit()
            
            logger.info(f"✓ Revoked link {link.id}. Reason: {reason or 'Not specified'}")
            return True, None
            
        except Exception as e:
            db.rollback()
            logger.error(f"✗ Error revoking link: {str(e)}")
            return False, "Error revoking link"
    
    @staticmethod
    def cleanup_expired_links(db: Session) -> int:
        """
        Clean up expired and old used links
        Returns count of deleted links
        """
        try:
            now = datetime.utcnow()
            cutoff_date = now - timedelta(days=30)  # Keep used links for 30 days for audit
            
            # Delete expired links older than 30 days
            deleted = db.query(OneTimeLink).filter(
                and_(
                    OneTimeLink.expires_at < cutoff_date,
                    or_(
                        OneTimeLink.status == LinkStatus.EXPIRED,
                        OneTimeLink.status == LinkStatus.USED
                    )
                )
            ).delete()
            
            # Mark as expired if past expiration time
            updated = db.query(OneTimeLink).filter(
                and_(
                    OneTimeLink.expires_at < now,
                    OneTimeLink.status == LinkStatus.ACTIVE
                )
            ).update({OneTimeLink.status: LinkStatus.EXPIRED})
            
            db.commit()
            
            logger.info(f"✓ Cleaned up {deleted} expired links, marked {updated} as expired")
            return deleted + updated
            
        except Exception as e:
            db.rollback()
            logger.error(f"✗ Error cleaning up links: {str(e)}")
            return 0
    
    @staticmethod
    def get_link_statistics(db: Session, rider_id: Optional[UUID] = None) -> Dict[str, Any]:
        """
        Get statistics about link usage
        
        Args:
            rider_id: Optional rider ID to get stats for specific rider
        
        Returns:
            Dictionary with link statistics
        """
        try:
            query = db.query(OneTimeLink)
            
            if rider_id:
                query = query.filter(OneTimeLink.rider_id == rider_id)
            
            total = query.count()
            active = query.filter(OneTimeLink.status == LinkStatus.ACTIVE).count()
            used = query.filter(OneTimeLink.status == LinkStatus.USED).count()
            expired = query.filter(OneTimeLink.status == LinkStatus.EXPIRED).count()
            revoked = query.filter(OneTimeLink.status == LinkStatus.REVOKED).count()
            failed = query.filter(OneTimeLink.status == LinkStatus.MAX_ATTEMPTS_EXCEEDED).count()
            
            # Calculate average claim time
            used_links = query.filter(OneTimeLink.status == LinkStatus.USED).all()
            if used_links:
                total_time = sum(
                    (link.accessed_at - link.created_at).total_seconds()
                    for link in used_links
                    if link.accessed_at and link.created_at
                )
                avg_claim_time = total_time / len(used_links) / 60 if used_links else None
            else:
                avg_claim_time = None
            
            return {
                "total_links_created": total,
                "active_links": active,
                "used_links": used,
                "expired_links": expired,
                "revoked_links": revoked,
                "failed_links": failed,
                "total_claims": sum(link.access_count for link in query.all()),
                "successful_claims": used,
                "failed_claims": sum(link.failed_attempts for link in query.all()),
                "average_claim_time_minutes": avg_claim_time,
            }
        except Exception as e:
            logger.error(f"✗ Error calculating statistics: {str(e)}")
            return {}
    
    @staticmethod
    def check_link_abuse(db: Session, token: str) -> Tuple[bool, Optional[str]]:
        """
        Check if a link shows signs of abuse
        
        Returns:
            Tuple of (is_abusive, reason)
        """
        try:
            link = db.query(OneTimeLink).filter(OneTimeLink.token == token).first()
            
            if not link:
                return False, None
            
            # Alert if too many failed attempts
            if link.failed_attempts >= 3:
                return True, f"Link has {link.failed_attempts} failed attempts"
            
            # Check if accessed from multiple IPs
            if link.access_log and len(link.access_log) > 0:
                unique_ips = set(
                    entry.get('ip_address')
                    for entry in link.access_log
                    if entry.get('ip_address')
                )
                
                if len(unique_ips) > 1:
                    return True, f"Link accessed from {len(unique_ips)} different IP addresses"
            
            # Check if accessed from multiple devices
            if link.access_log and len(link.access_log) > 1:
                unique_fingerprints = set(
                    entry.get('device_fingerprint')
                    for entry in link.access_log
                    if entry.get('device_fingerprint')
                )
                
                if len(unique_fingerprints) > 1:
                    return True, "Link attempted from multiple devices"
            
            return False, None
            
        except Exception as e:
            logger.error(f"✗ Error checking link abuse: {str(e)}")
            return False, None


class SecurityMonitor:
    """Monitor and alert on suspicious link activity"""
    
    @staticmethod
    def check_link_abuse_patterns(db: Session, token: str) -> bool:
        """
        Check for abuse patterns and return True if abuse is detected
        """
        is_abusive, reason = OneTimeLinkService.check_link_abuse(db, token)
        
        if is_abusive:
            logger.warning(f"⚠ ABUSE DETECTED: {reason} (Token: {token[:10]}...)")
            # In production, send alert to security team
            # send_security_alert(f"Suspicious link activity: {reason}")
        
        return is_abusive
    
    @staticmethod
    def monitor_failed_attempts(db: Session, token: str, failed_attempts: int) -> bool:
        """
        Monitor failed attempts and flag for manual review if threshold exceeded
        """
        if failed_attempts >= 3:
            logger.warning(f"⚠ MAX ATTEMPTS EXCEEDED: Link {token[:10]}... has {failed_attempts} failed attempts")
            return True
        
        return False