# backend/app/routers/trip_master_data_admin.py
# Trip-related master data management for the Super Admin Console

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.trip_master_data import (
    PaymentChannelMaster,
    CorrectionReasonMaster,
    TripEntryRuleConfig
)
from app.auth import require_super_admin

# ═══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS FOR VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════

class PaymentChannelCreate(BaseModel):
    """Pydantic model for creating a payment channel"""
    channel_id: int
    display_name: str
    sort_order: int = 0


class PaymentChannelUpdate(BaseModel):
    """Pydantic model for updating a payment channel"""
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


class CorrectionReasonCreate(BaseModel):
    """Pydantic model for creating a correction reason"""
    code: str
    display_name: str
    sort_order: int = 0


class CorrectionReasonUpdate(BaseModel):
    """Pydantic model for updating a correction reason"""
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


class TripEntryRuleConfigUpdate(BaseModel):
    """Pydantic model for updating trip entry rule configuration"""
    config_value: int


router = APIRouter(
    prefix="/admin/trip-master-data",
    tags=["super-admin"],
    dependencies=[Depends(require_super_admin)]
)


# ═══════════════════════════════════════════════════════════════════════════════
# PAYMENT CHANNEL ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/payment-channels")
def list_payment_channels(db: Session = Depends(get_db)):
    """Get all payment channels ordered by sort order"""
    return db.query(PaymentChannelMaster).order_by(PaymentChannelMaster.sort_order).all()


@router.post("/payment-channels")
def create_payment_channel(channel: PaymentChannelCreate, db: Session = Depends(get_db)):
    """Create a new payment channel master record"""
    # Check if channel ID already exists
    existing = db.query(PaymentChannelMaster).get(channel.channel_id)
    if existing:
        raise HTTPException(status_code=400, detail="Payment channel ID already exists")
    
    row = PaymentChannelMaster(
        channel_id=channel.channel_id,
        display_name=channel.display_name,
        sort_order=channel.sort_order
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/payment-channels/{channel_id}")
def get_payment_channel(channel_id: int, db: Session = Depends(get_db)):
    """Get a specific payment channel by ID"""
    channel = db.query(PaymentChannelMaster).get(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Payment channel not found")
    return channel


@router.put("/payment-channels/{channel_id}")
@router.patch("/payment-channels/{channel_id}")  # ISSUE #2 FIX: Added PATCH support
def update_payment_channel(
    channel_id: int,
    channel: PaymentChannelUpdate,
    db: Session = Depends(get_db)
):
    """Update a payment channel master record
    
    ISSUE #2 FIX: Added @router.patch decorator for PATCH method support
    BR-SB05-004: is_active is still always shown as a plain manual-entry option
    """
    row = db.query(PaymentChannelMaster).get(channel_id)
    if not row:
        raise HTTPException(status_code=404, detail="Payment channel not found")
    
    if channel.display_name is not None:
        row.display_name = channel.display_name
    if channel.is_active is not None:
        row.is_active = channel.is_active   # BR-SB05-004: still always shown as a plain manual-entry option
    
    db.commit()
    db.refresh(row)
    return row


@router.delete("/payment-channels/{channel_id}")
def delete_payment_channel(channel_id: int, db: Session = Depends(get_db)):
    """Delete a payment channel master record"""
    row = db.query(PaymentChannelMaster).get(channel_id)
    if not row:
        raise HTTPException(status_code=404, detail="Payment channel not found")
    
    db.delete(row)
    db.commit()
    return {"message": "Payment channel deleted successfully"}


# ═══════════════════════════════════════════════════════════════════════════════
# CORRECTION REASON ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/correction-reasons")
def list_correction_reasons(db: Session = Depends(get_db)):
    """Get all correction reasons ordered by sort order"""
    return db.query(CorrectionReasonMaster).order_by(CorrectionReasonMaster.sort_order).all()


@router.post("/correction-reasons")
def create_correction_reason(reason: CorrectionReasonCreate, db: Session = Depends(get_db)):
    """Create a new correction reason master record"""
    # Check if code already exists
    existing = db.query(CorrectionReasonMaster).filter(
        CorrectionReasonMaster.code == reason.code
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Correction reason code already exists")
    
    row = CorrectionReasonMaster(
        code=reason.code,
        display_name=reason.display_name,
        sort_order=reason.sort_order
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/correction-reasons/{reason_id}")
def get_correction_reason(reason_id: int, db: Session = Depends(get_db)):
    """Get a specific correction reason by ID"""
    reason = db.query(CorrectionReasonMaster).get(reason_id)
    if not reason:
        raise HTTPException(status_code=404, detail="Correction reason not found")
    return reason


@router.put("/correction-reasons/{reason_id}")
@router.patch("/correction-reasons/{reason_id}")  # ISSUE #2 FIX: Added PATCH support
def update_correction_reason(
    reason_id: int,
    reason: CorrectionReasonUpdate,
    db: Session = Depends(get_db)
):
    """Update a correction reason master record
    
    ISSUE #2 FIX: Added @router.patch decorator for PATCH method support
    """
    row = db.query(CorrectionReasonMaster).get(reason_id)
    if not row:
        raise HTTPException(status_code=404, detail="Correction reason not found")
    
    if reason.display_name is not None:
        row.display_name = reason.display_name
    if reason.is_active is not None:
        row.is_active = reason.is_active
    
    db.commit()
    db.refresh(row)
    return row


@router.delete("/correction-reasons/{reason_id}")
def delete_correction_reason(reason_id: int, db: Session = Depends(get_db)):
    """Delete a correction reason master record"""
    row = db.query(CorrectionReasonMaster).get(reason_id)
    if not row:
        raise HTTPException(status_code=404, detail="Correction reason not found")
    
    db.delete(row)
    db.commit()
    return {"message": "Correction reason deleted successfully"}

@router.patch("/rule-config")
def patch_rule_config(payload: dict, db: Session = Depends(get_db)):
    """Bulk update multiple rule config values"""
    for key, value in payload.items():
        row = db.query(TripEntryRuleConfig).filter_by(config_key=key).first()
        if row:
            row.config_value = value
    db.commit()
    return {"updated": list(payload.keys())}
# ═══════════════════════════════════════════════════════════════════════════════
# TRIP ENTRY RULE CONFIGURATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/rule-config")
def get_rule_config(db: Session = Depends(get_db)):
    """Get the current trip entry rule configuration"""
    rows = db.query(TripEntryRuleConfig).all()
    return {r.config_key: r.config_value for r in rows}


@router.get("/rule-config/{config_key}")
def get_rule_config_by_key(config_key: str, db: Session = Depends(get_db)):
    """Get a specific rule configuration by key"""
    row = db.query(TripEntryRuleConfig).filter_by(config_key=config_key).first()
    if not row:
        raise HTTPException(status_code=404, detail="Configuration key not found")
    return row


@router.put("/rule-config/{config_key}")
@router.patch("/rule-config/{config_key}")  # ISSUE #2 FIX: Added PATCH support
def update_rule_config(
    config_key: str,
    config: TripEntryRuleConfigUpdate,
    db: Session = Depends(get_db)
):
    """Update trip entry rule configuration
    
    ISSUE #2 FIX: Added @router.patch decorator for PATCH method support
    BR-SB07-001/007: This single write changes the window/SLA app-wide, no release needed
    """
    row = db.query(TripEntryRuleConfig).filter_by(config_key=config_key).first()
    if not row:
        raise HTTPException(status_code=404, detail="Configuration key not found")
    
    row.config_value = config.config_value  # BR-SB07-001/007: this single write changes the window/SLA app-wide, no release needed
    
    db.commit()
    db.refresh(row)
    return row
