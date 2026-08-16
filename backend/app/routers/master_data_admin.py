# backend/app/routers/master_data_admin.py
# Master data management endpoints for the Super Admin Console

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict, Any

from app.database import get_db
from app.models.master_data import LanguageMaster, FuelTypeMaster, UiStringMaster, ValuePreviewConfig
from app.auth import require_super_admin

# ═══════════════════════════════════════════════════════════════════════════════
# Pydantic models for query parameter validation
# ═══════════════════════════════════════════════════════════════════════════════

class LanguageCreate(BaseModel):
    """Pydantic model for creating a language"""
    code: str
    display_name: str
    sort_order: int = 0


class LanguageUpdate(BaseModel):
    """Pydantic model for updating a language"""
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


class FuelTypeCreate(BaseModel):
    """Pydantic model for creating a fuel type"""
    code: str
    display_name: str
    sort_order: int = 0


class FuelTypeUpdate(BaseModel):
    """Pydantic model for updating a fuel type
    
    Issue 6 fix: Prevents modification of default fuel types (Petrol, Electric)
    """
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


class UIStringCreate(BaseModel):
    """Pydantic model for creating a UI string"""
    string_key: str
    language_code: str
    translated_text: str
    needs_review: bool = True


class UIStringUpdate(BaseModel):
    """Pydantic model for updating a UI string"""
    translated_text: str
    needs_review: Optional[bool] = None


class ValuePreviewConfigUpdate(BaseModel):
    """Pydantic model for updating value preview config"""
    sample_weekly_earnings_ksh: Optional[float] = None
    sample_weekly_costs_ksh: Optional[float] = None
    sample_cost_breakdown: Optional[Dict[str, Any]] = None


router = APIRouter(
    prefix="/admin/master-data",
    tags=["super-admin"],
    dependencies=[Depends(require_super_admin)]
)


# ═══════════════════════════════════════════════════════════════════════════════
# FUEL TYPE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/fuel-types")
def list_fuel_types(db: Session = Depends(get_db)):
    """Get all fuel types ordered by sort order"""
    return db.query(FuelTypeMaster).order_by(FuelTypeMaster.sort_order).all()


@router.post("/fuel-types")
def create_fuel_type(fuel_type: FuelTypeCreate, db: Session = Depends(get_db)):
    """Create a new fuel type master record
    
    Issue 6 fix: New fuel types are always created as custom (is_default=False)
    Only Petrol and Electric can be default
    """
    # Check if fuel type code already exists
    existing = db.query(FuelTypeMaster).filter(FuelTypeMaster.code == fuel_type.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Fuel type code already exists")
    
    row = FuelTypeMaster(
        code=fuel_type.code,
        display_name=fuel_type.display_name,
        sort_order=fuel_type.sort_order,
        is_default=False  # New fuel types are never default
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/fuel-types/{fuel_type_id}")
def get_fuel_type(fuel_type_id: int, db: Session = Depends(get_db)):
    """Get a specific fuel type by ID"""
    fuel_type = db.query(FuelTypeMaster).get(fuel_type_id)
    if not fuel_type:
        raise HTTPException(status_code=404, detail="Fuel type not found")
    return fuel_type


@router.put("/fuel-types/{fuel_type_id}")
@router.patch("/fuel-types/{fuel_type_id}")
def update_fuel_type(fuel_type_id: int, fuel_type: FuelTypeUpdate, db: Session = Depends(get_db)):
    """Update a fuel type master record
    
    Issue 6 fix: Prevents modification of default fuel types (Petrol, Electric)
    Default fuel types can only have their is_active flag toggled, and only to True
    """
    row = db.query(FuelTypeMaster).get(fuel_type_id)
    if not row:
        raise HTTPException(status_code=404, detail="Fuel type not found")
    
    # Issue 6: Prevent editing display_name of default fuel types
    if row.is_default and fuel_type.display_name is not None:
        raise HTTPException(
            status_code=403, 
            detail="Default fuel types (Petrol, Electric) cannot be edited. Only custom fuel types can be modified."
        )
    
    # Issue 6: Prevent deactivating default fuel types
    if row.is_default and fuel_type.is_active is False:
        raise HTTPException(
            status_code=403, 
            detail="Default fuel types (Petrol, Electric) cannot be deactivated."
        )
    
    if fuel_type.display_name is not None:
        row.display_name = fuel_type.display_name
    if fuel_type.is_active is not None:
        row.is_active = fuel_type.is_active
    
    db.commit()
    db.refresh(row)
    return row


@router.delete("/fuel-types/{fuel_type_id}")
def delete_fuel_type(fuel_type_id: int, db: Session = Depends(get_db)):
    """Delete a fuel type master record
    
    Issue 6 fix: Prevents deletion of default fuel types (Petrol, Electric)
    """
    row = db.query(FuelTypeMaster).get(fuel_type_id)
    if not row:
        raise HTTPException(status_code=404, detail="Fuel type not found")
    
    # Issue 6: Prevent deletion of default fuel types
    if row.is_default:
        raise HTTPException(
            status_code=403, 
            detail="Default fuel types (Petrol, Electric) cannot be deleted."
        )
    
    db.delete(row)
    db.commit()
    return {"message": "Fuel type deleted successfully"}