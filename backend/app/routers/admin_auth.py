# backend/app/routers/admin_auth.py
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.admin_user import AdminUser
from app.auth import (
    verify_password,
    create_access_token,
    set_session_cookie,
    clear_session_cookie,
    get_current_admin,
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Define a Pydantic model for login requests
class LoginRequest(BaseModel):
    email: str
    password: str

# ============================================================================
# LOGIN ENDPOINT - FIXED
# ============================================================================
@router.post("/login")
def admin_login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """
    Admin login endpoint: validates credentials and sets JWT cookie.
    
    ✅ FIXED:
    - Returns admin data (name, role, email) for frontend session initialization
    - Better error logging for debugging
    - Proper response structure for frontend
    - Comprehensive error handling for password verification
    
    Flow:
    1. Lookup admin by email
    2. Verify password using bcrypt
    3. Check if account is active
    4. Create JWT token
    5. Set httpOnly cookie
    6. Return admin data for session initialization
    """
    # Query for admin user
    # Emails are matched case-insensitively and ignoring stray spaces (phones auto-capitalise
    # the first letter and add trailing spaces, which previously caused "Invalid email or password").
    email = payload.email.strip().lower()
    admin = db.query(AdminUser).filter(func.lower(AdminUser.email) == email).first()
    
    if not admin:
        logger.warning(f"Login attempt with non-existent email: {payload.email}")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    logger.debug(f"Admin found: {admin.email} ({admin.role})")
    
    # Verify password
    # Note: verify_password handles all exceptions and returns False gracefully
    password_valid = verify_password(payload.password, admin.password_hash)
    
    if not password_valid:
        logger.warning(f"Login attempt with wrong password for: {payload.email}")
        # Generic message for security (don't reveal which part failed)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Check if account is active
    if not admin.is_active:
        logger.warning(f"Login attempt on disabled account: {payload.email}")
        raise HTTPException(status_code=403, detail="Account disabled. Contact administrator.")

    # Create JWT token and set in httpOnly cookie
    try:
        token = create_access_token(admin)
        set_session_cookie(response, token)
    except Exception as e:
        logger.error(f"Token creation failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Authentication system error")
    
    logger.info(f"✓ Admin login successful: {admin.email} ({admin.role})")
    
    # ✅ Return admin data for frontend session initialization
    return {
        "message": "Login successful",
        "token": token,
        "id": str(admin.id),
        "name": admin.name,
        "email": admin.email,
        "role": admin.role,
    }

# ============================================================================
# GET CURRENT ADMIN - FIXED
# ============================================================================
@router.get("/me")
def read_admin_me(current_admin: AdminUser = Depends(get_current_admin)):
    """
    Return the currently authenticated admin user.
    
    Used by frontend on page load to hydrate session state from httpOnly cookie.
    This endpoint validates that:
    1. Session cookie exists
    2. JWT token is valid and not expired
    3. Admin account exists in database
    4. Admin account is active
    
    If any check fails, returns 401 Unauthorized and frontend redirects to login.
    """
    logger.debug(f"Session check for admin: {current_admin.email}")
    return {
        "id": str(current_admin.id),
        "name": current_admin.name,
        "email": current_admin.email,
        "role": current_admin.role,
        "is_active": current_admin.is_active,
    }

# ============================================================================
# LOGOUT ENDPOINT - FIXED
# ============================================================================
@router.post("/logout")
def admin_logout(response: Response, current_admin: AdminUser = Depends(get_current_admin)):
    """
    Clear the admin session cookie and logout.
    
    Requires valid session (401 if not authenticated).
    """
    clear_session_cookie(response)
    logger.info(f"✓ Admin logout: {current_admin.email}")
    return {"message": "Logged out successfully"}

# ============================================================================
# HEALTH CHECK - For debugging auth issues
# ============================================================================
@router.get("/health")
def auth_health_check():
    """
    Quick health check for the auth system.
    Useful for debugging cross-origin issues.
    
    Returns:
    - status: "ok" if auth system is ready
    - service: service name
    - cookie_name: name of the session cookie (for debugging)
    - algorithm: JWT algorithm in use
    - rounds: bcrypt rounds for password hashing
    """
    return {
        "status": "ok",
        "service": "admin-auth",
        "cookie_name": "sb_admin_session",
        "algorithm": "HS256",
        "bcrypt_rounds": 12,
    }

# ============================================================================
# TOKEN VALIDATION - For debugging
# ============================================================================
@router.get("/validate-token")
def validate_token(current_admin: AdminUser = Depends(get_current_admin)):
    """
    Validate the current session token.
    
    Returns token payload if valid, 401 if invalid or expired.
    Useful for debugging token issues.
    """
    return {
        "valid": True,
        "admin_id": str(current_admin.id),
        "email": current_admin.email,
        "role": current_admin.role,
        "message": "Token is valid"
    }