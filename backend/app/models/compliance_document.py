# backend/app/models/compliance_document.py
import uuid
from sqlalchemy import Column, String, Date, Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class ComplianceDocument(Base):
    __tablename__ = "compliance_document"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    document_type_code = Column(String(30), ForeignKey("document_type_master.code"), nullable=False)
    expiry_date = Column(Date)
    archived = Column(Boolean, default=False)
    reminder_5day_shown = Column(Boolean, default=False)
    reminder_3day_shown = Column(Boolean, default=False)
    sync_status = Column(String(20), default="pending")
    submitted_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
