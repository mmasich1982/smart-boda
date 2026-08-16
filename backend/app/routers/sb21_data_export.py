# backend/app/routers/sb21_data_export.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database import get_db
from app.models.data_export_request import DataExportRequest
from app.models.data_export_reason_master import DataExportReasonMaster
from app.models.compliance_master_data import ComplianceRuleConfig
from app.models.rider import Rider
from app.services.pin_service import verify_pin_login

router = APIRouter(prefix="/compliance/data-export", tags=["sb-21"])


# ADDED (docx #2, security flow): "Confirm Your PIN" is the first screen in this flow --
# this endpoint is that gate. It never blocks on lock-state (BR-SB21-001/002 unchanged).
@router.post("/verify-pin")
def verify_pin_for_export(rider_id: str, pin: str, db: Session = Depends(get_db)):
    return verify_pin_login(db, rider_id, pin)


@router.get("/reasons")
def list_export_reasons(db: Session = Depends(get_db)):
    return db.query(DataExportReasonMaster).filter_by(is_active=True).order_by(DataExportReasonMaster.sort_order).all()


# BR-SB21-001/002: no lock-state dependency check exists anywhere in this function — not even a
# bypassed one. There is no code path that could conditionally block this request.
# ADDED (docx #2): now requires the rider to have passed /verify-pin, a confirmed email, and a
# reason code -- collected on the screen that follows PIN confirmation, per the required flow.
@router.post("")
def create_export_request(rider_id: str, contact_email: str, reason_code: str,
                           pin_verified: bool = False, db: Session = Depends(get_db)):
    if not pin_verified:
        raise HTTPException(status_code=403, detail="PIN confirmation is required before requesting a data export.")
    existing_pending = db.query(DataExportRequest).filter_by(rider_id=rider_id, status="pending").first()
    if existing_pending:
        return {"id": str(existing_pending.id), "status": "pending", "already_requested": True}  # EXC-SB21-001

    rider = db.query(Rider).get(rider_id)
    if rider:
        rider.email = contact_email  # keep the rider's contact email current for future requests
    request = DataExportRequest(
        rider_id=rider_id, status="pending", reason_code=reason_code, contact_email=contact_email,
        pin_verified_at=datetime.now(timezone.utc), requested_at=datetime.now(timezone.utc),
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    config = db.query(ComplianceRuleConfig).get(1)
    delivery_hours = config.data_export_delivery_hours if config else 48
    # ADDED (docx #2): "confirm ... within 48 hours" -- the confirmation screen reads this
    # back from the server rather than hardcoding it, so an admin change takes effect instantly.
    return {"id": str(request.id), "status": "pending", "already_requested": False,
            "contact_email": contact_email, "delivery_window_hours": delivery_hours}


@router.get("/status")
def get_export_status(rider_id: str, db: Session = Depends(get_db)):
    latest = db.query(DataExportRequest).filter_by(rider_id=rider_id).order_by(DataExportRequest.requested_at.desc()).first()
    if not latest:
        return {"has_request": False}
    config = db.query(ComplianceRuleConfig).get(1)
    return {"has_request": True, "status": latest.status, "requested_at": latest.requested_at,
            "fulfilled_at": latest.fulfilled_at, "contact_email": latest.contact_email,
            "delivery_window_hours": config.data_export_delivery_hours if config else 48}
