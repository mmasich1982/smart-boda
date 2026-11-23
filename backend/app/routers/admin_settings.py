# backend/app/routers/admin_settings.py
# ADMIN SETTINGS the Administrator can change without an app update.
#   GET /admin/settings/statement-fees     the fee bands for statements older than the 3 months kept on the phone
#   PUT /admin/settings/statement-fees     replace them: [{"from": 4, "to": 6, "fee": 250}, ...] (months back, inside 4..12, not overlapping)
from typing import List
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.auth import require_admin
from app.database import get_db
from app.models.business_daily import AppSetting
from app.services import business_daily_service as svc

router = APIRouter(prefix="/admin/settings", tags=["admin-settings"], dependencies=[Depends(require_admin)])


class Tier(BaseModel):
    from_: int
    to: int
    fee: float

    model_config = {"populate_by_name": True}


@router.get("/statement-fees")
def get_fees(db: Session = Depends(get_db)):
    return {"tiers": svc.get_fee_tiers(db), "defaults": svc.DEFAULT_FEES}


@router.put("/statement-fees")
def put_fees(body: dict, db: Session = Depends(get_db)):
    tiers = svc.validate_tiers(body.get("tiers"))
    row = db.query(AppSetting).filter_by(key=svc.FEES_KEY).first()
    if row:
        row.value = tiers
    else:
        db.add(AppSetting(key=svc.FEES_KEY, value=tiers))
    db.commit()
    return {"tiers": tiers}
