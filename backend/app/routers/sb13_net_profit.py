# backend/app/routers/sb13_net_profit.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database import get_db
from app.models.other_expense import OtherExpense
from app.models.financial_master_data import ExpenseCategoryMaster
from app.schemas.financial_performance import OtherExpenseRequest
from app.services.net_profit_service import net_profit_summary

router = APIRouter(prefix="/financial", tags=["sb-13"])

@router.get("/net-profit")
def get_net_profit(
    rider_id: str = Query(..., description="Rider ID"),
    period: str = Query("today", description="Period: today, this_week, this_month"),
    db: Session = Depends(get_db)
):
    """Get net profit summary for a rider for a given period.
    
    Args:
        rider_id: UUID of the rider
        period: Time period (today, this_week, this_month)
        db: Database session
    
    Returns:
        Net profit summary with income, expenses, and breakdown
    """
    return net_profit_summary(db, rider_id, period, datetime.now(timezone.utc))

@router.post("/other-expense")
def save_other_expense(
    payload: OtherExpenseRequest,
    rider_id: str = Query(..., description="Rider ID"),
    db: Session = Depends(get_db)
):
    """Save an other expense entry for a rider.
    
    Args:
        payload: Expense details (category, amount)
        rider_id: UUID of the rider
        db: Database session
    
    Returns:
        {"id": "<expense_id>"}
    """
    from uuid import UUID
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider_id format")
    
    # Validate category exists
    category = db.query(ExpenseCategoryMaster).filter_by(code=payload.category).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    entry = OtherExpense(
        rider_id=rider_uuid,
        category=payload.category,
        amount_ksh=payload.amount,
        notes=payload.note,
        created_at=datetime.now(timezone.utc)
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"id": entry.id, "status": "created"}