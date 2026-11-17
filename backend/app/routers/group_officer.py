# backend/app/routers/group_officer.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_rider
from app.models.rider import Rider
from app.models.boda_group import AppNotification
from app.models.chama_finance import ChamaConfig
from app.services.group_roles import actor_group

router = APIRouter(prefix="/chama/officer", tags=["chama-officer"])
PENDING = ("contribution_pending", "loan_request_pending", "loan_payment_pending", "psv_pending",
           "sp_verify_pending", "sp_disburse_pending", "sp_payment_pending", "swap_needs_approval")

@router.get("/overview")
def overview(db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    g, role = actor_group(db, rider)
    if role != "officer": raise HTTPException(403, "Only the Chairperson or Secretary General can use this.")
    cfg = db.get(ChamaConfig, g.id)
    n = db.query(func.count(AppNotification.id)).filter(AppNotification.recipient_type == "rider",
        AppNotification.recipient_id == rider.id, AppNotification.status == "active",
        AppNotification.kind.in_(PENDING)).scalar()
    return {"group": g.group_name, "treasurer": g.treasurer_name, "group_type": cfg.chama_type if cfg else None, "pending": n}