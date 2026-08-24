# backend/app/models/trip_master_data.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime, func
from app.database import Base

class PaymentChannelMaster(Base):
    __tablename__ = "payment_channel_master"
    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)
    display_name = Column(String(40), nullable=False)
    emoji = Column(String(8))
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)

class CorrectionReasonMaster(Base):
    __tablename__ = "correction_reason_master"
    id = Column(Integer, primary_key=True)
    code = Column(String(30), unique=True, nullable=False)
    display_name = Column(String(60), nullable=False)
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)

class TripEntryRuleConfig(Base):
    __tablename__ = "trip_entry_rule_config"
    id = Column(Integer, primary_key=True)
    config_key = Column(String(60), unique=True, nullable=False)
    config_value = Column(Integer, nullable=False)
    description = Column(String(200))
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
