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
from app.services import session_service       # SMART APPS: one active session per user
from app.models.admin_user import AdminUser
from app.models.rider import Rider

logger = logging.getLogger(__name__)

# ROOT-CAUSE FIX: this used to be os.getenv("<the secret value itself>"), i.e. it looked up an
# environment variable *named* after the secret, which never exists, so SECRET_KEY was always None
# and jwt.encode() failed with "Expecting a string- or bytes-formatted key" the moment a login
# password was accepted. The variable NAME is JWT_SECRET_KEY; the secret value lives only in the
# environment (Render dashboard), never in source.
SECRET_KEY = os.getenv("JWT_SECRET_KEY") or os.getenv("ADMIN_JWT_SECRET")
if not SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY environment variable is not set. Set it in the Render dashboard "
        "(Environment tab) to a long random string."
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # one admin shift

# Riders stay signed in on their phone until they choose Logout (persistent session), so a rider token must outlive a shift.
# The phone also renews it silently (POST /onboarding/session/refresh) every time the app opens online, so for anyone
# who uses the app it never runs out. Admin tokens above are NOT affected. Override with the RIDER_TOKEN_EXPIRE_DAYS env var.
RIDER_TOKEN_EXPIRE_DAYS = int(os.getenv("RIDER_TOKEN_EXPIRE_DAYS", "90"))
COOKIE_NAME = "sb_admin_session"

# ADMIN APP: the mobile app signs in with mobile number + PIN and keeps a Bearer token (a phone has no httpOnly cookie jar to rely on).
# The token carries typ="admin_app", is checked by get_current_admin below, and so opens EVERY existing admin route (same guards, same roles).
# A shift-length default; the app swaps a still-valid token for a fresh one each time it opens online (POST /admin/app/session/refresh).
ADMIN_APP_TOKEN_EXPIRE_HOURS = int(os.getenv("ADMIN_APP_TOKEN_EXPIRE_HOURS", "12"))
ADMIN_APP_TOKEN_TYPE = "admin_app"

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
    """
    Cookie Domain attribute. Deliberately None (a host-only cookie on the API host).

    ROOT-CAUSE FIX: this used to return ".onrender.com". onrender.com is on the Public Suffix
    List, so browsers REJECT any cookie whose Domain is ".onrender.com" -- the login cookie was
    silently dropped and /admin/auth/me kept returning 401. A host-only cookie is accepted.
    Only set COOKIE_DOMAIN if you move both apps under your own domain (e.g. ".smartboda.co.ke").
    """
    return os.getenv("COOKIE_DOMAIN") or None

# ============================================================================
# ADMIN AUTHENTICATION (httpOnly cookies)
# ============================================================================

def hash_password(plain: str) -> str:
    """
    Hash a password using bcrypt directly.
    Bcrypt has a 72-byte limit. This function automatically truncates.
    
    ? CORRECTED: Improved error handling and validation
    
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
    
    ? CORRECTED: Enhanced validation and error handling
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
            logger.debug(f"? Password verification successful")
        else:
            logger.debug(f"? Password verification failed - password doesn't match")
        
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

def create_admin_app_token(admin: AdminUser, sid: str = None) -> str:
    """ADMIN APP: Bearer token for an Administrator who signed in to the mobile app with mobile number + PIN."""
    expire = datetime.now(timezone.utc) + timedelta(hours=ADMIN_APP_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": str(admin.id),
        "email": admin.email,
        "name": admin.name,
        "role": admin.role,
        "typ": ADMIN_APP_TOKEN_TYPE,
        "iat": datetime.now(timezone.utc),
        "exp": expire,
    }
    if sid:                       # SMART APPS: one active session per Administrator too
        payload["sid"] = str(sid)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def set_session_cookie(response, token: str) -> None:
    """
    Set an httpOnly session cookie with JWT token.
    
    ? FIXED: Now properly handles cookies across subdomains
    - httpOnly: JavaScript cannot access the cookie
    - Secure: Only sent over HTTPS (in production)
    - SameSite=None: required so the admin site's XHR carries the cookie to the API site
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
        # smart-boda-admin.onrender.com -> smart-boda-api.onrender.com is a CROSS-SITE request
        # (onrender.com is a public suffix), and SameSite=Lax cookies are not sent on cross-site
        # XHR/fetch. SameSite=None (+ Secure, already set) is required for this deployment.
        samesite="none",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
        domain=cookie_domain,  # ? Set domain for cross-subdomain sharing
    )
    logger.info(f"? Session cookie set (expires in {ACCESS_TOKEN_EXPIRE_MINUTES} minutes)")

def clear_session_cookie(response) -> None:
    """Clear the session cookie on logout."""
    cookie_domain = get_cookie_domain()
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        domain=cookie_domain,
        secure=True,
        httponly=True,
        samesite="none",
    )
    logger.info("? Session cookie cleared")

def _decode_token(request: Request) -> dict:
    """
    Decode the admin's JWT: the httpOnly session cookie (console) or, failing that, a Bearer token issued to the mobile app.

    ADMIN APP: a Bearer token is accepted ONLY when it carries typ="admin_app", so a rider's token can never open an admin route.
    """
    token = request.cookies.get(COOKIE_NAME)
    from_header = False
    if not token:
        auth_header = request.headers.get("authorization") or ""
        scheme, _, value = auth_header.partition(" ")
        if scheme.lower() == "bearer" and value.strip():
            token, from_header = value.strip(), True

    if not token:
        available_cookies = list(request.cookies.keys())
        logger.warning(f"No session cookie or bearer token found. Available cookies: {available_cookies}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        logger.warning(f"Token decode failed: {str(e)}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")

    if from_header and decoded.get("typ") != ADMIN_APP_TOKEN_TYPE:
        logger.warning("A bearer token without typ=admin_app was presented to an admin route")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
    return decoded

def get_current_admin(request: Request, db: Session = Depends(get_db)) -> AdminUser:
    """Get the current authenticated admin from the session cookie."""
    payload = _decode_token(request)
    try:
        admin = db.query(AdminUser).get(payload["sub"])
    except Exception:                       # a malformed id in a token is a 401, never a 500
        db.rollback()
        admin = None
    if not admin:
        logger.warning(f"Admin user not found in database: {payload['sub']}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found")
    if not admin.is_active:
        logger.warning(f"Login attempt on disabled account: {admin.email}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    if payload.get("typ") == ADMIN_APP_TOKEN_TYPE:
        # ADMIN APP: a phone token stops working the moment a Super Admin switches the app off for this person or resets their PIN
        # (a token issued before the current PIN was set is refused too). Console cookie tokens carry no typ and are not affected.
        if not (admin.app_access_enabled and admin.app_pin_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
        pin_set = admin.app_pin_set_at
        if pin_set:
            pin_set = pin_set if pin_set.tzinfo else pin_set.replace(tzinfo=timezone.utc)
            if int(pin_set.timestamp()) - int(payload.get("iat") or 0) > 2:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
        session_service.guard_payload(db, payload, "admin")      # SMART APPS: one active session per Administrator
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

def create_rider_token(rider_id: str, mobile_number: str, sid: str = None) -> str:
    """
    Create JWT token for a rider after successful PIN login.
    
    Args:
        rider_id: UUID of the rider
        mobile_number: Rider's mobile number
    
    Returns:
        Encoded JWT token string
    """
    expire = datetime.now(timezone.utc) + timedelta(days=RIDER_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(rider_id),
        "mobile_number": mobile_number,
        "exp": expire,
    }
    if sid:                       # SMART APPS: the session this token belongs to (one active session per user); see services/session_service.py
        payload["sid"] = str(sid)
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
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    if payload.get("typ") == ADMIN_APP_TOKEN_TYPE:        # ADMIN APP: an administrator's token is never a rider's token
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    return payload

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
    
    # SMART APPS: ONE ACTIVE SESSION PER USER. A token whose session was replaced (login on another phone), ended (logout) or reset (PIN) is refused here,
    # with a code the app understands (detail.code = session_replaced | session_ended).
    session_service.guard_payload(db, token, "rider")
    
    return rider