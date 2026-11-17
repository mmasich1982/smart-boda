# backend/app/services/notification_words.py
# SMART CABZ: every in-app notification is written in the words of the person it is FOR (Smart Boda / Smart Cabz / Smart Bizna; bike / car; rider / driver).
# One hook on AppNotification covers every place that creates one (the notify() helper and the direct creations in the group routes).
from sqlalchemy import event, select

from app.models.boda_group import AppNotification
from app.models.business import BusinessUser
from app.models.rider import Rider
from app.services.vehicle_words import audience_for, convert, RIDER


def _audience(connection, rider_id) -> str:
    try:
        row = connection.execute(select(Rider.vehicle_type).where(Rider.id == rider_id)).first()
        is_biz = connection.execute(select(BusinessUser.id).where(BusinessUser.rider_id == rider_id)).first() is not None
        return audience_for(row[0] if row else None, is_biz)
    except Exception:                      # a lookup problem never stops a notification: the text stays as written
        return RIDER


@event.listens_for(AppNotification, "before_insert")
def _words_for_recipient(mapper, connection, target):
    if target.recipient_type != "rider" or not target.recipient_id:
        return
    a = _audience(connection, target.recipient_id)
    if a != RIDER:
        target.title = convert(target.title, a)
        target.body = convert(target.body, a)
