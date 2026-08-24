# backend/app/models/data_export_request.py
import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class DataExportRequest(Base):
    __tablename__ = "data_export_request"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    status = Column(String(20), default="pending")  # pending | fulfilled, BR-SB21-006 manual on Super Admin side
    # ADDED (docx #2): PIN confirm -> email + reason dropdown -> confirmation, before this
    # request is created at all. reason_code is the "configurable drop-list field" from
    # data_export_reason_master (admin-governed, like every other *_master table here).
    reason_code = Column(String(30), ForeignKey("data_export_reason_master.code"), nullable=True)
    contact_email = Column(String(120), nullable=True)
    pin_verified_at = Column(DateTime(timezone=True), nullable=True)
    requested_at = Column(DateTime(timezone=True), nullable=False)
    fulfilled_at = Column(DateTime(timezone=True))
