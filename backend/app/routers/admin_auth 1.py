# backend/app/routers/admin_auth.py
# AUDIT FIX (Admin Console §2 / MVP0 roadmap): LoginPage.jsx has always posted to
# /admin/auth/login expecting { token, name, role } -- this endpoint never existed. It now
# issues a JWT in an httpOnly/Secure/SameSite=Strict cookie (see app/auth.py) instead of a
# token the frontend stores in localStorage.
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.admin_user import AdminUser
from app.auth import verify_password, create_access_token, set_session_cookie, clear_session_cookie, get_current_admin

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    admin = db.query(AdminUser).filter_by(email=payload.email, is_active=True).first()
    if not admin or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_access_token(admin)
    set_session_cookie(response, token)
    # Non-sensitive display data only -- the frontend keeps this in memory, never the token itself.
    return {"name": admin.name, "role": admin.role, "email": admin.email}


@router.get("/me")
def me(admin: AdminUser = Depends(get_current_admin)):
    return {"name": admin.name, "role": admin.role, "email": admin.email}


@router.post("/logout")
def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}
