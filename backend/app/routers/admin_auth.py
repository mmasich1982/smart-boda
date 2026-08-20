from fastapi import APIRouter, Depends, HTTPException, Response
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
    """
    # Query for admin user
    admin = db.query(AdminUser).filter(AdminUser.email == payload.email).first()
    
    if not admin:
        logger.warning(f"Login attempt with non-existent email: {payload.email}")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Verify password
    if not verify_password(payload.password, admin.password_hash):
        logger.warning(f"Login attempt with wrong password for: {payload.email}")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Check if account is active
    if not admin.is_active:
        logger.warning(f"Login attempt on disabled account: {payload.email}")
        raise HTTPException(status_code=403, detail="Account disabled. Contact administrator.")

    # Create JWT token and set in httpOnly cookie
    token = create_access_token(admin)
    set_session_cookie(response, token)
    
    logger.info(f"✓ Admin login successful: {admin.email} ({admin.role})")
    
    # ✅ Return admin data for frontend session initialization
    return {
        "message": "Login successful",
        "token": token,  # ← Add this line
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
    """
    return {
        "status": "ok",
        "service": "admin-auth",
        "cookie_name": "sb_admin_session",
    }
