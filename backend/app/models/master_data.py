# backend/app/models/master_data.py
from sqlalchemy import Column, Integer, String, Boolean, Numeric, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base

class LanguageMaster(Base):
    __tablename__ = "language_master"
    id = Column(Integer, primary_key=True)
    code = Column(String(10), unique=True, nullable=False)
    display_name = Column(String(60), nullable=False)
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)

class FuelTypeMaster(Base):
    __tablename__ = "fuel_type_master"
    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)
    display_name = Column(String(40), nullable=False)
    is_active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)  # Issue 6 fix: Mark Petrol & Electric as default/read-only
    sort_order = Column(Integer, default=0)

# AUDIT FIX (blocking, found during startup sanity check): alembic/versions/ui_string_master.py
# fully specifies this table, and both language.py and seed_ui_strings.py import a
# UiStringMaster class from this module -- but it was never actually written, so importing
# app.routers.language (imported directly by main.py) raised ImportError at boot.
class UiStringMaster(Base):
    __tablename__ = "ui_string_master"
    id = Column(Integer, primary_key=True)
    string_key = Column(String(120), nullable=False)
    language_code = Column(String(10), ForeignKey("language_master.code"), nullable=False)
    translated_text = Column(Text, nullable=False)
    needs_review = Column(Boolean, default=True)
    reviewed_by = Column(String(80))
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class ValuePreviewConfig(Base):
    __tablename__ = "value_preview_config"
    id = Column(Integer, primary_key=True)
    language_code = Column(String(10), ForeignKey("language_master.code"))
    sample_weekly_earnings_ksh = Column(Numeric(10, 2), nullable=False)
    sample_weekly_costs_ksh = Column(Numeric(10, 2), nullable=False)
    sample_cost_breakdown_json = Column(JSONB, nullable=False)