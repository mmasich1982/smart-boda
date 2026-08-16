# backend/app/routers/sb10_battery_entry.py
# ✅ Battery utilities - odometer, battery range, swap partners
# FIXED: Moved SwapPartnerMaster import to top level for better reliability

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from uuid import UUID
from app.database import get_db
from app.models.fuel_entry import FuelEntry
from app.models.swap_partner_master import SwapPartnerMaster  # FIXED: Moved to top level

router = APIRouter(prefix="/fuel-maintenance", tags=["sb-10"])


@router.get("/odometer")
def get_latest_odometer(
    rider_id: str = Query(..., description="UUID of the rider"),
    db: Session = Depends(get_db)
):
    """Get the latest odometer reading from any fuel entry"""
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format.")

    try:
        latest_entry = db.query(FuelEntry).filter_by(rider_id=rider_uuid).order_by(FuelEntry.created_at.desc()).first()

        if not latest_entry or not latest_entry.odometer_reading:
            return {"odometer_reading": None}

        return {"odometer_reading": float(latest_entry.odometer_reading)}
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch odometer: {str(e)}")


@router.get("/battery-range")
def get_battery_range(
    rider_id: str = Query(..., description="UUID of the rider"),
    db: Session = Depends(get_db)
):
    """Calculate remaining km for electric vehicle based on latest charge"""
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format.")

    try:
        # Get last charging/swap entry
        last_charge = db.query(FuelEntry).filter(
            FuelEntry.rider_id == rider_uuid,
            FuelEntry.mode.in_(["charging", "swap"])
        ).order_by(FuelEntry.created_at.desc()).first()

        if not last_charge or not last_charge.odometer_reading:
            return {"remaining_km": None, "alert": False}

        # Default: 60 km per full charge (configurable)
        DEFAULT_BATTERY_RANGE_KM = 60
        charge_km = DEFAULT_BATTERY_RANGE_KM
        last_odometer = float(last_charge.odometer_reading)

        # Get latest odometer (current)
        latest = db.query(FuelEntry).filter_by(rider_id=rider_uuid).order_by(FuelEntry.created_at.desc()).first()
        current_odometer = float(latest.odometer_reading) if latest and latest.odometer_reading else last_odometer

        remaining_km = charge_km - (current_odometer - last_odometer)

        return {
            "remaining_km": max(0, remaining_km),
            "alert": remaining_km <= 5,
            "last_charge_odometer": last_odometer,
            "current_odometer": current_odometer
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to calculate battery range: {str(e)}")


@router.get("/swap-partners")
def get_swap_partners(db: Session = Depends(get_db)):
    """Get list of available swap partners"""
    try:
        # FIXED: SwapPartnerMaster is now imported at top level
        partners = db.query(SwapPartnerMaster).all()

        return {
            "swap_partners": [
                {
                    "id": str(p.id),
                    "name": p.name,
                    "standard_fee": float(p.standard_fee) if p.standard_fee else None,  # ✅ FIXED: Changed from p.default_fee to p.standard_fee
                }
                for p in partners
            ]
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch swap partners: {str(e)}")