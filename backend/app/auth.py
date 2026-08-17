# backend/app/auth.py
# CORRECTED VERSION - Fixes InvalidHashError TypeError
# This version handles all exceptions gracefully without relying on specific exception classes

import os
import logging
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, Request, Header, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.admin_user import AdminUser
from app.models.rider import Rider

logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("ADMIN_JWT_SECRET", "dev-only-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # one admin shift
COOKIE_NAME = "sb_admin_session"

# Initialize CryptContext with bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ROLE_HIERARCHY = {"support_admin": 1, "super_admin": 2}

# ============================================================================
# ADMIN AUTHENTICATION (httpOnly cookies)
# ============================================================================

def hash_password(plain: str) -> str:
    """
    Hash a password using bcrypt.
    Bcrypt has a 72-byte limit. This function automatically truncates.
    
    Args:
        plain: Plain text password
    Returns:
        Bcrypt hashed password (60 chars)
    Raises:
        ValueError: If hashing fails
    """
    if not plain:
        raise ValueError("Password cannot be empty")
    
    # Truncate to 72 bytes (bcrypt limit)
    plain_truncated = plain[:72]
    
    try:
        hashed = pwd_context.hash(plain_truncated)
        logger.debug(f"Password hashed successfully")
        return hashed
    except Exception as e:
        logger.error(f"Password hashing failed: {str(e)}")
        raise ValueError(f"Failed to hash password: {str(e)}")

def verify_password(plain: str, hashed: str) -> bool:
    """
    Verify a plain password against a bcrypt hash.
    
    ✅ Bcrypt has a 72-byte limit. This function automatically truncates
    the input password before verification.
    
    Args:
        plain: Plain text password to verify
        hashed: Bcrypt hash from database
        
    Returns:
        True if password matches, False otherwise
        
    Note:
        - Returns False instead of raising exceptions for security
        - Uses constant-time comparison to prevent timing attacks
        - Truncates password to 72 bytes for bcrypt compatibility
    """
    if not plain or not hashed:
        return False
    
    # Truncate to 72 bytes (bcrypt limit)
    plain_truncated = plain[:72]
    
    try:
        # pwd_context.verify() handles constant-time comparison
        is_valid = pwd_context.verify(plain_truncated, hashed)
        logger.debug(f"Password verification: {'✓ valid' if is_valid else '✗ invalid'}")
        return is_valid
    except Exception as e:
        # Catch ALL exceptions - don't raise, just return False
        # This handles bcrypt errors, hash format errors, etc.
        logger.warning(f"Password verification error: {str(e)} - returning False")
        return False

def create_access_token(admin: AdminUser) -> str:
    """Create a JWT access token for an admin user."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(admin.id),
        "email": admin.email,
        "name": admin.name,
        "role": admin.role,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def set_session_cookie(response, token: str) -> None:
    """
    Set an httpOnly session cookie with JWT token.
    ✅ httpOnly + Secure + SameSite=Strict for security
    """
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )

def clear_session_cookie(response) -> None:
    """Clear the session cookie on logout."""
    response.delete_cookie(key=COOKIE_NAME, path="/")

def _decode_token(request: Request) -> dict:
    """Decode JWT from session cookie."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")

def get_current_admin(request: Request, db: Session = Depends(get_db)) -> AdminUser:
    """Get the current authenticated admin from the session cookie."""
    payload = _decode_token(request)
    admin = db.query(AdminUser).get(payload["sub"])
    if not admin or not admin.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account disabled")
    return admin

def require_admin(admin: AdminUser = Depends(get_current_admin)) -> AdminUser:
    """Any logged-in admin (support_admin or super_admin)."""
    return admin

def require_super_admin(admin: AdminUser = Depends(get_current_admin)) -> AdminUser:
    """Requires super_admin role."""
    if admin.role != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin role required")
    return admin

# ============================================================================
# RIDER AUTHENTICATION (Bearer tokens in Authorization header)
# ============================================================================

def create_rider_token(rider_id: str, mobile_number: str) -> str:
    """
    Create JWT token for a rider after successful PIN login.
    
    Args:
        rider_id: UUID of the rider
        mobile_number: Rider's mobile number
    
    Returns:
        Encoded JWT token string
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(rider_id),
        "mobile_number": mobile_number,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(authorization: str = Header(None)) -> dict:
    """
    Verify rider token from Authorization header.
    Expected format: "Bearer <token>"
    
    Args:
        authorization: Authorization header value
    Returns:
        Decoded token payload as dictionary
    Raises:
        HTTPException: If token is missing, malformed, or invalid
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header"
        )
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise ValueError("Invalid scheme")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Expected: Bearer <token>"
        )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

def get_current_rider(
    token: dict = Depends(verify_token),
    db: Session = Depends(get_db)
) -> Rider:
    """
    Get the current rider from a verified Bearer token.
    
    Args:
        token: Decoded JWT token (injected via verify_token dependency)
        db: Database session (injected via get_db dependency)
    
    Returns:
        Rider model instance for the authenticated rider
    
    Raises:
        HTTPException 401: If rider not found
        HTTPException 422: If rider_id in token is malformed
    """
    rider_id = token.get("sub")
    
    if not rider_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing rider ID"
        )
    
    try:
        rider = db.query(Rider).filter(Rider.id == rider_id).first()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid rider ID format: {str(e)}"
        )
    
    if not rider:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Rider account not found"
        )
    
    return rider