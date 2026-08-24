# backend/app/models/data_export_reason_master.py
# ADDED (ADDITIONAL_CRITICAL_MVP0_FEATURES.docx #2): the "configurable drop-list field to
# select the reason for the data export" -- admin-governed like every other *_master table.
from sqlalchemy import Column, String, Integer, Boolean
from app.database import Base

class DataExportReasonMaster(Base):
    __tablename__ = "data_export_reason_master"
    code = Column(String(30), primary_key=True)
    display_name = Column(String(80), nullable=False)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
