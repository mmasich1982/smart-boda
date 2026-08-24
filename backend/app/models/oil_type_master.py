# backend/app/models/oil_type_master.py
# Referenced by maintenance_entry.py's and bike_profile.py's ForeignKey("oil_type_master.code")
# but never given a model class (table created in alembic/0003_module_c_fuel_maintenance.py).
from sqlalchemy import Column, String, Integer, Boolean
from app.database import Base


class OilTypeMaster(Base):
    __tablename__ = "oil_type_master"
    code = Column(String(30), primary_key=True)
    display_name = Column(String(60), nullable=False)
    interval_km = Column(Integer, nullable=False)
    sort_order = Column(Integer, server_default="0")
    is_active = Column(Boolean, server_default="true")
