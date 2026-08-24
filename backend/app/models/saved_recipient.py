from sqlalchemy import Column, String, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class SavedRecipient(Base):
    __tablename__ = "saved_recipients"
    
    id = Column(String(50), primary_key=True)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id"), nullable=False)
    name = Column(String(120), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Foreign key relationships
    rider = relationship("Rider", back_populates="saved_recipients")
    
    __table_args__ = (
        Index("ix_saved_recipients_rider_id", "rider_id"),
        Index("ix_saved_recipients_name", "name"),
        Index("ix_saved_recipients_rider_name", "rider_id", "name", unique=True),
    )
    
    def to_dict(self):
        return {
            "id": self.id,
            "rider_id": self.rider_id,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }