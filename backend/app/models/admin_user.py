# backend/app/models/admin_user.py
# AUDIT FIX (MVP0 §04 / Admin Console §2): the console's LoginPage.jsx has always posted to
# /admin/auth/login, and require_super_admin has always been imported by five routers, but no
# admin identity model, password hashing, or JWT issuance ever existed. This is that missing
# piece -- a real admin_user table with a role column, checked by app/auth.py below.
import uuid
from sqlalchemy import Column, String, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class AdminUser(Base):
    __tablename__ = "admin_user"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(120), unique=True, nullable=False)
    name = Column(String(80), nullable=False)
    password_hash = Column(String(255), nullable=False)
    # AUDIT FIX (Admin Console §2, High): role is now enforced server-side by
    # require_super_admin / require_admin in app/auth.py, not just stored and ignored.
    role = Column(String(20), nullable=False, default="support_admin")  # support_admin | super_admin
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
