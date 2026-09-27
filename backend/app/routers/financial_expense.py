# Fixed Financial Expense Router - Backend
# File: backend/app/routers/financial_expense.py

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from app.database import get_db
from app.models.other_expense import OtherExpense
from app.models.fuel_entry import FuelEntry
from app.models.maintenance_entry import MaintenanceEntry
from app.models.rider import Rider
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/financial", tags=["financial"])

class OtherExpenseCreate(BaseModel):
    category: str  # e.g., "tolls", "parking", "insurance", "loan", "other"
    amount: float
    description: Optional[str] = ""
    expense_date: Optional[str] = None

class OtherExpenseResponse(BaseModel):
    id: str
    category: str
    amount: float
    description: str
    expense_date: str
    created_at: str

@router.post("/other-expenses")
async def create_other_expense(
    payload: OtherExpenseCreate,
    rider_id: str = Query(...),
    db: Session = Depends(get_db)
):
    """
    Create an other expense record.
    FIX #3: This endpoint ensures other expenses are properly recorded.
    """
    try:
        # Validate rider exists
        rider = db.query(Rider).filter(Rider.id == rider_id).first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        
        # Parse expense date or use current date
        expense_date = datetime.utcnow()
        if payload.expense_date:
            try:
                expense_date = datetime.fromisoformat(payload.expense_date)
            except ValueError:
                expense_date = datetime.utcnow()
        
        # Create expense record
        expense = OtherExpense(
            rider_id=rider_id,
            category=payload.category,
            amount=payload.amount,
            description=payload.description or "",
            expense_date=expense_date,
            created_at=datetime.utcnow()
        )
        
        db.add(expense)
        db.commit()
        
        return {
            "status": "success",
            "message": "Other expense created successfully",
            "expense": {
                "id": expense.id,
                "category": expense.category,
                "amount": expense.amount,
                "description": expense.description,
                "expense_date": expense.expense_date.isoformat(),
                "created_at": expense.created_at.isoformat()
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/other-expenses/{rider_id}")
async def get_other_expenses(
    rider_id: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(50),
    db: Session = Depends(get_db)
):
    """
    Get other expenses for a rider with optional filtering.
    FIX #3.1: Returns all other expenses so they can be displayed in UI.
    """
    try:
        # Verify rider exists
        rider = db.query(Rider).filter(Rider.id == rider_id).first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        
        # Build query
        query = db.query(OtherExpense).filter(OtherExpense.rider_id == rider_id)
        
        # Apply date filters if provided
        if start_date:
            try:
                start = datetime.fromisoformat(start_date)
                query = query.filter(OtherExpense.expense_date >= start)
            except ValueError:
                pass
        
        if end_date:
            try:
                end = datetime.fromisoformat(end_date)
                # Add one day to include the entire end_date
                end = end + timedelta(days=1)
                query = query.filter(OtherExpense.expense_date < end)
            except ValueError:
                pass
        
        # Apply category filter if provided
        if category:
            query = query.filter(OtherExpense.category == category)
        
        # Get total count
        total = query.count()
        
        # Apply pagination and sort
        expenses = query.order_by(OtherExpense.expense_date.desc()).offset(skip).limit(limit).all()
        
        return {
            "status": "success",
            "expenses": [
                {
                    "id": e.id,
                    "category": e.category,
                    "amount": e.amount,
                    "description": e.description,
                    "expense_date": e.expense_date.isoformat(),
                    "created_at": e.created_at.isoformat()
                }
                for e in expenses
            ],
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/expense-breakdown/{rider_id}")
async def get_expense_breakdown(
    rider_id: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get detailed expense breakdown including fuel, maintenance, and other expenses.
    FIX #3.2: This endpoint now INCLUDES other expenses in the breakdown.
    """
    try:
        # Verify rider exists
        rider = db.query(Rider).filter(Rider.id == rider_id).first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        
        # Parse dates
        start = None
        end = None
        if start_date:
            try:
                start = datetime.fromisoformat(start_date)
            except ValueError:
                pass
        if end_date:
            try:
                end = datetime.fromisoformat(end_date)
                end = end + timedelta(days=1)
            except ValueError:
                pass
        
        # Build base filter
        rider_filter = [OtherExpense.rider_id == rider_id] if hasattr(OtherExpense, 'rider_id') else []
        if start:
            rider_filter.append(OtherExpense.expense_date >= start)
        if end:
            rider_filter.append(OtherExpense.expense_date < end)
        
        # Get fuel expenses
        fuel_query = db.query(FuelEntry).filter(FuelEntry.rider_id == rider_id)
        if start:
            fuel_query = fuel_query.filter(FuelEntry.created_at >= start)
        if end:
            fuel_query = fuel_query.filter(FuelEntry.created_at < end)
        fuel_entries = fuel_query.all()
        fuel_total = sum(f.amount for f in fuel_entries) if fuel_entries else 0
        
        # Get maintenance expenses
        maint_query = db.query(MaintenanceEntry).filter(MaintenanceEntry.rider_id == rider_id)
        if start:
            maint_query = maint_query.filter(MaintenanceEntry.created_at >= start)
        if end:
            maint_query = maint_query.filter(MaintenanceEntry.created_at < end)
        maint_entries = maint_query.all()
        maint_total = sum(m.cost for m in maint_entries) if maint_entries else 0
        
        # FIX #3.3: Get OTHER expenses (this was missing before!)
        other_query = db.query(OtherExpense).filter(OtherExpense.rider_id == rider_id)
        if start:
            other_query = other_query.filter(OtherExpense.expense_date >= start)
        if end:
            other_query = other_query.filter(OtherExpense.expense_date < end)
        other_entries = other_query.all()
        other_total = sum(o.amount for o in other_entries) if other_entries else 0
        
        # Calculate totals
        total_expenses = fuel_total + maint_total + other_total
        
        # Breakdown by category
        breakdown = {
            "fuel": {
                "total": fuel_total,
                "count": len(fuel_entries),
                "entries": [
                    {
                        "id": f.id,
                        "amount": f.amount,
                        "type": f.fuel_type,
                        "date": f.created_at.isoformat()
                    }
                    for f in fuel_entries[:10]  # Return top 10
                ]
            },
            "maintenance": {
                "total": maint_total,
                "count": len(maint_entries),
                "entries": [
                    {
                        "id": m.id,
                        "amount": m.cost,
                        "type": m.service_type_code,
                        "date": m.created_at.isoformat()
                    }
                    for m in maint_entries[:10]  # Return top 10
                ]
            },
            "other": {  # FIX #3.4: Add other expenses to breakdown!
                "total": other_total,
                "count": len(other_entries),
                "entries": [
                    {
                        "id": o.id,
                        "amount": o.amount,
                        "category": o.category,
                        "date": o.expense_date.isoformat()
                    }
                    for o in other_entries[:10]  # Return top 10
                ]
            }
        }
        
        return {
            "status": "success",
            "summary": {
                "total_expenses": total_expenses,
                "fuel": fuel_total,
                "maintenance": maint_total,
                "other": other_total  # FIX #3.5: Include in summary!
            },
            "breakdown": breakdown,
            "period": {
                "start": start.isoformat() if start else None,
                "end": end.isoformat() if end else None
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/expense-categories")
async def get_expense_categories(db: Session = Depends(get_db)):
    """Get list of valid expense categories."""
    return {
        "status": "success",
        "categories": [
            "tolls",
            "parking",
            "insurance",
            "loan",
            "registration",
            "inspection",
            "cleaning",
            "repairs",
            "other"
        ]
    }