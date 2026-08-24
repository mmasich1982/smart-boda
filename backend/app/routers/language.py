# backend/app/routers/language.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.master_data import LanguageMaster, UiStringMaster, ValuePreviewConfig, FuelTypeMaster

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

@router.get("/languages")
def get_languages(db: Session = Depends(get_db)):
    """
    Get all active languages for language selection screen.
    FIXED: Use correct column names from LanguageMaster model
    """
    rows = db.query(LanguageMaster).filter_by(is_active=True).order_by(LanguageMaster.sort_order).all()
    return [
        {
            "code": r.code,
            "display_name": r.display_name,  # Use actual column name, not native_name/english_name
        }
        for r in rows
    ]

@router.get("/fuel-types")
def get_fuel_types(db: Session = Depends(get_db)):
    """Get all active fuel types for bike profile screen."""
    rows = db.query(FuelTypeMaster).filter_by(is_active=True).order_by(FuelTypeMaster.sort_order).all()
    return [{"code": r.code, "display_name": r.display_name} for r in rows]

@router.get("/translations/{language_code}")
def get_translations(language_code: str, db: Session = Depends(get_db)):
    """Get all UI strings for a given language."""
    strings = db.query(UiStringMaster).filter_by(language_code=language_code).all()
    return {s.string_key: s.translated_text for s in strings}

@router.get("/value-preview/{language_code}")
def get_value_preview(language_code: str, db: Session = Depends(get_db)):
    """
    Get illustrative earnings/costs/profit data for value preview screen.
    FIXED: Single query per request (was looping in previous implementation)
    """
    # Query configuration for requested language
    config = db.query(ValuePreviewConfig).filter_by(language_code=language_code).first()
    
    # If not found for requested language, fallback to English
    if not config:
        config = db.query(ValuePreviewConfig).filter_by(language_code="en").first()
    
    # If still not found, return hardcoded fallback
    if not config:
        return {
            "sample_weekly_earnings_ksh": 14200.00,
            "sample_weekly_costs_ksh": 3650.00,
            "sample_cost_breakdown_json": {
                "fuel": 2400,
                "maintenance": 800,
                "insurance": 450
            }
        }
    
    # Return configuration as JSON
    return {
        "sample_weekly_earnings_ksh": float(config.sample_weekly_earnings_ksh),
        "sample_weekly_costs_ksh": float(config.sample_weekly_costs_ksh),
        "sample_cost_breakdown_json": config.sample_cost_breakdown_json or {},
    }