# backend/app/models/one_time_link.py
"""
One-Time Link Model - Secure link generation and tracking
Ensures links can only be used once and prevents resharing via device fingerprinting
"""

from sqlalchemy import Column, String, DateTime, Integer, Boolean, Text, JSON, Enum, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from enum import Enum as PyEnum
from datetime import datetime, timedelta

from app.database import Base


class LinkStatus(str, PyEnum):
    """Status of a one-time link"""
    ACTIVE = "active"           # Link is active and can be used
    USED = "used"               # Link has been claimed successfully
    EXPIRED = "expired"         # Link has expired
    REVOKED = "revoked"         # Link was manually revoked
    MAX_ATTEMPTS_EXCEEDED = "max_attempts_exceeded"  # Failed too many times


class OneTimeLink(Base):
    """
    One-Time Use Link Model
    
    Prevents sharing via:
    1. Device fingerprinting - binds link to original device
    2. One-time redemption - marks link as used immediately
    3. IP validation - detects different networks
    4. Failed attempt limits - deactivates suspicious links
    5. Time-based expiry - links expire after configured duration
    """
    
    __tablename__ = "one_time_links"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Link token - the actual secret that's shared
    token = Column(String(64), unique=True, nullable=False, index=True)
    
    # Link metadata
    rider_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    purpose = Column(String(50), nullable=False, default="app_share")  # e.g., app_share, referral
    status = Column(String(30), nullable=False, default=LinkStatus.ACTIVE, index=True)
    
    # Expiration tracking
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    accessed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Security - Device Binding
    device_fingerprint = Column(String(255), nullable=True)  # Original device fingerprint
    created_from_ip = Column(String(45), nullable=True)  # IPv4 or IPv6
    created_from_user_agent = Column(String(500), nullable=True)
    
    # Access tracking
    access_count = Column(Integer, default=0, nullable=False)
    failed_attempts = Column(Integer, default=0, nullable=False)
    max_failed_attempts = Column(Integer, default=3, nullable=False)
    
    # Access log - JSON array of access attempts
    access_log = Column(JSON, default=list, nullable=False)
    
    # Metadata - store context or additional info
    metadata = Column(JSON, default=dict, nullable=False)
    
    # Share details
    shared_via = Column(String(20), nullable=True)  # whatsapp, sms, link, qr
    accessed_from_ip = Column(String(45), nullable=True)  # IP when link was accessed
    accessed_from_user_agent = Column(String(500), nullable=True)
    
    # Tracking
    is_shared = Column(Boolean, default=False)
    share_count = Column(Integer, default=0)
    
    # Indexes for common queries
    __table_args__ = (
        Index('ix_one_time_links_rider_id_status', 'rider_id', 'status'),
        Index('ix_one_time_links_token_status', 'token', 'status'),
        Index('ix_one_time_links_expires_at', 'expires_at'),
        Index('ix_one_time_links_created_at', 'created_at'),
    )

    def is_expired(self) -> bool:
        """Check if link has expired"""
        return datetime.utcnow() > self.expires_at

    def is_valid(self) -> bool:
        """Check if link is valid for use"""
        return (
            self.status == LinkStatus.ACTIVE and
            not self.is_expired() and
            self.failed_attempts < self.max_failed_attempts
        )

    def increment_access_count(self):
        """Increment access count and mark as accessed"""
        self.access_count += 1
        self.accessed_at = datetime.utcnow()

    def increment_failed_attempts(self):
        """Increment failed attempts"""
        self.failed_attempts += 1
        if self.failed_attempts >= self.max_failed_attempts:
            self.status = LinkStatus.MAX_ATTEMPTS_EXCEEDED

    def mark_as_used(self):
        """Mark link as successfully used"""
        self.status = LinkStatus.USED
        self.accessed_at = datetime.utcnow()
        self.access_count += 1

    def revoke(self):
        """Manually revoke the link"""
        self.status = LinkStatus.REVOKED

    def add_access_log_entry(self, ip_address: str, user_agent: str, device_fingerprint: str = None, 
                            success: bool = False, error_message: str = None):
        """Add an entry to the access log"""
        if not self.access_log:
            self.access_log = []
        
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "ip_address": ip_address,
            "user_agent": user_agent,
            "device_fingerprint": device_fingerprint,
            "success": success,
            "error_message": error_message,
        }
        
        self.access_log.append(entry)
    
    def __repr__(self):
        return f"<OneTimeLink(id={self.id}, rider_id={self.rider_id}, status={self.status}, expires_at={self.expires_at})>"