# backend/app/models/compliance_master_data.py
from sqlalchemy import Column, String, Integer, Boolean
from app.database import Base

class DocumentTypeMaster(Base):
    __tablename__ = "document_type_master"
    code = Column(String(30), primary_key=True)
    display_name = Column(String(60), nullable=False)
    expires = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

class StatementPurposeMaster(Base):
    __tablename__ = "statement_purpose_master"
    code = Column(String(30), primary_key=True)
    display_name = Column(String(60), nullable=False)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

class ComplianceRuleConfig(Base):
    __tablename__ = "compliance_rule_config"
    id = Column(Integer, primary_key=True)  # single-row config table
    expiry_reminder_first_days = Column(Integer, default=5)   # BR-SB18-006
    expiry_reminder_final_days = Column(Integer, default=3)
    transaction_list_page_size = Column(Integer, default=20)  # BR-SB19-010
    statement_history_page_size = Column(Integer, default=10)  # BR-SB20-010
    # ADDED (ADDITIONAL_CRITICAL_MVP0_FEATURES.docx #2/#3): "the 48-hour timeline must be
    # configurable, allowing administrators to adjust the delivery window" -- for both the
    # data-export and detailed-statement email flows, via this same rule-config screen.
    data_export_delivery_hours = Column(Integer, default=48)
    statement_delivery_hours = Column(Integer, default=48)
