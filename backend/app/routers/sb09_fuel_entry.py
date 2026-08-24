# backend/app/routers/sb09_fuel_entry.py
# ✅ FIXED: Proper rider_id filtering to prevent data leakage
# ✅ FIXED: Removed duplicate OtherExpense creation - fuel costs tracked in FuelEntry only
# ✅ FIXED: Newly onboarded customers see empty fuel history until first entry

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from uuid import UUID
from app.database import get_db
from app.models.fuel_entry import FuelEntry
from app.models.rider import Rider
from app.schemas.fuel_maintenance import FuelEntryRequest

router = APIRouter(prefix="/fuel-maintenance", tags=["sb-09"])

@router.post("/fuel-entry")
def save_fuel_entry(
    payload: FuelEntryRequest,
    rider_id: str = Query(..., description="UUID of the rider"),
    db: Session = Depends(get_db)
):
    """Save fuel or energy entry WITHOUT creating duplicate financial expense record"""
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format. Must be a valid UUID.")

    # ✅ FIXED: Verify rider exists
    rider = db.query(Rider).filter_by(id=rider_uuid).first()
    if not rider:
        raise HTTPException(404, "Rider not found")

    if payload.mode == "petrol":
        if not payload.cost or payload.cost <= 0:
            raise HTTPException(422, "Enter total cost, greater than zero.")
    elif payload.mode == "swap":
        if not payload.swap_partner_id:
            raise HTTPException(422, "Select a swap network/partner.")
        if not payload.cost or payload.cost <= 0:
            raise HTTPException(422, "Enter the swap cost paid.")
        if payload.odometer_reading is None or payload.odometer_reading < 0:
            raise HTTPException(422, "Enter the current odometer reading.")
    elif payload.mode == "charging":
        if not payload.cost or payload.cost <= 0:
            raise HTTPException(422, "Enter the charging cost paid.")
        if payload.odometer_reading is None or payload.odometer_reading < 0:
            raise HTTPException(422, "Enter the current odometer reading.")
    else:
        raise HTTPException(422, f"Invalid mode: {payload.mode}")

    try:
        # Create fuel entry ONLY - no duplicate OtherExpense creation
        # ✅ FIXED: Removed create_expense_record call to prevent duplicate counting
        entry = FuelEntry(
            rider_id=rider_uuid,
            mode=payload.mode,
            litres=payload.litres,
            cost=payload.cost,
            swap_partner_id=UUID(payload.swap_partner_id) if payload.swap_partner_id else None,
            odometer_reading=payload.odometer_reading,
            submitted_at=datetime.now(timezone.utc)
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        
        return {"id": str(entry.id), "status": "recorded"}
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to save entry: {str(e)}")


@router.get("/fuel-entry/history")
def get_fuel_history(
    rider_id: str = Query(..., description="UUID of the rider"),
    page: int = Query(1, ge=1),
    type: str = Query(None, description="Filter by mode: petrol, swap, charging"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """Get paginated fuel/battery entry history"""
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format.")

    # ✅ FIXED: Verify rider exists
    rider = db.query(Rider).filter_by(id=rider_uuid).first()
    if not rider:
        raise HTTPException(404, "Rider not found")

    try:
        # ✅ CRITICAL: Filter by rider_id to prevent cross-customer data access
        query = db.query(FuelEntry).filter_by(rider_id=rider_uuid).order_by(FuelEntry.created_at.desc())
        
        if type:
            query = query.filter_by(mode=type.lower())
        
        total = query.count()
        total_pages = (total + limit - 1) // limit if total > 0 else 1
        
        entries = query.offset((page - 1) * limit).limit(limit).all()
        
        return {
            "entries": [
                {
                    "id": str(e.id),
                    "mode": e.mode,
                    "cost": float(e.cost) if e.cost else 0,
                    "litres": float(e.litres) if e.litres else None,
                    "swap_partner_id": str(e.swap_partner_id) if e.swap_partner_id else None,
                    "odometer_reading": float(e.odometer_reading) if e.odometer_reading else None,
                    "created_at": e.created_at.isoformat() if e.created_at else None,
                }
                for e in entries
            ],
            "total": total,
            "page": page,
            "total_pages": total_pages,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch history: {str(e)}")


@router.get("/fuel-entry/summary")
def get_fuel_summary(rider_id: str = Query(...), db: Session = Depends(get_db)):
    """Get fuel cost summary statistics"""
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(400, "Invalid rider_id format.")

    # ✅ FIXED: Verify rider exists
    rider = db.query(Rider).filter_by(id=rider_uuid).first()
    if not rider:
        raise HTTPException(404, "Rider not found")

    try:
        now = datetime.now(timezone.utc)
        this_month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        last_month_start = this_month_start - timedelta(days=1)
        last_month_start = datetime(last_month_start.year, last_month_start.month, 1, tzinfo=timezone.utc)
        six_months_ago = now - timedelta(days=180)
        
        # ✅ CRITICAL: Filter by rider_id to prevent cross-customer data access
        entries = db.query(FuelEntry).filter_by(rider_id=rider_uuid).all()
        
        this_month_total = 0
        last_month_total = 0
        last_six_months_total = 0
        since_joining_total = 0
        
        for entry in entries:
            cost = float(entry.cost) if entry.cost else 0
            since_joining_total += cost
            
            if entry.created_at >= six_months_ago:
                last_six_months_total += cost
            
            if entry.created_at >= this_month_start:
                this_month_total += cost
            elif entry.created_at >= last_month_start:
                last_month_total += cost
        
        return {
            "this_month": this_month_total,
            "last_month": last_month_total,
            "last_six_months": last_six_months_total,
            "since_joining": since_joining_total,
            "total_entries": len(entries),
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch summary: {str(e)}")