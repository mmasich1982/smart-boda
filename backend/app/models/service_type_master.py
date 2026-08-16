# backend/app/models/service_type_master.py
# Referenced by maintenance_entry.py's ForeignKey("service_type_master.code") but never
# given a model class (table created in alembic/0003_module_c_fuel_maintenance.py).
from sqlalchemy import Column, String, Boolean, Integer
from app.database import Base


class ServiceTypeMaster(Base):
    __tablename__ = "service_type_master"
    code = Column(String(30), primary_key=True)  # e.g. "oil_change"
    display_name = Column(String(60), nullable=False)
    icon = Column(String(10))
    is_dated = Column(Boolean, server_default="false")  # BR-SB12-002: only Oil Change / General Service
    default_interval_km = Column(Integer)  # used when is_dated=false, BR-SB12-007
    sort_order = Column(Integer, server_default="0")
    is_active = Column(Boolean, server_default="true")
