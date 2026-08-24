# backend/app/models/suggestion.py
import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Suggestion(Base):
    __tablename__ = "suggestion"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    category_code = Column(String, ForeignKey("suggestion_category_master.code"), nullable=True)
    message = Column(Text, nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=False)