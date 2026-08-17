from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.admin_user import AdminUser
from app.auth import (
    verify_password,
    create_access_token,
    set_session_cookie,
    clear_session_cookie,
    get_current_admin,
)

router = APIRouter()

@router.post("/login")
def admin_login(email: str, password: str, response: Response, db: Session = Depends(get_db)):
    """Admin login endpoint: validates credentials and sets JWT cookie."""
    admin = db.query(AdminUser).filter(AdminUser.email == email).first()
    if not admin or not verify_password(password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not admin.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_access_token(admin)
    set_session_cookie(response, token)
    return {"message": "Login successful"}

@router.get("/me")
def read_admin_me(current_admin: AdminUser = Depends(get_current_admin)):
    """Return the currently authenticated admin user."""
    return {
        "id": str(current_admin.id),
        "name": current_admin.name,
        "email": current_admin.email,
        "role": current_admin.role,
        "is_active": current_admin.is_active,
    }

@router.post("/logout")
def admin_logout(response: Response):
    """Clear the admin session cookie."""
    clear_session_cookie(response)
    return {"message": "Logged out successfully"}