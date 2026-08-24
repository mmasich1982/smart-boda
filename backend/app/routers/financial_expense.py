# backend/app/routers/financial_expense.py
# ✅ CREATED: Expense tracking endpoint for fuel, battery, and service costs
# This endpoint creates OtherExpense entries that flow to downstream modules:
# - My Financial Performance (sb14)
# - My Financial History (sb19/sb08)
# - Statements (sb20)

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from uuid import UUID
from pydantic import BaseModel, Field
from typing import Optional
from app.database import get_db
from app.models.other_expense import OtherExpense

router = APIRouter(prefix="/financial", tags=["expense-tracking"])


class ExpenseRequest(BaseModel):
    """Schema for creating an expense entry"""
    expense_type: str = Field(..., description="Type of expense: Fuel, Battery, Service")
    amount: float = Field(..., gt=0, description="Amount in KSh")
    description: Optional[str] = Field(None, description="Additional details")


@router.post("/expense")
def create_expense(
    request: ExpenseRequest,
    rider_id: str = Query(..., description="UUID of the rider"),
    db: Session = Depends(get_db)
):
    """
    Create an expense entry for fuel, battery, or service costs.
    These entries are included in:
    - Financial Performance dashboard
    - Financial History & Statements
    - Net Profit calculations
    """
    try:
        # Validate rider UUID
        try:
            rider_uuid = UUID(rider_id)
        except ValueError:
            raise HTTPException(400, "Invalid rider_id format.")

        # Create expense entry
        expense = OtherExpense(
            rider_id=rider_uuid,
            category=request.expense_type,  # "Fuel", "Battery", "Service"
            amount_ksh=request.amount,
            notes=request.description or f"{request.expense_type} entry",
            created_at=datetime.now(timezone.utc),
            sync_status="pending"  # Will be synced to upstream systems
        )

        db.add(expense)
        db.commit()
        db.refresh(expense)

        return {
            "id": expense.id,
            "status": "success",
            "message": f"{request.expense_type} expense recorded successfully",
            "expense_id": expense.id,
            "amount": expense.amount_ksh,
            "category": expense.category,
            "created_at": expense.created_at.isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to record expense: {str(e)}")