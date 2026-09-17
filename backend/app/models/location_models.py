# backend/app/models/location_models.py
# Kenya Administrative Divisions Master Data Models
# Hierarchical structure: County -> Sub-County -> Ward

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Index, func, Text
from app.database import Base

class County(Base):
    """
    Kenya County Master Data
    Represents the 47 counties in Kenya's administrative structure
    """
    __tablename__ = "counties"

    id = Column(Integer, primary_key=True, index=True)
    county_code = Column(String(10), unique=True, nullable=False, index=True)
    county_name = Column(String(100), nullable=False, index=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<County(id={self.id}, name={self.county_name})>"


class SubCounty(Base):
    """
    Kenya Sub-County Master Data
    Represents sub-counties within each county
    Each sub-county belongs to exactly one county
    """
    __tablename__ = "sub_counties"

    id = Column(Integer, primary_key=True, index=True)
    sub_county_code = Column(String(10), unique=True, nullable=False, index=True)
    sub_county_name = Column(String(100), nullable=False, index=True)
    county_id = Column(Integer, ForeignKey("counties.id", ondelete="CASCADE"), nullable=False, index=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Index for efficient filtering by county
    __table_args__ = (
        Index('idx_sub_counties_county_active', 'county_id', 'is_active'),
        Index('idx_sub_counties_name_active', 'sub_county_name', 'is_active'),
    )

    def __repr__(self):
        return f"<SubCounty(id={self.id}, name={self.sub_county_name}, county_id={self.county_id})>"


class Ward(Base):
    """
    Kenya Ward Master Data
    Represents wards within each sub-county
    Each ward belongs to exactly one sub-county and one county
    """
    __tablename__ = "wards"

    id = Column(Integer, primary_key=True, index=True)
    ward_code = Column(String(10), unique=True, nullable=False, index=True)
    ward_name = Column(String(100), nullable=False, index=True)
    sub_county_id = Column(Integer, ForeignKey("sub_counties.id", ondelete="CASCADE"), nullable=False, index=True)
    county_id = Column(Integer, ForeignKey("counties.id", ondelete="CASCADE"), nullable=False, index=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Indexes for efficient filtering
    __table_args__ = (
        Index('idx_wards_sub_county_active', 'sub_county_id', 'is_active'),
        Index('idx_wards_county_active', 'county_id', 'is_active'),
        Index('idx_wards_name_active', 'ward_name', 'is_active'),
    )

    def __repr__(self):
        return f"<Ward(id={self.id}, name={self.ward_name}, sub_county_id={self.sub_county_id})>"
