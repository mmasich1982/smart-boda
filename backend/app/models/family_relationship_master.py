# backend/app/models/family_relationship_master.py
from sqlalchemy import Column, String, Integer, Boolean
from app.database import Base

class FamilyRelationshipMaster(Base):
    __tablename__ = "family_relationship_master"
    code = Column(String(30), primary_key=True)
    display_name = Column(String(60), nullable=False)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
