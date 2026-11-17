# backend/app/models/user_session.py
# SMART APPS: one row per signed-in phone. At most ONE row per person has revoked_at = NULL (a unique partial index in
# database/smart_apps/001_user_sessions.sql enforces it). A login on another phone revokes the old row ("replaced").
import uuid
from sqlalchemy import Column, String, DateTime, Index, func, text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class UserSession(Base):
    __tablename__ = "user_session"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_kind = Column(String(10), nullable=False)                 # rider (riders AND business users) | admin
    user_id = Column(UUID(as_uuid=True), nullable=False)
    device_id = Column(String(64), nullable=False)
    device_label = Column(String(120), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revoked_reason = Column(String(20), nullable=True)             # replaced | logout | pin_reset | admin
    replaced_by = Column(UUID(as_uuid=True), nullable=True)

    __table_args__ = (
        Index("ux_user_session_one_active", "user_kind", "user_id", unique=True, postgresql_where=text("revoked_at IS NULL")),
    )
