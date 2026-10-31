# backend/app/routers/setup_profile.py
# SETUP MY PROFILE (onboarding). The rider types the MOBILE NUMBER their Group Treasurer registered (or, for a Treasurer, the
# number the Smart Boda Administrator recorded on the group). The server finds that record, shows the full name, and
# creates the rider account. No number plate, no separate mobile-number / profile-confirmation screens.
#
#   GET  /onboarding/profile-lookup/{mobile_number}   -> {found, full_name, ...}   (before the account exists)
#   POST /onboarding/setup-profile                    -> {rider_id, full_name, ...} (creates / resumes the pending rider)
#
# Who may set up: only a number that a Treasurer registered in a group, that the administrator named as a group's Treasurer,
# or that the administrator pre-registered as an INDIVIDUAL rider (no Treasurer, no group; see admin_individual_riders.py).
# Everyone else is told to ask their Group Treasurer or Smart Boda, so the app cannot be joined by guessing a number.
import logging
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.bike_profile import BikeProfile
from app.models.boda_group import BodaGroup, GroupMember
from app.models.master_data import FuelTypeMaster, LanguageMaster
from app.models.rider import Rider
from app.routers.mobile_number import validate_mobile_number
from app.schemas.onboarding import SetupProfileRequest
from app.services.group_member_link_service import find_rider_id_by_mobile, link_members_for_rider
from app.services.group_roles import phone_key, same_phone
from app.services.individual_rider_service import find_preregistration, mark_registered

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/onboarding", tags=["Setup My Profile"])

NOT_FOUND = ("We could not find this mobile number. Ask your Group Treasurer to register you in the group, "
             "or contact Smart Boda to be added as an individual rider, then try again.")


def find_registration(db: Session, mobile: str):
    """The record for this mobile number: (full_name, county_id, sub_county_id, ward_id, source) or None.
    source is "member", "treasurer" or "individual" (pre-registered by the administrator: no group; the location is the one the administrator chose)."""
    k = phone_key(mobile)
    m = (db.query(GroupMember, BodaGroup).join(BodaGroup, BodaGroup.id == GroupMember.group_id)
         .filter(GroupMember.phone_key == k, GroupMember.status == "active", BodaGroup.status == "active")
         .order_by(GroupMember.created_at).first())
    if m:
        gm, g = m
        return gm.full_name, g.county_id, g.sub_county_id, g.ward_id, "member"
    for g in db.query(BodaGroup).filter(BodaGroup.status == "active").order_by(BodaGroup.created_at).all():
        if same_phone(g.treasurer_phone, mobile):
            return g.treasurer_name, g.county_id, g.sub_county_id, g.ward_id, "treasurer"
    pre = find_preregistration(db, mobile)                    # indexed look-up on the pre-registration table
    if pre:
        return pre.full_name, pre.county_id, pre.sub_county_id, pre.ward_id, "individual"       # location chosen by the Administrator
    return None


def _clean(mobile):
    ok, normalized, err = validate_mobile_number(mobile)
    if not ok:
        raise HTTPException(400, err or "Enter a valid Kenyan mobile number.")
    return normalized


@router.get("/profile-lookup/{mobile_number}")
def profile_lookup(mobile_number: str, db: Session = Depends(get_db)):
    """Shows the rider their own name once they type their number. 404 = no Treasurer has registered this number.
    409 = this number already has a finished account (the rider should log in)."""
    normalized = _clean(mobile_number)
    rid = find_rider_id_by_mobile(db, normalized)
    if rid:
        r = db.get(Rider, rid)
        if r and r.registration_status == "active":
            raise HTTPException(409, "This mobile number is already set up. Please log in with your PIN.")
    reg = find_registration(db, normalized)
    if not reg:
        raise HTTPException(404, NOT_FOUND)
    return {"found": True, "full_name": reg[0], "mobile_number": normalized, "source": reg[4]}


@router.post("/setup-profile")
def setup_profile(payload: SetupProfileRequest, db: Session = Depends(get_db)):
    """Creates the rider account (or resumes a pending one) with the name and location from the Treasurer's record, saves the
    fuel type and the terms consent, and links the rider to the groups that registered this number. The rider_id returned
    here is what the app stores locally (getLocalRiderId) and what Home loads with."""
    normalized = _clean(payload.mobile_number)
    if not payload.consent_accepted:
        raise HTTPException(422, "You must accept the Terms and Privacy Notice to continue.", headers={"X-Error-Code": "CONSENT_REQUIRED"})
    if not db.query(FuelTypeMaster).filter_by(code=payload.fuel_type_code, is_active=True).first():
        raise HTTPException(422, "Please choose the fuel type of your motorcycle.")
    reg = find_registration(db, normalized)
    if not reg:
        raise HTTPException(404, NOT_FOUND)
    name, county_id, sub_county_id, ward_id, _src = reg
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    lang = payload.language_code if payload.language_code and db.query(LanguageMaster).filter_by(code=payload.language_code).first() else None
    try:
        rid = find_rider_id_by_mobile(db, normalized)
        rider = db.get(Rider, rid) if rid else None
        if rider and rider.registration_status == "active":
            raise HTTPException(409, "This mobile number is already set up. Please log in with your PIN.")
        if not rider:
            rider = Rider(id=uuid.uuid4(), mobile_number=normalized, mobile_verified=False, created_at=now)
            db.add(rider)
        rider.full_name = name
        rider.county_id, rider.sub_county_id, rider.ward_id = county_id, sub_county_id, ward_id
        rider.consent_accepted_at, rider.consent_content_version = now, payload.consent_content_version
        rider.registration_status, rider.onboarding_step, rider.updated_at = "verified_incomplete", "createPin", now
        if lang: rider.language_code = lang
        db.flush()
        bp = db.query(BikeProfile).filter_by(rider_id=rider.id, is_active=True).first()
        if bp: bp.fuel_type_code = payload.fuel_type_code
        else: db.add(BikeProfile(rider_id=rider.id, fuel_type_code=payload.fuel_type_code, submitted_at=now,
                                 sync_status="synced", is_active=True))
        link_members_for_rider(db, rider)
        mark_registered(db, rider)                            # an individual rider's waiting record becomes "registered"
        db.commit()
    except HTTPException:
        db.rollback(); raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This mobile number is already registered. Please log in.", headers={"X-Error-Code": "MOBILE_DUPLICATE"})
    except Exception as e:
        db.rollback()
        logger.error(f"setup_profile failed for {normalized}: {e}", exc_info=True)
        raise HTTPException(500, "We could not save your profile. Please try again.")
    return {"status": "confirmed", "rider_id": str(rider.id), "full_name": rider.full_name,
            "mobile_number": rider.mobile_number, "fuel_type_code": payload.fuel_type_code,
            "county_id": county_id, "sub_county_id": sub_county_id, "ward_id": ward_id, "source": _src, "next_step": "createPin"}
