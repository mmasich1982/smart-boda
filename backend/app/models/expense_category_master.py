# backend/app/models/expense_category_master.py
from sqlalchemy import Column, String, Integer, Boolean
from app.database import Base

class ExpenseCategoryMaster(Base):
    __tablename__ = "expense_category_master"
    code = Column(String(30), primary_key=True)
    display_name = Column(String(60), nullable=False)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
