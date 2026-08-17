# backend/app/routers/admin_auth.py
# COMPLETE IMPLEMENTATION - Copy this entire file to your project

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.admin_user import AdminUser
from app.auth import (
    verify_password, 
    create_access_token, 
    set_session_cookie,
    clear_session_cookie,
    get_current_admin,
    require_super_admin
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])

# ============================================================================
# REQUEST SCHEMAS
# ============================================================================

class LoginRequest(BaseModel):
    """Login request body."""
    email: str
    password: str
    
    class Config:
        example = {
            "email": "admin@example.com",
            "password": "password123"
        }


# ============================================================================
# RESPONSES (Optional - for documentation)
# ============================================================================

class AdminResponse(BaseModel):
    """Admin user response."""
    name: str
    email: str
    role: str
    
    class Config:
        example = {
            "name": "John Admin",
            "email": "admin@example.com",
            "role": "super_admin"
        }


# ============================================================================
# ENDPOINT 1: POST /admin/auth/login
# ============================================================================

@router.post(
    "/login",
    response_model=AdminResponse,
    status_code=200,
    summary="Admin Login",
    description="Authenticate admin with email and password. Returns JWT in httpOnly cookie."
)
async def login(
    request: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    Admin login endpoint.
    
    **Request body:**
    ```json
    {
        "email": "admin@example.com",
        "password": "password"
    }
    ```
    
    **Response (200 OK):**
    ```json
    {
        "name": "Admin Name",
        "email": "admin@example.com",
        "role": "super_admin"
    }
    ```
    
    **Side Effect:**
    Sets `sb_admin_session` httpOnly cookie in response.
    
    **Errors:**
    - 401: Invalid email or password, or account disabled
    - 422: Validation error in request body
    """
    logger.info(f"📍 Login attempt: email={request.email}")
    
    # ✅ Step 1: Find admin by email
    admin = db.query(AdminUser).filter(
        AdminUser.email == request.email
    ).first()
    
    if not admin:
        logger.warning(f"❌ Login failed: admin not found: {request.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # ✅ Step 2: Verify password
    if not verify_password(request.password, admin.password_hash):
        logger.warning(f"❌ Login failed: password mismatch for: {request.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # ✅ Step 3: Check if account is active
    if not admin.is_active:
        logger.warning(f"❌ Login failed: account disabled: {request.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled. Contact administrator."
        )
    
    # ✅ Step 4: Create JWT token
    try:
        token = create_access_token(admin)
        logger.info(f"✅ Token created for: {admin.email} ({admin.role})")
    except Exception as e:
        logger.error(f"❌ Failed to create token: {str(e)}", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate session token"
        )
    
    # ✅ Step 5: Create response with admin data
    response_data = AdminResponse(
        name=admin.name,
        email=admin.email,
        role=admin.role
    )
    
    # ✅ Step 6: Create response object and set cookie
    response = JSONResponse(
        status_code=200,
        content=response_data.model_dump()
    )
    
    set_session_cookie(response, token)
    logger.info(f"✅ Session cookie set for: {admin.email}")
    
    return response


# ============================================================================
# ENDPOINT 2: GET /admin/auth/me
# ============================================================================

@router.get(
    "/me",
    response_model=AdminResponse,
    status_code=200,
    summary="Get Current Admin",
    description="Get the currently authenticated admin's information from session cookie."
)
async def get_current_user(
    admin: AdminUser = Depends(get_current_admin)
):
    """
    Get current admin information.
    
    **Requires:** Valid `sb_admin_session` cookie
    
    **Response (200 OK):**
    ```json
    {
        "name": "Admin Name",
        "email": "admin@example.com",
        "role": "super_admin"
    }
    ```
    
    **Errors:**
    - 401: Not authenticated (no valid cookie)
    - 401: Account disabled
    
    **Usage:**
    Called by frontend on app load to hydrate session:
    ```javascript
    const { data } = await api.get('/admin/auth/me');
    setSession(data);
    ```
    """
    logger.debug(f"✓ Admin session verified: {admin.email}")
    
    return AdminResponse(
        name=admin.name,
        email=admin.email,
        role=admin.role
    )


# ============================================================================
# ENDPOINT 3: POST /admin/auth/logout
# ============================================================================

@router.post(
    "/logout",
    status_code=200,
    summary="Admin Logout",
    description="Logout admin and clear session cookie."
)
async def logout(
    admin: AdminUser = Depends(get_current_admin)
):
    """
    Logout endpoint.
    
    **Requires:** Valid `sb_admin_session` cookie
    
    **Response (200 OK):**
    ```json
    {"message": "Logged out successfully"}
    ```
    
    **Side Effect:**
    Clears `sb_admin_session` cookie.
    
    **Usage:**
    ```javascript
    await api.post('/admin/auth/logout');
    // Frontend should redirect to /login after this
    ```
    """
    response = JSONResponse(
        status_code=200,
        content={"message": "Logged out successfully"}
    )
    
    clear_session_cookie(response)
    logger.info(f"✓ Admin logged out: {admin.email}")
    
    return response


# ============================================================================
# ENDPOINT 4: GET /admin/auth/verify (Optional - for frontend debugging)
# ============================================================================

@router.get(
    "/verify",
    status_code=200,
    summary="Verify Session",
    description="Verify that current session is valid (for debugging).",
    tags=["admin-auth-debug"]
)
async def verify_session(
    request: Request,
    admin: AdminUser = Depends(get_current_admin)
):
    """
    Verify current session validity (useful for debugging).
    
    **Requires:** Valid `sb_admin_session` cookie
    
    **Response (200 OK):**
    ```json
    {
        "status": "valid",
        "admin": {
            "name": "Admin Name",
            "email": "admin@example.com",
            "role": "super_admin"
        },
        "cookies_received": {
            "sb_admin_session": "eyJ0eXAi..."
        }
    }
    ```
    
    **Remove this endpoint in production** - it's for debugging only.
    """
    return {
        "status": "valid",
        "admin": {
            "name": admin.name,
            "email": admin.email,
            "role": admin.role
        },
        "cookies_received": dict(request.cookies)
    }


# ============================================================================
# ENDPOINT 5: POST /admin/auth/change-password (Optional but recommended)
# ============================================================================

class ChangePasswordRequest(BaseModel):
    """Change password request."""
    current_password: str
    new_password: str
    
    class Config:
        example = {
            "current_password": "oldpassword",
            "new_password": "newpassword123"
        }


@router.post(
    "/change-password",
    status_code=200,
    summary="Change Password",
    description="Change authenticated admin's password."
)
async def change_password(
    request: ChangePasswordRequest,
    admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Change admin password.
    
    **Requires:** Valid session cookie
    
    **Request body:**
    ```json
    {
        "current_password": "old_password",
        "new_password": "new_password"
    }
    ```
    
    **Response (200 OK):**
    ```json
    {"message": "Password changed successfully"}
    ```
    
    **Errors:**
    - 401: Current password incorrect
    - 400: New password too weak
    """
    from app.auth import hash_password
    
    # Verify current password
    if not verify_password(request.current_password, admin.password_hash):
        logger.warning(f"❌ Password change failed: wrong current password for: {admin.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )
    
    # Validate new password
    if len(request.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters"
        )
    
    # Update password
    try:
        admin.password_hash = hash_password(request.new_password)
        db.add(admin)
        db.commit()
        logger.info(f"✓ Password changed for: {admin.email}")
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Failed to change password: {str(e)}", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update password"
        )
    
    return {"message": "Password changed successfully"}


# ============================================================================
# NOTES FOR IMPLEMENTATION
# ============================================================================

"""
WHAT TO VERIFY:

1. AdminUser Model (backend/app/models/admin_user.py)
   - Must have: id, email, password_hash, name, role, is_active
   - email should be unique
   - password_hash should be bcrypt hash (60 chars)

2. Database Setup (backend/app/database.py)
   - init_db() must create AdminUser table
   - get_db() must return session

3. Main App (backend/app/main.py)
   - Must include this router:
     from app.routers import admin_auth
     app.include_router(admin_auth.router)

4. Auth Functions (backend/app/auth.py)
   - verify_password() - check password against hash
   - create_access_token() - create JWT
   - set_session_cookie() - set httpOnly cookie
   - clear_session_cookie() - delete cookie
   - get_current_admin() - extract admin from cookie
   - hash_password() - hash password (for /change-password)

5. Environment Variables
   ADMIN_JWT_SECRET=your-secret-key (min 32 chars)
   COOKIE_DOMAIN=.onrender.com (if needed)
   DATABASE_URL=postgresql://...

6. Test Data
   Create admin user in database:
   AdminUser(
       email='admin@example.com',
       password_hash=hash_password('password'),
       name='Test Admin',
       role='super_admin',
       is_active=True
   )

7. Frontend
   - Must use axios with withCredentials: true
   - Must call GET /admin/auth/me on app load
   - Must call POST /admin/auth/login on login form submit
   - Must handle 401 and redirect to login

DEBUGGING:
- Check logs for: "✅ Token created" and "✅ Session cookie set"
- Use curl to test endpoints
- Check browser DevTools > Application > Cookies for sb_admin_session
- Check Network tab for Cookie headers in requests

PRODUCTION CHECKLIST:
- Remove /admin/auth/verify endpoint
- Use strong ADMIN_JWT_SECRET
- Set COOKIE_DOMAIN only if needed
- Enable HTTPS only (secure=True)
- Test with real credentials
- Monitor logs for failed login attempts
"""