# backend/app/routers/sb14_financial_performance.py
# UPDATED: Financial Performance income vs expense tracking (RA-07, RA-08)
# ✅ FIXED: Proper rider_id filtering to prevent data leakage
# ✅ FIXED: Newly onboarded customers see zeros until first transaction
# Calculates net profit per period, manages other expense entries, and provides expense breakdown

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from uuid import UUID
from app.database import get_db
from app.auth import verify_token
from app.models import Rider, Trip, FuelEntry, MaintenanceEntry, OtherExpense
from app.schemas.financial_performance import (
    NetProfitResponse,
    OtherExpenseRequest,
    ExpenseBreakdown,
)

router = APIRouter(prefix="/financial", tags=["financial_performance"])


def get_period_start(period: str, reference_date: datetime = None) -> datetime:
    """Calculate the start of a period (today, this_week, this_month)."""
    if reference_date is None:
        reference_date = datetime.utcnow()
    
    if period == "today":
        return reference_date.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "this_week":
        # Monday of this week
        days_since_monday = (reference_date.weekday())
        start = reference_date - timedelta(days=days_since_monday)
        return start.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "this_month":
        return reference_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        return reference_date.replace(hour=0, minute=0, second=0, microsecond=0)


def calculate_income_for_period(db: Session, rider_id: UUID, period_start: datetime) -> float:
    """Calculate total realized income (from trips) since period_start."""
    # ✅ FIXED: Use correct Trip fields (status=="active", amount field, recorded_at timestamp)
    # ✅ FIXED: Filter by rider_id to prevent cross-customer data access
    trips = db.query(Trip).filter(
        Trip.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
        Trip.status == "active",
        Trip.recorded_at >= period_start,
    ).all()
    
    total_income = 0.0
    for trip in trips:
        if trip.amount:
            total_income += trip.amount
    
    return total_income


def calculate_fuel_expense_for_period(db: Session, rider_id: UUID, period_start: datetime) -> float:
    """Calculate total fuel/energy expense since period_start."""
    # ✅ FIXED: Use correct FuelEntry fields (submitted_at timestamp, cost field)
    # ✅ FIXED: Filter by rider_id to prevent cross-customer data access
    fuel_entries = db.query(FuelEntry).filter(
        FuelEntry.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
        FuelEntry.submitted_at >= period_start,
    ).all()
    
    return sum(f.cost for f in fuel_entries if f.cost)


def calculate_maintenance_expense_for_period(db: Session, rider_id: UUID, period_start: datetime) -> float:
    """Calculate total maintenance expense since period_start."""
    # ✅ FIXED: Use correct MaintenanceEntry fields (submitted_at timestamp, cost field)
    # ✅ FIXED: Filter by rider_id to prevent cross-customer data access
    maint_entries = db.query(MaintenanceEntry).filter(
        MaintenanceEntry.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
        MaintenanceEntry.submitted_at >= period_start,
    ).all()
    
    return sum(m.cost for m in maint_entries if m.cost)


def calculate_other_expense_breakdown(db: Session, rider_id: UUID, period_start: datetime) -> dict:
    """Calculate other expenses grouped by category."""
    # ✅ FIXED: Verified correct field names (created_at, amount_ksh, category)
    # ✅ FIXED: Filter by rider_id to prevent cross-customer data access
    other_expenses = db.query(OtherExpense).filter(
        OtherExpense.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
        OtherExpense.created_at >= period_start,
    ).all()
    
    breakdown = {}
    for exp in other_expenses:
        category = exp.category or "Other"
        breakdown[category] = breakdown.get(category, 0.0) + (exp.amount_ksh or 0.0)
    
    return breakdown


@router.get("/net-profit", response_model=NetProfitResponse)
async def get_net_profit(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    period: str = Query("today", description="Period: today | this_week | this_month"),
    db: Session = Depends(get_db),
    token: dict = Depends(verify_token),
):
    """
    Calculate net profit for a rider for a given period.
    Breakdown: Net Profit = Total Income - (Fuel + Maintenance + Other Expenses)
    ✅ FIXED: Proper rider_id validation and filtering
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider ID format")
    
    # Verify the rider exists and belongs to the authenticated user
    rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
    if not rider or rider.mobile_number != token.get("sub"):
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    period_start = get_period_start(period)
    
    # Calculate components
    # ✅ FIXED: All calculations properly filter by rider_id
    income = calculate_income_for_period(db, rider_uuid, period_start)
    fuel_expense = calculate_fuel_expense_for_period(db, rider_uuid, period_start)
    maint_expense = calculate_maintenance_expense_for_period(db, rider_uuid, period_start)
    other_by_category = calculate_other_expense_breakdown(db, rider_uuid, period_start)
    
    total_other = sum(other_by_category.values())
    total_expense = fuel_expense + maint_expense + total_other
    net_profit = income - total_expense
    
    # Build breakdown for UI display
    breakdown = []
    
    if fuel_expense > 0:
        breakdown.append(ExpenseBreakdown(category="Fuel/Energy", amount=fuel_expense))
    
    if maint_expense > 0:
        breakdown.append(ExpenseBreakdown(category="Service", amount=maint_expense))
    
    for category, amount in other_by_category.items():
        if amount > 0:
            breakdown.append(ExpenseBreakdown(category=category, amount=amount))
    
    # Sort by amount descending
    breakdown.sort(key=lambda x: x.amount, reverse=True)
    
    # Calculate week average if requesting today
    week_avg_daily = 0.0
    if period == "today":
        week_start = get_period_start("this_week")
        # ✅ FIXED: All week calculations properly filter by rider_id
        week_income = calculate_income_for_period(db, rider_uuid, week_start)
        week_fuel = calculate_fuel_expense_for_period(db, rider_uuid, week_start)
        week_maint = calculate_maintenance_expense_for_period(db, rider_uuid, week_start)
        week_other = sum(calculate_other_expense_breakdown(db, rider_uuid, week_start).values())
        week_net = week_income - (week_fuel + week_maint + week_other)
        week_avg_daily = week_net / 7.0 if week_net > 0 else 0.0
    
    return NetProfitResponse(
        net_profit=net_profit,
        income=income,
        total_expense=total_expense,
        fuel_expense=fuel_expense,
        maintenance_expense=maint_expense,
        other_expense=total_other,
        breakdown=breakdown,
        week_avg_daily_profit=week_avg_daily,
    )


@router.post("/other-expense")
async def log_other_expense(
    req: OtherExpenseRequest,
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db),
    token: dict = Depends(verify_token),
):
    """
    Log an other expense entry for a rider.
    Categories come from FinancialMasterData.
    ✅ FIXED: Proper rider_id validation and filtering
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider ID format")
    
    # Verify the rider exists and belongs to the authenticated user
    rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
    if not rider or rider.mobile_number != token.get("sub"):
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    # Create the expense entry
    # ✅ FIXED: Ensure rider_id is properly set
    expense = OtherExpense(
        rider_id=rider_uuid,  # ✅ CRITICAL: Ensure correct rider_id
        category=req.category,
        amount_ksh=req.amount,
        notes=req.note or "",
        created_at=datetime.fromisoformat(req.submitted_at) if req.submitted_at else datetime.utcnow(),
        sync_status="synced",
    )
    
    db.add(expense)
    db.commit()
    db.refresh(expense)
    
    return {"id": expense.id, "status": "created"}

@router.get("/expense-categories")
def get_expense_categories(db: Session = Depends(get_db)):
    """
    Get all available expense categories for the rider to log expenses.
    Public endpoint - no authentication required for category lookup.
    """
    try:
        from app.models.financial_master_data import ExpenseCategoryMaster
        categories = db.query(ExpenseCategoryMaster).order_by(ExpenseCategoryMaster.sort_order).all()
        return {
            "categories": [
                {
                    "code": c.code,
                    "display_name": c.display_name,
                    "sort_order": c.sort_order,
                }
                for c in categories
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch categories: {str(e)}")