# backend/app/services/business_service.py
# SMART BIZNA: look-ups used by Setup My Profile and the Administrator's registration API. Same mobile key as everywhere
# else in Smart Boda (the last 9 digits, group_roles.phone_key), so 0712..., 254712... and +254712... are the same person.
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.business import Business, BusinessUser, AWAITING, REGISTERED, ACTIVATED, INACTIVE, OWNER
from app.services.group_roles import phone_key


def find_business_user(db: Session, phone):
    """(BusinessUser, Business) for this number whatever its status, or None. Indexed on the unique phone_key."""
    k = phone_key(phone)
    if len(k) != 9:
        return None
    return (db.query(BusinessUser, Business).join(Business, Business.id == BusinessUser.business_id)
            .filter(BusinessUser.phone_key == k).first())


def business_memberships(db: Session, phone):
    """MULTIPLE BUSINESSES: every (BusinessUser, Business) for this number, oldest first. One row for staff and single-business Owners."""
    k = phone_key(phone)
    if len(k) != 9:
        return []
    return (db.query(BusinessUser, Business).join(Business, Business.id == BusinessUser.business_id)
            .filter(BusinessUser.phone_key == k).order_by(BusinessUser.created_at, BusinessUser.id).all())


def existing_owner(db: Session, phone):
    """None unless this number is ALREADY a Business Owner and nothing else in Smart Bizna (never staff). Returns what the Administrator needs to add
    another business for the same Owner: their name, their account (rider_id, when they have set up) and the businesses they already own."""
    rows = business_memberships(db, phone)
    if not rows or any(bu.role != OWNER for bu, _ in rows):
        return None
    done = next((bu for bu, _ in rows if bu.status == REGISTERED and bu.rider_id), None)
    return {"full_name": rows[0][0].full_name, "mobile_number": rows[0][0].mobile_number, "rider_id": done.rider_id if done else None,
            "registered": bool(done), "businesses": [{"id": str(b.id), "business_name": b.business_name} for _, b in rows]}


def business_registration(db: Session, mobile):
    """The record Setup My Profile may use: a business user who has not finished setting up (awaiting, or registered but
    still choosing a PIN) in a business that is not switched off. Returns (BusinessUser, Business) or None."""
    for bu, b in business_memberships(db, mobile):       # an Owner of several businesses: the first one that can still be set up
        if bu.status in (AWAITING, REGISTERED) and b.status != INACTIVE:
            return bu, b
    return None


def mark_business_registered(db: Session, bu: BusinessUser, b: Business, rider):
    """Rides the caller's transaction (no commit): the person is now registered and the business is activated. The Business Type
    was chosen by the Administrator at pre-registration; nobody on the user side chooses it."""
    bu.status, bu.rider_id = REGISTERED, rider.id
    bu.registered_at = bu.registered_at or datetime.now(timezone.utc)
    b.status = ACTIVATED
    # MULTIPLE BUSINESSES: one set-up completes EVERY business this Owner was registered for (same phone number, same account)
    for other, ob in business_memberships(db, bu.phone_key):
        if other.id != bu.id and other.status in (AWAITING, REGISTERED) and ob.status != INACTIVE:
            other.status, other.rider_id = REGISTERED, rider.id
            other.registered_at = other.registered_at or datetime.now(timezone.utc)
            ob.status = ACTIVATED
