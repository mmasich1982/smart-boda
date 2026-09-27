# backend/app/auth.py
# CORRECTED VERSION - Comprehensive authentication fixes
# Fixes: CORS cookie sharing, password verification, error handling

import os
import logging
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, Request, Header, status
from jose import JWTError, jwt
import bcrypt
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.admin_user import AdminUser
from app.models.rider import Rider

logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("iwillrestoreuntoyoualltheyearsthathavebeenlost")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # one admin shift
COOKIE_NAME = "sb_admin_session"

# Use bcrypt directly instead of passlib to avoid passlib's backend initialization issues
# Passlib tries to detect wrap bugs by hashing test passwords, which fails if the password is > 72 bytes
BCRYPT_ROUNDS = 12

ROLE_HIERARCHY = {"support_admin": 1, "super_admin": 2}

# ============================================================================
# SUBDOMAIN COOKIE CONFIGURATION
# ============================================================================
# For cookie to work across subdomains (smart-boda-admin.onrender.com and smart-boda-api.onrender.com),
# it must be set with a parent domain.
# 
# Options:
# 1. Render.com subdomains: Use ".onrender.com" (if supported by Render)
# 2. Custom domain: Use ".yourdomain.com" 
# 3. Development localhost: No domain needed (same origin)

def get_cookie_domain():
    """Determine the correct cookie domain for cross-subdomain sharing."""
    env = os.getenv("ENVIRONMENT", "production")
    
    if env == "development" or os.getenv("DATABASE_URL", "").find("localhost") != -1:
        # For localhost development, no domain is needed
        return None
    
    # For production (Render.com), try to use parent domain
    # Render uses *.onrender.com pattern
    # Note: Some hosts don't allow setting arbitrary parent domains
    # If this doesn't work, you may need to:
    # 1. Use the same domain for frontend and backend (Render deploy)
    # 2. Use localStorage instead (less secure)
    # 3. Use API Gateway/reverse proxy to serve both on same domain
    
    api_base = os.getenv("VITE_API_BASE_URL", "https://smart-boda-api.onrender.com")
    
    # Extract domain for cookie
    if "onrender.com" in api_base:
        # For Render.com, we need the parent domain
        # smart-boda-api.onrender.com → .onrender.com
        return ".onrender.com"
    elif "localhost" in api_base:
        return None
    else:
        # For custom domains, extract parent domain
        # api.example.com → .example.com
        parts = api_base.split("//")[1].split(".")
        if len(parts) >= 2:
            return "." + ".".join(parts[-2:])
        return None

# ============================================================================
# ADMIN AUTHENTICATION (httpOnly cookies)
# ============================================================================

def hash_password(plain: str) -> str:
    """
    Hash a password using bcrypt directly.
    Bcrypt has a 72-byte limit. This function automatically truncates.
    
    ✅ CORRECTED: Improved error handling and validation
    
    Args:
        plain: Plain text password
    Returns:
        Bcrypt hashed password (60 chars)
    Raises:
        ValueError: If hashing fails
    """
    if not plain:
        raise ValueError("Password cannot be empty")
    
    # Truncate to 72 bytes (bcrypt's hard limit)
    # We encode to UTF-8, truncate at 72 bytes, then re-decode.
    # This handles multi-byte UTF-8 characters safely.
    try:
        plain_bytes = plain.encode('utf-8')[:72]  # Truncate at byte level first
        plain_truncated = plain_bytes.decode('utf-8', errors='ignore')  # Re-encode, ignoring incomplete chars
    except Exception as e:
        # Fallback: just use first 72 characters if encoding fails
        logger.warning(f"Encoding issue during password truncation, using fallback: {str(e)}")
        plain_truncated = plain[:72]
    
    try:
        # Use bcrypt directly to avoid passlib's backend initialization issues
        salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
        hashed = bcrypt.hashpw(plain_truncated.encode('utf-8'), salt)
        logger.debug(f"Password hashed successfully (rounds={BCRYPT_ROUNDS})")
        return hashed.decode('utf-8')
    except Exception as e:
        logger.error(f"Password hashing failed: {str(e)}", exc_info=True)
        raise ValueError(f"Failed to hash password: {str(e)}")

def verify_password(plain: str, hashed: str) -> bool:
    """
    Verify a plain password against a bcrypt hash using bcrypt directly.
    
    ✅ CORRECTED: Enhanced validation and error handling
    - Handles invalid hash formats gracefully
    - Provides detailed error logging for debugging
    - Bcrypt has a 72-byte limit. This function automatically truncates
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
        logger.warning("verify_password called with empty plain or hashed password")
        return False
    
    # Validate hash format (bcrypt hashes start with $2a$, $2b$, or $2y$)
    if not isinstance(hashed, str) or not hashed.startswith(('$2a$', '$2b$', '$2y$')):
        logger.warning(f"Invalid hash format detected. Expected bcrypt hash, got: {hashed[:20]}...")
        return False
    
    # Truncate to 72 bytes (bcrypt limit) - same as hash_password
    try:
        plain_bytes = plain.encode('utf-8')[:72]
        plain_truncated = plain_bytes.decode('utf-8', errors='ignore')
    except Exception as e:
        logger.warning(f"Encoding error during password truncation: {str(e)}")
        plain_truncated = plain[:72]
    
    try:
        # Use bcrypt directly for constant-time comparison
        is_valid = bcrypt.checkpw(plain_truncated.encode('utf-8'), hashed.encode('utf-8'))
        
        if is_valid:
            logger.debug(f"✓ Password verification successful")
        else:
            logger.debug(f"✗ Password verification failed - password doesn't match")
        
        return is_valid
    
    except ValueError as e:
        # ValueError: Invalid salt - hash is corrupted or invalid format
        logger.warning(f"Invalid salt in password hash: {str(e)} - returning False")
        logger.debug(f"Hash that failed validation: {hashed[:30]}...")
        return False
    
    except Exception as e:
        # Catch ALL exceptions - don't raise, just return False
        logger.warning(f"Password verification error ({type(e).__name__}): {str(e)} - returning False")
        logger.debug(f"Full error:", exc_info=True)
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
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    logger.debug(f"JWT token created for {admin.email}, expires in {ACCESS_TOKEN_EXPIRE_MINUTES} minutes")
    return token

def set_session_cookie(response, token: str) -> None:
    """
    Set an httpOnly session cookie with JWT token.
    
    ✅ FIXED: Now properly handles cookies across subdomains
    - httpOnly: JavaScript cannot access the cookie
    - Secure: Only sent over HTTPS (in production)
    - SameSite=Lax: Allows cookie on safe cross-site requests
    - Domain: Set to parent domain for cross-subdomain sharing
    - Credentials: Must be sent with all requests
    """
    cookie_domain = get_cookie_domain()
    
    logger.info(f"Setting session cookie with domain: {cookie_domain or '(default - same origin)'}")
    
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
        domain=cookie_domain,  # ✅ Set domain for cross-subdomain sharing
    )
    logger.info(f"✓ Session cookie set (expires in {ACCESS_TOKEN_EXPIRE_MINUTES} minutes)")

def clear_session_cookie(response) -> None:
    """Clear the session cookie on logout."""
    cookie_domain = get_cookie_domain()
    response.delete_cookie(
        key=COOKIE_NAME, 
        path="/",
        domain=cookie_domain,
    )
    logger.info("✓ Session cookie cleared")

def _decode_token(request: Request) -> dict:
    """
    Decode JWT from session cookie.
    
    ✅ CORRECTED: Better error handling and logging
    """
    token = request.cookies.get(COOKIE_NAME)
    
    # Log cookie presence for debugging
    if not token:
        available_cookies = list(request.cookies.keys())
        logger.warning(f"No session cookie found. Available cookies: {available_cookies}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    
    logger.debug(f"✓ Session cookie found, decoding JWT...")
    
    try:
        decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        logger.debug(f"✓ JWT decoded successfully for user: {decoded.get('email')}")
        return decoded
    except JWTError as e:
        logger.warning(f"Token decode failed: {str(e)}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")

def get_current_admin(request: Request, db: Session = Depends(get_db)) -> AdminUser:
    """Get the current authenticated admin from the session cookie."""
    payload = _decode_token(request)
    admin = db.query(AdminUser).get(payload["sub"])
    if not admin:
        logger.warning(f"Admin user not found in database: {payload['sub']}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found")
    if not admin.is_active:
        logger.warning(f"Login attempt on disabled account: {admin.email}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    return admin

def require_admin(admin: AdminUser = Depends(get_current_admin)) -> AdminUser:
    """Any logged-in admin (support_admin or super_admin)."""
    return admin

def require_super_admin(admin: AdminUser = Depends(get_current_admin)) -> AdminUser:
    """Requires super_admin role."""
    if admin.role != "super_admin":
        logger.warning(f"Super admin access attempt by {admin.role}: {admin.email}")
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