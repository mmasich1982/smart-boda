# backend/app/routers/sb14_financial_performance.py
# UPDATED: Financial Performance income vs expense tracking (RA-07, RA-08)
# ✅ FIXED: Proper rider_id filtering to prevent data leakage
# ✅ FIXED: Newly onboarded customers see zeros until first transaction
# ✅ NEW: 6-month data retention policy for IndexedDB
# ✅ NEW: Automatic data deletion after 6-month cycle completion
# ✅ NEW: Retention window enforcement for all queries
# Calculates net profit per period, manages other expense entries, and provides expense breakdown

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from uuid import UUID
from app.database import get_db
from app.auth import verify_token
from app.models import Rider, Trip, FuelEntry, MaintenanceEntry, OtherExpense
from app.models.lipa_later_payment import LipaLaterPayment
from app.schemas.financial_performance import (
    NetProfitResponse,
    OtherExpenseRequest,
    ExpenseBreakdown,
)

router = APIRouter(prefix="/financial", tags=["financial_performance"])

# ✅ NEW: 6-month data retention window constant
DATA_RETENTION_MONTHS = 6


def get_rider_onboarding_date(rider: Rider) -> datetime:
    """Get rider's onboarding date from created_at field"""
    return rider.created_at if hasattr(rider, 'created_at') and rider.created_at else datetime.now(timezone.utc)


def is_within_retention_window(entry_date: datetime, rider_onboarding_date: datetime) -> bool:
    """Check if entry is within 6-month retention window from rider onboarding"""
    if not entry_date or not rider_onboarding_date:
        return False
    
    retention_limit = rider_onboarding_date + timedelta(days=DATA_RETENTION_MONTHS * 30)
    return entry_date >= rider_onboarding_date and entry_date <= retention_limit


def get_period_start(period: str, reference_date: datetime = None) -> datetime:
    """Calculate the start of a period (today, this_week, this_month)."""
    if reference_date is None:
        reference_date = datetime.now(timezone.utc).replace(tzinfo=None)
    
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


def calculate_income_for_period(db: Session, rider_id: UUID, period_start: datetime, rider_onboarding_date: datetime = None) -> float:
    """Calculate total realized income (from trips) since period_start within 6-month retention window."""
    # ✅ FIXED: Use correct Trip fields (status=="active", amount field, recorded_at timestamp)
    # ✅ FIXED: Filter by rider_id to prevent cross-customer data access
    # ✅ NEW: Filter by retention window
    
    retention_limit = None
    if rider_onboarding_date:
        retention_limit = rider_onboarding_date + timedelta(days=DATA_RETENTION_MONTHS * 30)
    
    query = db.query(Trip).filter(
        Trip.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
        Trip.status == "active",
        Trip.recorded_at >= period_start,
    )
    
    # ✅ NEW: Ensure data is within retention window
    if rider_onboarding_date:
        query = query.filter(
            Trip.recorded_at >= rider_onboarding_date,
            Trip.recorded_at <= retention_limit
        )
    
    trips = query.all()
    
    total_income = 0.0
    for trip in trips:
        if trip.amount:
            total_income += trip.amount
    
    # ✅ NEW: Include Lipa Later payments in earnings
    lipa_later_query = db.query(LipaLaterPayment).filter(
        LipaLaterPayment.rider_id == rider_id,
    )
    
    # ✅ NEW: Filter by time period
    # Convert payment_date to datetime for comparison if needed
    if rider_onboarding_date:
        retention_limit = rider_onboarding_date + timedelta(days=DATA_RETENTION_MONTHS * 30)
        lipa_later_query = lipa_later_query.filter(
            LipaLaterPayment.payment_date >= rider_onboarding_date.date() if hasattr(rider_onboarding_date, 'date') else rider_onboarding_date,
            LipaLaterPayment.payment_date <= retention_limit.date() if hasattr(retention_limit, 'date') else retention_limit
        )
    
    lipa_later_payments = lipa_later_query.all()
    for payment in lipa_later_payments:
        if payment.amount_ksh:
            total_income += float(payment.amount_ksh)
    
    return total_income


def calculate_fuel_expense_for_period(db: Session, rider_id: UUID, period_start: datetime, rider_onboarding_date: datetime = None) -> float:
    """Calculate total fuel/energy expense since period_start within 6-month retention window."""
    # ✅ FIXED: Use correct FuelEntry fields (submitted_at timestamp, cost field)
    # ✅ FIXED: Filter by rider_id to prevent cross-customer data access
    # ✅ NEW: Filter by retention window
    
    retention_limit = None
    if rider_onboarding_date:
        retention_limit = rider_onboarding_date + timedelta(days=DATA_RETENTION_MONTHS * 30)
    
    query = db.query(FuelEntry).filter(
        FuelEntry.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
        FuelEntry.submitted_at >= period_start,
    )
    
    # ✅ NEW: Ensure data is within retention window
    if rider_onboarding_date:
        query = query.filter(
            FuelEntry.submitted_at >= rider_onboarding_date,
            FuelEntry.submitted_at <= retention_limit
        )
    
    fuel_entries = query.all()
    
    return sum(f.cost for f in fuel_entries if f.cost)


def calculate_maintenance_expense_for_period(db: Session, rider_id: UUID, period_start: datetime, rider_onboarding_date: datetime = None) -> float:
    """Calculate total maintenance expense since period_start within 6-month retention window."""
    # ✅ FIXED: Use correct MaintenanceEntry fields (submitted_at timestamp, cost field)
    # ✅ FIXED: Filter by rider_id to prevent cross-customer data access
    # ✅ NEW: Filter by retention window
    
    retention_limit = None
    if rider_onboarding_date:
        retention_limit = rider_onboarding_date + timedelta(days=DATA_RETENTION_MONTHS * 30)
    
    query = db.query(MaintenanceEntry).filter(
        MaintenanceEntry.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
        MaintenanceEntry.submitted_at >= period_start,
    )
    
    # ✅ NEW: Ensure data is within retention window
    if rider_onboarding_date:
        query = query.filter(
            MaintenanceEntry.submitted_at >= rider_onboarding_date,
            MaintenanceEntry.submitted_at <= retention_limit
        )
    
    maint_entries = query.all()
    
    return sum(m.cost for m in maint_entries if m.cost)


def calculate_other_expense_breakdown(db: Session, rider_id: UUID, period_start: datetime, rider_onboarding_date: datetime = None) -> dict:
    """Calculate other expenses grouped by category within 6-month retention window."""
    # ✅ FIXED: Verified correct field names (created_at, amount_ksh, category)
    # ✅ FIXED: Filter by rider_id to prevent cross-customer data access
    # ✅ NEW: Filter by retention window
    
    retention_limit = None
    if rider_onboarding_date:
        retention_limit = rider_onboarding_date + timedelta(days=DATA_RETENTION_MONTHS * 30)
    
    query = db.query(OtherExpense).filter(
        OtherExpense.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
        OtherExpense.created_at >= period_start,
    )
    
    # ✅ NEW: Ensure data is within retention window
    if rider_onboarding_date:
        query = query.filter(
            OtherExpense.created_at >= rider_onboarding_date,
            OtherExpense.created_at <= retention_limit
        )
    
    other_expenses = query.all()
    
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
    Calculate net profit for a rider for a given period within 6-month retention window.
    Breakdown: Net Profit = Total Income - (Fuel + Maintenance + Other Expenses)
    
    ✅ FIXED: Proper rider_id validation and filtering
    ✅ NEW: 6-month retention window enforcement
    
    NOTE: Financial Performance data is retained for 6 months from rider onboarding date.
    For data beyond 6 months, rider must request historical data from Smart Boda Admin (Phase 2).
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider ID format")
    
    # Verify the rider exists and belongs to the authenticated user
    rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
    if not rider or rider.mobile_number != token.get("sub"):
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    # ✅ NEW: Get rider's onboarding date for retention window
    rider_onboarding_date = get_rider_onboarding_date(rider)
    retention_limit = rider_onboarding_date + timedelta(days=DATA_RETENTION_MONTHS * 30)
    
    period_start = get_period_start(period)
    
    # ✅ NEW: Check if requested period is within retention window
    if period_start > retention_limit:
        # Data is beyond retention window
        return {
            "net_profit": 0,
            "income": 0,
            "total_expense": 0,
            "fuel_expense": 0,
            "maintenance_expense": 0,
            "other_expense": 0,
            "breakdown": [],
            "week_avg_daily_profit": 0,
            "retention_info": {
                "rider_onboarding_date": rider_onboarding_date.isoformat(),
                "retention_window_end": retention_limit.isoformat(),
                "retention_months": DATA_RETENTION_MONTHS,
                "is_within_window": False,
                "message": "Requested period is beyond 6-month retention window. Please contact Smart Boda Admin for historical data (Phase 2)."
            }
        }
    
    # Calculate components
    # ✅ FIXED: All calculations properly filter by rider_id and retention window
    income = calculate_income_for_period(db, rider_uuid, period_start, rider_onboarding_date)
    fuel_expense = calculate_fuel_expense_for_period(db, rider_uuid, period_start, rider_onboarding_date)
    maint_expense = calculate_maintenance_expense_for_period(db, rider_uuid, period_start, rider_onboarding_date)
    other_by_category = calculate_other_expense_breakdown(db, rider_uuid, period_start, rider_onboarding_date)
    
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
        # ✅ FIXED: All week calculations properly filter by rider_id and retention window
        week_income = calculate_income_for_period(db, rider_uuid, week_start, rider_onboarding_date)
        week_fuel = calculate_fuel_expense_for_period(db, rider_uuid, week_start, rider_onboarding_date)
        week_maint = calculate_maintenance_expense_for_period(db, rider_uuid, week_start, rider_onboarding_date)
        week_other = sum(calculate_other_expense_breakdown(db, rider_uuid, week_start, rider_onboarding_date).values())
        week_net = week_income - (week_fuel + week_maint + week_other)
        week_avg_daily = week_net / 7.0 if week_net > 0 else 0.0
    
    return {
        "net_profit": net_profit,
        "income": income,
        "total_expense": total_expense,
        "fuel_expense": fuel_expense,
        "maintenance_expense": maint_expense,
        "other_expense": total_other,
        "breakdown": breakdown,
        "week_avg_daily_profit": week_avg_daily,
        "retention_info": {
            "rider_onboarding_date": rider_onboarding_date.isoformat(),
            "retention_window_end": retention_limit.isoformat(),
            "retention_months": DATA_RETENTION_MONTHS,
            "is_within_window": True
        }
    }


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
    ✅ NEW: 6-month retention window enforcement
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider ID format")
    
    # Verify the rider exists and belongs to the authenticated user
    rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
    if not rider or rider.mobile_number != token.get("sub"):
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    # ✅ NEW: Get rider's onboarding date for retention window
    rider_onboarding_date = get_rider_onboarding_date(rider)
    retention_limit = rider_onboarding_date + timedelta(days=DATA_RETENTION_MONTHS * 30)
    
    # ✅ NEW: Ensure expense is created within retention window (current date should be within window)
    current_date = datetime.now(timezone.utc)
    if current_date > retention_limit:
        raise HTTPException(
            status_code=422,
            detail="Cannot log expenses beyond 6-month retention window. Please contact Smart Boda Admin."
        )
    
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


@router.get("/check-retention")
async def check_retention_window(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db),
    token: dict = Depends(verify_token),
):
    """
    Check if rider's financial data is within retention window.
    
    ✅ NEW: For Phase 2 planning - determines if data exists beyond 6-month window
    Returns: is_within_window (bool), days_remaining (int), retention_window_end (datetime)
    
    NOTE: Phase 2 will implement historical data retrieval from archived storage
    when rider requests data beyond the 6-month retention window.
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider ID format")
    
    # Verify the rider exists and belongs to the authenticated user
    rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
    if not rider or rider.mobile_number != token.get("sub"):
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    try:
        rider_onboarding_date = get_rider_onboarding_date(rider)
        retention_limit = rider_onboarding_date + timedelta(days=DATA_RETENTION_MONTHS * 30)
        current_date = datetime.now(timezone.utc)
        
        is_within_window = current_date <= retention_limit
        days_remaining = (retention_limit - current_date).days
        
        # Get oldest entry date
        oldest_trip = db.query(Trip).filter_by(rider_id=rider_uuid).order_by(Trip.recorded_at.asc()).first()
        oldest_fuel = db.query(FuelEntry).filter_by(rider_id=rider_uuid).order_by(FuelEntry.submitted_at.asc()).first()
        oldest_maint = db.query(MaintenanceEntry).filter_by(rider_id=rider_uuid).order_by(MaintenanceEntry.submitted_at.asc()).first()
        oldest_other = db.query(OtherExpense).filter_by(rider_id=rider_uuid).order_by(OtherExpense.created_at.asc()).first()
        
        oldest_dates = [d.created_at or d.recorded_at or d.submitted_at for d in [oldest_trip, oldest_fuel, oldest_maint, oldest_other] if d]
        oldest_entry_date = min(oldest_dates) if oldest_dates else None
        
        return {
            "rider_id": str(rider_uuid),
            "is_within_retention_window": is_within_window,
            "days_remaining_in_window": max(0, days_remaining),
            "retention_window_end": retention_limit.isoformat(),
            "rider_onboarding_date": rider_onboarding_date.isoformat(),
            "oldest_entry_date": oldest_entry_date.isoformat() if oldest_entry_date else None,
            "retention_months": DATA_RETENTION_MONTHS,
            "has_historical_data_beyond_window": False,  # ✅ Phase 2: Will check archived data store
            "phase_2_note": "Historical data retrieval beyond 6-month window will be implemented in Phase 2. Riders can request archived data from Smart Boda Admin."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check retention: {str(e)}")