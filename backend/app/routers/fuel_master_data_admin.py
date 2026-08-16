# backend/app/routers/fuel_master_data_admin.py
# Fuel-related master data management for the Super Admin Console

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.fuel_master_data import (
    SwapPartnerMaster,
    ServiceTypeMaster,
    OilTypeMaster,
    FuelMaintenanceRuleConfig
)
from app.auth import require_super_admin

# ═══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS FOR VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════

class SwapPartnerCreate(BaseModel):
    """Pydantic model for creating a swap partner"""
    partner_id: str
    display_name: str
    standard_fee: float
    sort_order: int = 0


class SwapPartnerUpdate(BaseModel):
    """Pydantic model for updating a swap partner"""
    display_name: Optional[str] = None
    standard_fee: Optional[float] = None
    is_active: Optional[bool] = None


class ServiceTypeUpdate(BaseModel):
    """Pydantic model for updating a service type"""
    default_interval_km: Optional[int] = None


class OilTypeUpdate(BaseModel):
    """Pydantic model for updating an oil type"""
    interval_km: Optional[int] = None


class FuelMaintenanceRuleConfigUpdate(BaseModel):
    """Pydantic model for updating fuel maintenance rule configuration"""
    default_battery_range_km: Optional[int] = None
    due_alert_tier_first_km: Optional[int] = None
    due_alert_tier_firm_km: Optional[int] = None
    due_alert_tier_final_km: Optional[int] = None


router = APIRouter(
    prefix="/admin/fuel-master-data",
    tags=["super-admin"],
    dependencies=[Depends(require_super_admin)]
)


# ═══════════════════════════════════════════════════════════════════════════════
# SWAP PARTNER ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/swap-partners")
def list_swap_partners(db: Session = Depends(get_db)):
    """Get all swap partners ordered by sort order"""
    return db.query(SwapPartnerMaster).order_by(SwapPartnerMaster.sort_order).all()


@router.post("/swap-partners")
def create_swap_partner(partner: SwapPartnerCreate, db: Session = Depends(get_db)):
    """Create a new swap partner master record"""
    # Check if partner ID already exists
    existing = db.query(SwapPartnerMaster).filter(
        SwapPartnerMaster.partner_id == partner.partner_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Partner ID already exists")
    
    row = SwapPartnerMaster(
        partner_id=partner.partner_id,
        display_name=partner.display_name,
        standard_fee=partner.standard_fee,
        sort_order=partner.sort_order
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/swap-partners/{partner_id}")
def get_swap_partner(partner_id: str, db: Session = Depends(get_db)):
    """Get a specific swap partner by ID"""
    partner = db.query(SwapPartnerMaster).get(partner_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Swap partner not found")
    return partner


@router.put("/swap-partners/{partner_id}")
@router.patch("/swap-partners/{partner_id}")  # ISSUE #2 FIX: Added PATCH support
def update_swap_partner(
    partner_id: str,
    partner: SwapPartnerUpdate,
    db: Session = Depends(get_db)
):
    """Update a swap partner master record
    
    ISSUE #2 FIX: Added @router.patch decorator for PATCH method support
    BR-SB10-002: standard_fee pre-fills SB-10-A, always still editable by the rider
    """
    row = db.query(SwapPartnerMaster).get(partner_id)
    if not row:
        raise HTTPException(status_code=404, detail="Swap partner not found")
    
    if partner.display_name is not None:
        row.display_name = partner.display_name
    if partner.standard_fee is not None:
        row.standard_fee = partner.standard_fee  # BR-SB10-002: pre-fills SB-10-A, always still editable by the rider
    if partner.is_active is not None:
        row.is_active = partner.is_active
    
    db.commit()
    db.refresh(row)
    return row


@router.delete("/swap-partners/{partner_id}")
def delete_swap_partner(partner_id: str, db: Session = Depends(get_db)):
    """Delete a swap partner master record"""
    row = db.query(SwapPartnerMaster).get(partner_id)
    if not row:
        raise HTTPException(status_code=404, detail="Swap partner not found")
    
    db.delete(row)
    db.commit()
    return {"message": "Swap partner deleted successfully"}


# ═══════════════════════════════════════════════════════════════════════════════
# SERVICE TYPE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/service-types")
def list_service_types(db: Session = Depends(get_db)):
    """Get all service types ordered by sort order"""
    return db.query(ServiceTypeMaster).order_by(ServiceTypeMaster.sort_order).all()


@router.get("/service-types/{code}")
def get_service_type(code: str, db: Session = Depends(get_db)):
    """Get a specific service type by code"""
    service_type = db.query(ServiceTypeMaster).get(code)
    if not service_type:
        raise HTTPException(status_code=404, detail="Service type not found")
    return service_type


@router.put("/service-types/{code}")
@router.patch("/service-types/{code}")  # ISSUE #2 FIX: Added PATCH support
def update_service_type(
    code: str,
    service_type: ServiceTypeUpdate,
    db: Session = Depends(get_db)
):
    """Update a service type master record
    
    ISSUE #2 FIX: Added @router.patch decorator for PATCH method support
    BR-SB12-007: Only updates default_interval_km for non-dated types
    """
    row = db.query(ServiceTypeMaster).get(code)
    if not row:
        raise HTTPException(status_code=404, detail="Service type not found")
    
    if service_type.default_interval_km is not None and not row.is_dated:
        row.default_interval_km = service_type.default_interval_km  # BR-SB12-007, non-dated types only
    
    db.commit()
    db.refresh(row)
    return row


# ═══════════════════════════════════════════════════════════════════════════════
# OIL TYPE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/oil-types")
def list_oil_types(db: Session = Depends(get_db)):
    """Get all oil types ordered by sort order"""
    return db.query(OilTypeMaster).order_by(OilTypeMaster.sort_order).all()


@router.get("/oil-types/{code}")
def get_oil_type(code: str, db: Session = Depends(get_db)):
    """Get a specific oil type by code"""
    oil_type = db.query(OilTypeMaster).get(code)
    if not oil_type:
        raise HTTPException(status_code=404, detail="Oil type not found")
    return oil_type


@router.put("/oil-types/{code}")
@router.patch("/oil-types/{code}")  # ISSUE #2 FIX: Added PATCH support
def update_oil_type(
    code: str,
    oil_type: OilTypeUpdate,
    db: Session = Depends(get_db)
):
    """Update an oil type master record
    
    ISSUE #2 FIX: Added @router.patch decorator for PATCH method support
    BR-SB12-004: Changes every future projection, not past entries
    """
    row = db.query(OilTypeMaster).get(code)
    if not row:
        raise HTTPException(status_code=404, detail="Oil type not found")
    
    if oil_type.interval_km is not None:
        row.interval_km = oil_type.interval_km  # BR-SB12-004: changes every future projection, not past entries
    
    db.commit()
    db.refresh(row)
    return row


# ═══════════════════════════════════════════════════════════════════════════════
# FUEL MAINTENANCE RULE CONFIGURATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/rule-config")
def get_rule_config(db: Session = Depends(get_db)):
    """Get the current fuel maintenance rule configuration"""
    config = db.query(FuelMaintenanceRuleConfig).get(1)
    if not config:
        raise HTTPException(status_code=404, detail="Fuel maintenance rule configuration not found")
    return config


@router.put("/rule-config")
@router.patch("/rule-config")  # ISSUE #2 FIX: Added PATCH support
def update_rule_config(
    config: FuelMaintenanceRuleConfigUpdate,
    db: Session = Depends(get_db)
):
    """Update fuel maintenance rule configuration
    
    ISSUE #2 FIX: Added @router.patch decorator for PATCH method support
    BR-SB12-008: One write, app-wide effect, no release needed
    """
    row = db.query(FuelMaintenanceRuleConfig).get(1)
    if not row:
        raise HTTPException(status_code=404, detail="Fuel maintenance rule configuration not found")
    
    if config.default_battery_range_km is not None:
        row.default_battery_range_km = config.default_battery_range_km
    if config.due_alert_tier_first_km is not None:
        row.due_alert_tier_first_km = config.due_alert_tier_first_km
    if config.due_alert_tier_firm_km is not None:
        row.due_alert_tier_firm_km = config.due_alert_tier_firm_km
    if config.due_alert_tier_final_km is not None:
        row.due_alert_tier_final_km = config.due_alert_tier_final_km
    
    db.commit()
    db.refresh(row)
    return row
