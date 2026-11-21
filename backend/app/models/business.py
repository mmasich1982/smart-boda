# backend/app/models/business.py
# SMART BIZNA: a business and the people who work in it. The Smart Boda / Smart Bizna Administrator registers a business
# (name + each user's name and mobile number). One user is the Business Owner; every other user is a Sales/Service Person.
# A user then opens the app, types their mobile number in Setup My Profile, and the server finds the record here (indexed
# look-up on phone_key; ONE OWNER may hold several businesses = several rows with the same phone_key, staff stay in one business: migration 003), shows the name, and creates the account in the rider table (the shared account table).
#
#   business_type_master  the Business Type list shown in Setup My Profile (master data, like fuel_type_master)
#   business              one row per business; business_type_code is saved by the first user who sets up
#   business_user         one row per person PER BUSINESS; phone_key (last 9 digits); exactly one active OWNER per business; a number is never both staff and Owner
#
# Tile permissions (can the Sales/Service Person see Business Purchases / Business Expenses) are stored here from day one
# (business default + per-person override, NULL = "Same as business") but are only ENFORCED in a later release.
import uuid
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Index, CheckConstraint, Numeric, func, text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

OWNER = "OWNER"
SALES_PERSON = "SALES_PERSON"
AWAITING = "awaiting_registration"
REGISTERED = "registered"
INACTIVE = "inactive"
PENDING_SETUP = "pending_setup"
ACTIVATED = "activated"


class BusinessTypeMaster(Base):
    __tablename__ = "business_type_master"
    id = Column(Integer, primary_key=True)
    code = Column(String(30), unique=True, nullable=False)
    display_name = Column(String(60), nullable=False)
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)


class Business(Base):
    __tablename__ = "business"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_name = Column(String(80), nullable=False)
    business_type_code = Column(String(30), ForeignKey("business_type_master.code"))   # saved by the first user who sets up
    sales_can_see_purchases = Column(Boolean, nullable=False, default=False)            # default for every Sales/Service Person
    sales_can_see_expenses = Column(Boolean, nullable=False, default=False)
    status = Column(String(20), nullable=False, default=PENDING_SETUP)
    perm_changed_at = Column(DateTime(timezone=True))                                   # when the business tile defaults last changed (offline-created records stay valid)
    # The business LOCATION is its GPS position, captured by the Administrator at registration (migration 004) and shown on the Businesses Map.
    # county_id / sub_county_id / ward_id are the OLD way (County, Sub-county, Ward). They are kept, untouched, so every business registered
    # before the change keeps its place name; new registrations no longer ask for them.
    latitude = Column(Numeric(9, 6))                       # decimal degrees, 6 places (about 0.1 m); NULL = not captured yet
    longitude = Column(Numeric(9, 6))
    location_accuracy_m = Column(Numeric(8, 1))            # how close the phone said it was, in metres (NULL for a typed position)
    location_source = Column(String(10))                   # 'gps' = taken from the device, 'manual' = typed or pasted by the Administrator
    location_captured_at = Column(DateTime(timezone=True))
    county_id = Column(Integer, ForeignKey("counties.id"))
    sub_county_id = Column(Integer, ForeignKey("sub_counties.id"))
    ward_id = Column(Integer, ForeignKey("wards.id"))
    created_by_admin_id = Column(UUID(as_uuid=True), ForeignKey("admin_user.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (
        CheckConstraint("status IN ('pending_setup','activated','inactive')", name="ck_business_status"),
        CheckConstraint("(latitude IS NULL) = (longitude IS NULL)", name="ck_business_gps_pair"),                       # both or neither
        CheckConstraint("latitude IS NULL OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)", name="ck_business_gps_range"),
        CheckConstraint("location_source IS NULL OR location_source IN ('gps','manual')", name="ck_business_gps_source"),
    )


class BusinessUser(Base):
    __tablename__ = "business_user"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), ForeignKey("business.id", ondelete="CASCADE"), nullable=False)
    full_name = Column(String(80), nullable=False)
    mobile_number = Column(String(15), nullable=False)                 # normalised +2547XXXXXXXX
    phone_key = Column(String(9), nullable=False)                      # last 9 digits: the indexed look-up key (unique)
    role = Column(String(15), nullable=False)
    can_see_purchases = Column(Boolean)                                # NULL = Same as business, otherwise this person's own Yes / No
    can_see_expenses = Column(Boolean)
    status = Column(String(25), nullable=False, default=AWAITING)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id", ondelete="SET NULL"))   # the account created at Setup My Profile
    perm_changed_at = Column(DateTime(timezone=True))                  # when this person's own tile choices last changed
    registered_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (
        Index("uq_business_user_biz_phone", "business_id", "phone_key", unique=True),                        # a person appears once in a business
        Index("uq_business_user_sales_phone", "phone_key", unique=True, postgresql_where=text("role = 'SALES_PERSON'")),   # staff: ONE business only
        Index("ix_business_user_phone_key", "phone_key"),
        Index("ix_business_user_rider", "rider_id"),
        Index("ix_business_user_business", "business_id"),
        Index("uq_business_one_active_owner", "business_id", unique=True,
              postgresql_where=text("role = 'OWNER' AND status <> 'inactive'")),            # exactly one active Owner per business
        CheckConstraint("role IN ('OWNER','SALES_PERSON')", name="ck_business_user_role"),
        CheckConstraint("status IN ('awaiting_registration','registered','inactive')", name="ck_business_user_status"),
        CheckConstraint("phone_key ~ '^[0-9]{9}$'", name="ck_business_user_key"),
    )
