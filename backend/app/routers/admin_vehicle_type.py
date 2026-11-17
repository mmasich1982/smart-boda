# backend/app/routers/admin_vehicle_type.py
# SMART CABZ: a Super Admin changes a registered person's vehicle type (motorcycle -> Smart Boda, car -> Smart Cabz). Always logged with a reason.
#   PATCH /admin/riders/{rider_id}/vehicle-type     {"vehicle_type": "car", "reason": "..."}
# Refused for a business user (no vehicle), and when the new kind would not be allowed in a group the person is in (a Riders group has only
# motorcycle riders, a Drivers group only car drivers): the Administrator must move them out of that group (or use a Mixed one) first.
# The phone learns the new type the next time it is online (it comes back with the session renewal and the login).
from typing import Literal
from uuid import UUID as RowId

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import require_super_admin
from app.database import get_db
from app.models.admin_user import AdminUser
from app.models.boda_group import BodaGroup, GroupMember
from app.models.business import BusinessUser
from app.models.individual_rider import IndividualRiderPreRegistration as Pre
from app.models.rider import Rider
from app.models.vehicle_type_log import VehicleTypeChangeLog
from app.services import audience_service, group_kinds as GK

router = APIRouter(prefix="/admin/riders", tags=["admin-vehicle-type"])


class ChangeIn(BaseModel):
    vehicle_type: Literal["motorcycle", "car"]
    reason: str = Field(min_length=5, max_length=200)


def groups_that_refuse(db: Session, rider: Rider, new_kind: str):
    """The groups (as Treasurer or as an active linked member) that would not allow this kind of person."""
    gs = {g.id: g for g in db.query(BodaGroup).filter(BodaGroup.treasurer_rider_id == rider.id).all()}
    for g in (db.query(BodaGroup).join(GroupMember, GroupMember.group_id == BodaGroup.id)
              .filter(GroupMember.linked_rider_id == rider.id, GroupMember.status == "active").all()):
        gs[g.id] = g
    return [g for g in gs.values() if not GK.allowed(g.members_type, new_kind)]


@router.patch("/{rider_id}/vehicle-type")
def change_vehicle_type(rider_id: RowId, body: ChangeIn, db: Session = Depends(get_db), admin: AdminUser = Depends(require_super_admin)):
    rider = db.query(Rider).filter(Rider.id == rider_id).with_for_update().first()
    if not rider:
        raise HTTPException(404, "Rider not found.")
    if db.query(BusinessUser.id).filter(BusinessUser.rider_id == rider.id).first():
        raise HTTPException(409, "A Smart Bizna business user has no vehicle type.")
    if rider.vehicle_type == body.vehicle_type:
        raise HTTPException(409, f"This person is already recorded as a {'car driver' if body.vehicle_type == 'car' else 'motorcycle rider'}.")
    new_kind = GK.kind_of(body.vehicle_type)
    bad = groups_that_refuse(db, rider, new_kind)
    if bad:
        names = ", ".join(g.group_name for g in bad)
        raise HTTPException(409, f"This person is in {names}, which does not allow {GK.KIND_WORDS[new_kind]}. Move them out of the group (or use a Mixed group) first.")
    db.add(VehicleTypeChangeLog(rider_id=rider.id, changed_by=admin.id, from_type=rider.vehicle_type, to_type=body.vehicle_type, reason=body.reason.strip()))
    rider.vehicle_type = body.vehicle_type
    for p in db.query(Pre).filter(Pre.registered_rider_id == rider.id).all():
        p.vehicle_type = body.vehicle_type
    for m in db.query(GroupMember).filter(GroupMember.linked_rider_id == rider.id).all():
        m.member_kind = new_kind
    db.commit()
    audience_service.forget(rider.id)                     # the new words apply to this person's messages at once
    return {"ok": True, "rider_id": str(rider.id), "vehicle_type": rider.vehicle_type}
