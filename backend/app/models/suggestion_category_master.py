# backend/app/models/suggestion_category_master.py
from sqlalchemy import Column, String, Integer, Boolean
from app.database import Base


class SuggestionCategoryMaster(Base):
    __tablename__ = "suggestion_category_master"
    code = Column(String(30), primary_key=True)
    emoji = Column(String(10), nullable=True)
    display_name = Column(String(60), nullable=False)
    sort_order = Column(Integer, server_default="0")
    is_active = Column(Boolean, server_default="true")