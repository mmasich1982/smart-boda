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
# or that the administrator registered as a BUSINESS user (Smart Bizna: the Business Owner or a Sales/Service Person).
# Everyone else is told to ask their Admin or Group Treasurer, so the app cannot be joined by guessing a number.
# A rider chooses a FUEL TYPE; a business user chooses a BUSINESS TYPE. The server never accepts the wrong one.
import logging
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.bike_profile import BikeProfile
from app.models.business import BusinessTypeMaster
from app.models.boda_group import BodaGroup, GroupMember
from app.models.master_data import FuelTypeMaster, LanguageMaster
from app.models.rider import Rider
from app.routers.mobile_number import validate_mobile_number
from app.schemas.onboarding import SetupProfileRequest
from app.services.business_service import business_registration, mark_business_registered
from app.services.group_member_link_service import find_rider_id_by_mobile, link_members_for_rider
from app.services.group_roles import phone_key, same_phone
from app.services.individual_rider_service import find_preregistration, mark_registered
from app.services import admin_app_service            # ADMIN APP: an Administrator may also set up in the app
from app.services import group_kinds as GK, vehicle_words      # SMART CABZ: vehicle type and the words that follow it

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/onboarding", tags=["Setup My Profile"])

NOT_FOUND = ("We could not find this mobile number. Ask your Admin or your Group Treasurer to register you, then try again.")


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


def vehicle_for(db: Session, mobile: str, source) -> str:
    """SMART CABZ: the vehicle type a person starts with. An individual rider: the Administrator's choice. A group member: what the Treasurer
    recorded (driver -> car). A group's Treasurer: the Treasurer kind the Administrator chose. Everyone else: motorcycle (as always)."""
    k = phone_key(mobile)
    if source == "individual":
        pre = find_preregistration(db, mobile)
        return pre.vehicle_type if pre else "motorcycle"
    if source == "member":
        m = (db.query(GroupMember).filter(GroupMember.phone_key == k, GroupMember.status == "active").order_by(GroupMember.created_at).first())
        return GK.vehicle_of(m.member_kind) if m else "motorcycle"
    if source == "treasurer":
        for g in db.query(BodaGroup).filter(BodaGroup.status == "active").order_by(BodaGroup.created_at).all():
            if same_phone(g.treasurer_phone, mobile):
                return GK.vehicle_of(g.treasurer_kind)
    return "motorcycle"


def _clean(mobile):
    ok, normalized, err = validate_mobile_number(mobile)
    if not ok:
        raise HTTPException(400, err or "Enter a valid Kenyan mobile number.")
    return normalized


def _business_type_name(db: Session, code):
    """The display name of the Business Type the Smart Bizna Administrator chose (shown to the business user read-only, like their name)."""
    if not code:
        return None
    bt = db.query(BusinessTypeMaster).filter_by(code=code).first()           # any type, active or not: it was chosen at pre-registration
    return bt.display_name if bt else None


@router.get("/profile-lookup/{mobile_number}")
def profile_lookup(mobile_number: str, db: Session = Depends(get_db)):
    """Shows the rider their own name once they type their number. 404 = no Treasurer has registered this number.
    409 = this number already has a finished account (the rider should log in)."""
    normalized = _clean(mobile_number)
    adm = admin_app_service.lookup(db, normalized)           # ADMIN APP: checked first; an Administrator with app access gets the same name look-up as a rider
    if adm["state"] == "already_set_up":
        raise HTTPException(409, "This mobile number is already set up. Please log in with your PIN.")
    if adm["state"] == "found":
        return admin_app_service.lookup_payload(adm["admin"], normalized)
    rid = find_rider_id_by_mobile(db, normalized)
    if rid:
        r = db.get(Rider, rid)
        if r and r.registration_status == "active":
            raise HTTPException(409, "This mobile number is already set up. Please log in with your PIN.")
    biz = business_registration(db, normalized)                 # SMART CABZ: a business user stays a business user even when a Treasurer has added them to a group
    reg = None if biz else find_registration(db, normalized)
    if reg:
        return {"found": True, "full_name": reg[0], "mobile_number": normalized, "source": reg[4], "user_type": "rider",
                "vehicle_type": vehicle_for(db, normalized, reg[4]),
                "role": None, "business_name": None, "business_type_code": None, "business_type_name": None}
    if not biz:
        raise HTTPException(404, NOT_FOUND)
    bu, b = biz
    return {"found": True, "full_name": bu.full_name, "mobile_number": normalized, "source": "business", "user_type": "business",
            "role": bu.role, "business_name": b.business_name, "business_type_code": b.business_type_code,
            "business_type_name": _business_type_name(db, b.business_type_code)}


@router.post("/setup-profile")
def setup_profile(payload: SetupProfileRequest, db: Session = Depends(get_db)):
    """Creates the rider account (or resumes a pending one) with the name and location from the Treasurer's record, saves the
    fuel type and the terms consent, and links the rider to the groups that registered this number. The rider_id returned
    here is what the app stores locally (getLocalRiderId) and what Home loads with."""
    normalized = _clean(payload.mobile_number)
    if not payload.consent_accepted:
        raise HTTPException(422, "You must accept the Terms and Privacy Notice to continue.", headers={"X-Error-Code": "CONSENT_REQUIRED"})
    biz = business_registration(db, normalized)                 # SMART CABZ: business first (see profile_lookup)
    reg = None if biz else find_registration(db, normalized)
    vehicle = vehicle_for(db, normalized, reg[4]) if reg else "motorcycle"
    if not biz and payload.business_type_code is None and not db.query(FuelTypeMaster).filter_by(code=payload.fuel_type_code, is_active=True).first():
        raise HTTPException(422, vehicle_words.convert("Please choose the fuel type of your motorcycle.", "driver" if vehicle == "car" else "rider"))      # a rider's request: checked first, as always
    if not reg and not biz:
        raise HTTPException(404, NOT_FOUND)
    if biz:                                                     # Smart Bizna user: nothing to choose, they only finish the registration
        if payload.fuel_type_code:
            raise HTTPException(422, "A business user does not choose a fuel type.")
        if payload.business_type_code:                          # the Business Type was chosen by the Administrator at pre-registration:
            raise HTTPException(422, "The business type is set by the Administrator.")      # no business user is shown it or sends it
        # the person's location is the business location the Administrator set (County, Sub-county, Ward)
        name, county_id, sub_county_id, ward_id, _src = biz[0].full_name, biz[1].county_id, biz[1].sub_county_id, biz[1].ward_id, "business"
    else:
        if payload.business_type_code:
            raise HTTPException(422, "A rider does not choose a business type.")
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
        if not biz:
            rider.vehicle_type = vehicle                       # SMART CABZ
        rider.county_id, rider.sub_county_id, rider.ward_id = county_id, sub_county_id, ward_id
        rider.consent_accepted_at, rider.consent_content_version = now, payload.consent_content_version
        rider.registration_status, rider.onboarding_step, rider.updated_at = "verified_incomplete", "createPin", now
        if lang: rider.language_code = lang
        db.flush()
        if biz:
            mark_business_registered(db, biz[0], biz[1], rider)   # no bike
            link_members_for_rider(db, rider)                     # SMART CABZ: a business user a Treasurer added to a group is linked to it now
        else:
            bp = db.query(BikeProfile).filter_by(rider_id=rider.id, is_active=True).first()
            if bp: bp.fuel_type_code = payload.fuel_type_code
            else: db.add(BikeProfile(rider_id=rider.id, fuel_type_code=payload.fuel_type_code, submitted_at=now,
                                     sync_status="synced", is_active=True))
            link_members_for_rider(db, rider)
            mark_registered(db, rider)                        # an individual rider's waiting record becomes "registered"
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
            "mobile_number": rider.mobile_number, "fuel_type_code": None if biz else payload.fuel_type_code, "vehicle_type": rider.vehicle_type,
            "county_id": county_id, "sub_county_id": sub_county_id, "ward_id": ward_id, "source": _src, "next_step": "createPin",
            "user_type": "business" if biz else "rider", "role": biz[0].role if biz else None,
            "business_id": str(biz[1].id) if biz else None, "business_name": biz[1].business_name if biz else None,
            "business_user_id": str(biz[0].id) if biz else None,    # lets a brand-new phone record offline before the first /business/me
            "business_type_code": biz[1].business_type_code if biz else None,
            "business_type_name": _business_type_name(db, biz[1].business_type_code) if biz else None}
