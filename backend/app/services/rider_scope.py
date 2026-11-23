# backend/app/services/rider_scope.py
# WHO COUNTS AS A RIDER. Every rider statistic (Admin Home hero card, dashboards, the Active Riders screen, engagement reports) counts ONLY actual transport operators:
#   motorcycle riders (Smart Boda) and vehicle / car drivers (Smart Cabz).
# A person whose vehicle type is "n/a" is a BUSINESS account (Smart Bizna) and is never a rider. For the same reason a Smart Chama-only member (no vehicle) and anyone
# linked as a business user (an older row may still hold "motorcycle") are not counted as riders either. Business accounts are counted separately, as business accounts.
from sqlalchemy import and_, func, not_, or_

from app.models.rider import Rider

OPERATOR_TYPES = ("motorcycle", "car")


def _business_rider_ids(db):
    from app.models.business import BusinessUser
    return db.query(BusinessUser.rider_id).filter(BusinessUser.rider_id.isnot(None))


def vehicle_expr():
    """The rider's vehicle type, trimmed and lower-cased ('N/A', 'n/a' and ' n/a ' are all the same)."""
    return func.lower(func.trim(func.coalesce(Rider.vehicle_type, "")))


def is_rider_expr(db):
    """SQL condition: this Rider row is an actual rider or driver."""
    return and_(vehicle_expr().in_(OPERATOR_TYPES), func.coalesce(Rider.chama_only, False).is_(False), not_(Rider.id.in_(_business_rider_ids(db))))


def is_business_account_expr(db):
    """SQL condition: this Rider row is a business account (vehicle type n/a, or linked as a business user)."""
    return or_(and_(vehicle_expr() == "n/a", func.coalesce(Rider.chama_only, False).is_(False)), Rider.id.in_(_business_rider_ids(db)))


def riders_query(db, *cols):
    """db.query(...) over actual riders only. With no columns, the Rider rows themselves."""
    return db.query(*(cols or (Rider,))).filter(is_rider_expr(db))
