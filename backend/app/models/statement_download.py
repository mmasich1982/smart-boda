# backend/app/models/statement_download.py
import uuid
from sqlalchemy import Column, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class StatementDownload(Base):
    __tablename__ = "statement_download"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    statement_id = Column(UUID(as_uuid=True), ForeignKey("statement.id"), nullable=False)
    downloaded_at = Column(DateTime(timezone=True), nullable=False)  # BR-SB20-006: one row per download event
