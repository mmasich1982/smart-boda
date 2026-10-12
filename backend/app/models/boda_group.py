# backend/app/models/boda_group.py
import uuid
from sqlalchemy import Column, String, Integer, Text, Date, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class BodaGroup(Base):
    __tablename__ = "boda_group"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_code = Column(String(12), unique=True, nullable=False)
    group_name = Column(String(120), nullable=False)
    county_id = Column(Integer, ForeignKey("counties.id"), nullable=False)
    sub_county_id = Column(Integer, ForeignKey("sub_counties.id"), nullable=False)
    ward_id = Column(Integer, ForeignKey("wards.id"), nullable=False)
    stage_name = Column(String(120), nullable=False)
    approved_slots = Column(Integer, nullable=False)
    chair_name = Column(String(80), nullable=False)
    chair_phone = Column(String(15), nullable=False)
    treasurer_name = Column(String(80), nullable=False)
    treasurer_phone = Column(String(15), nullable=False)
    registered_at = Column(Date, server_default=func.current_date())
    status = Column(String(10), nullable=False, default="active")
    created_by_admin_id = Column(UUID(as_uuid=True), ForeignKey("admin_user.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class GroupSlotRequest(Base):
    __tablename__ = "group_slot_request"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("boda_group.id"), nullable=False)
    requested_by_rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    requested_slots = Column(Integer, nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(10), nullable=False, default="pending")
    decided_slots = Column(Integer)
    admin_comment = Column(Text)
    decided_by_admin_id = Column(UUID(as_uuid=True), ForeignKey("admin_user.id"))
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    decided_at = Column(DateTime(timezone=True))

class AppNotification(Base):
    __tablename__ = "app_notification"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipient_type = Column(String(10), nullable=False)
    recipient_id = Column(UUID(as_uuid=True))
    kind = Column(String(40), nullable=False)
    title = Column(String(120), nullable=False)
    body = Column(Text, nullable=False)
    ref_type = Column(String(30))
    ref_id = Column(UUID(as_uuid=True))
    status = Column(String(10), nullable=False, default="active")
    completion_reason = Column(String(40))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))