# backend/app/models/fuel_master_data.py
# AUDIT FIX (MVP0 §04, Gap): 6 files import a combined `app.models.fuel_master_data` module
# expecting ServiceTypeMaster, OilTypeMaster, SwapPartnerMaster, FuelMaintenanceRuleConfig.
# The first three already exist correctly in their own files (service_type_master.py,
# oil_type_master.py, swap_partner_master.py) -- re-exported here rather than duplicated.
# FuelMaintenanceRuleConfig genuinely didn't exist anywhere; transcribed from the columns
# already fully specified in alembic/0003_module_c_fuel_maintenance.py.
from sqlalchemy import Column, Integer
from app.database import Base
from app.models.service_type_master import ServiceTypeMaster  # noqa: F401 (re-export)
from app.models.oil_type_master import OilTypeMaster  # noqa: F401 (re-export)
from app.models.swap_partner_master import SwapPartnerMaster  # noqa: F401 (re-export)


class FuelMaintenanceRuleConfig(Base):
    __tablename__ = "fuel_maintenance_rule_config"
    id = Column(Integer, primary_key=True)  # single-row config table
    # REMOVED (docx #4): odometer_prompt_frequency dropped along with the standalone
    # odometer-entry auto-trigger it configured.
    default_battery_range_km = Column(Integer, default=60)
    due_alert_tier_first_km = Column(Integer, default=500)  # BR-SB12-008
    due_alert_tier_firm_km = Column(Integer, default=200)
    due_alert_tier_final_km = Column(Integer, default=100)
