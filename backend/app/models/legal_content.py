# backend/app/models/legal_content.py
# Backs the Admin Console's "Legal Content (Terms, Privacy)" master-data page and the
# rider-app's screens/legal/TermsOfServiceScreen.js and DataPrivacyScreen.js -- neither of
# which had any admin-editable storage in any of the five developer guides.
from sqlalchemy import Column, String, Text, DateTime, func
from app.database import Base


class LegalContent(Base):
    __tablename__ = "legal_content"
    key = Column(String(40), primary_key=True)  # 'terms_of_service' | 'data_privacy'
    content = Column(Text, nullable=False, default="")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
