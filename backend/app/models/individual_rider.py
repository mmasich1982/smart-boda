# backend/app/models/individual_rider.py
# INDIVIDUAL RIDERS: a rider who joins Smart Boda on their own, with no Treasurer and no group.
# The Smart Boda Administrator pre-creates the rider here (name + mobile number). The rider later opens the app, types
# the number, and the server finds this record (indexed look-up on phone_key), shows the name, and then creates the
# real row in the rider table through the normal Setup My Profile flow. This table is only the "waiting list".
#
#   awaiting_registration  the Administrator created it; the rider has not started Setup My Profile yet
#   registered             the rider account exists in the rider table (registered_rider_id points to it)
#
# phone_key is the last 9 digits of the number, exactly like group_member.phone_key, and is UNIQUE: the database itself
# refuses a second record for the same number, even if two Administrators save at the same moment.
import uuid
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index, CheckConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

AWAITING = "awaiting_registration"
REGISTERED = "registered"


class IndividualRiderPreRegistration(Base):
    __tablename__ = "individual_rider_preregistration"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name = Column(String(80), nullable=False)
    mobile_number = Column(String(15), nullable=False)           # normalised +2547XXXXXXXX, the same form as rider.mobile_number
    phone_key = Column(String(9), nullable=False)                # last 9 digits: the indexed look-up key (unique)
    county_id = Column(Integer, ForeignKey("counties.id"))               # location chosen by the Administrator (same cascade as a group);
    sub_county_id = Column(Integer, ForeignKey("sub_counties.id"))       # copied to the rider account when the rider registers.
    ward_id = Column(Integer, ForeignKey("wards.id"))                    # Required by the API; nullable here only so older records still load.
    status = Column(String(25), nullable=False, default=AWAITING)
    registered_rider_id = Column(UUID(as_uuid=True), ForeignKey("rider.id", ondelete="SET NULL"))
    registered_at = Column(DateTime(timezone=True))
    created_by_admin_id = Column(UUID(as_uuid=True), ForeignKey("admin_user.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("uq_individual_rider_prereg_phone_key", "phone_key", unique=True),
        Index("ix_individual_rider_prereg_status", "status"),
        CheckConstraint("status IN ('awaiting_registration','registered')", name="ck_individual_rider_prereg_status"),
        CheckConstraint("phone_key ~ '^[0-9]{9}$'", name="ck_individual_rider_prereg_key"),
    )
