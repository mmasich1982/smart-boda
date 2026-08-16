# backend/app/models/swap_partner_master.py
# Referenced by fuel_entry.py's ForeignKey("swap_partner_master.id") but never given a
# model class (table created in alembic/0003_module_c_fuel_maintenance.py).
import uuid
from sqlalchemy import Column, String, Numeric, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class SwapPartnerMaster(Base):
    __tablename__ = "swap_partner_master"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(80), nullable=False)
    standard_fee = Column(Numeric(8, 2))  # null = "Other/Unlisted", manual entry
    sort_order = Column(Integer, server_default="0")
    is_active = Column(Boolean, server_default="true")
