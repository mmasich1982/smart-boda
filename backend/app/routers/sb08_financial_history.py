# backend/app/routers/sb08_financial_history.py
# ✅ FIXED: Consolidated Financial History Router v1.1
# ✅ FIXED: Proper rider_id filtering to prevent cross-customer data leakage
# ✅ FIXED: Newly onboarded customers see empty history until first transaction
# ✅ FIXED: All field name corrections for accurate data retrieval
# ✅ FIXED: Transaction type labeled as "Trip" instead of "Other Expense (Misc)"

from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
from uuid import UUID
import logging

from app.database import get_db
from app.models.trip import Trip
from app.models.fuel_entry import FuelEntry
from app.models.maintenance_entry import MaintenanceEntry
from app.models.other_expense import OtherExpense
from app.models.statement import Statement
from app.models.rider import Rider
from app.models.compliance_master_data import ComplianceRuleConfig
from app.schemas.financial_schemas import (
    FinancialSummaryResponse,
    TransactionListResponse,
)
from app.auth import get_current_rider
from app.services.quick_range_service import quick_range_bounds

logger = logging.getLogger(__name__)

# Two routers for backward compatibility and clear separation of concerns
router_api = APIRouter(prefix='/api/v1/financial', tags=['Financial History & Statements (API)'])
router_compliance = APIRouter(prefix='/compliance/financial-history', tags=['Financial History (Compliance)'])


# ============================================================================
# SHARED UTILITY: Period Boundary Calculations
# ============================================================================

def calculate_period_bounds(period: str, reference_time: datetime = None) -> tuple:
    """
    Calculate start and end datetime for a given period.
    All calculations use UTC midnight boundaries.
    ✅ FIXED: Proper period end dates (not current time)
    """
    if reference_time is None:
        reference_time = datetime.now(timezone.utc).replace(tzinfo=None)
    
    if period == "today":
        today_start = reference_time.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        return today_start, today_end
    
    elif period == "this_week":
        week_start = reference_time.replace(hour=0, minute=0, second=0, microsecond=0)
        # Go back to Monday (weekday() = 0)
        week_start = week_start - timedelta(days=week_start.weekday())
        week_end = week_start + timedelta(days=7)
        return week_start, week_end
    
    elif period == "this_month":
        month_start = reference_time.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # Get first day of next month
        if reference_time.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1)
        return month_start, month_end
    
    elif period == "last_month":
        # First day of current month
        this_month_start = reference_time.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # Last month's start
        if reference_time.month == 1:
            last_month_start = this_month_start.replace(year=this_month_start.year - 1, month=12)
        else:
            last_month_start = this_month_start.replace(month=this_month_start.month - 1)
        # Last month's end = this month's start
        return last_month_start, this_month_start
    
    elif period == "all_time":
        start_date = datetime(2000, 1, 1)
        end_date = reference_time.replace(hour=23, minute=59, second=59, microsecond=999999) + timedelta(days=1)
        return start_date, end_date
    
    else:
        raise ValueError(f"Unknown period: {period}")


# ============================================================================
# SHARED UTILITY: Transaction Retrieval (DATA ISOLATION - FIXED)
# ============================================================================

def fetch_all_transactions(rider_id, start_dt: datetime, end_dt: datetime, db: Session, 
                          transaction_type: str = "all") -> list:
    """
    Unified transaction retrieval across all transaction types.
    ✅ FIXED: Proper rider_id filtering to prevent data leakage
    ✅ FIXED: All correct field names for each model
    ✅ FIXED: Proper timestamp filtering
    ✅ FIXED: Transaction type labeled as "Trip" for consistency
    """
    transactions = []
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Trip income
    # ✅ FIXED: Filter by rider_id to prevent cross-customer data access
    if transaction_type in ("all", "income", "trip"):
        trips = db.query(Trip).filter(
            Trip.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
            Trip.recorded_at >= start_dt,
            Trip.recorded_at <= end_dt,
            Trip.status == 'active'
        ).all()
        
        for trip in trips:
            transactions.append({
                "type": "Trip",  # ✅ FIXED: Labeled as "Trip" not "Other Expense"
                "description": "Trip",
                "amount": float(trip.amount),
                "timestamp": trip.recorded_at,
                "id": str(trip.id),
                "voided": trip.status == "voided",
                "corrected": getattr(trip, 'corrected_at', None) is not None
            })

    # Fuel/Battery expense
    # ✅ FIXED: Filter by rider_id to prevent cross-customer data access
    if transaction_type in ("all", "expense", "fuel", "battery"):
        fuel_entries = db.query(FuelEntry).filter(
            FuelEntry.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
            FuelEntry.submitted_at >= start_dt,
            FuelEntry.submitted_at <= end_dt,
        ).all()
        
        for fuel in fuel_entries:
            mode_labels = {
                'petrol': 'Fuel (Petrol)',
                'swap': 'Battery Swap',
                'charging': 'Battery Charging'
            }
            description = mode_labels.get(fuel.mode, f'Fuel ({fuel.mode})')
            
            transactions.append({
                "type": "Fuel",
                "description": description,
                "amount": float(fuel.cost),
                "timestamp": fuel.submitted_at,
                "id": str(fuel.id),
                "voided": False,
                "corrected": False
            })

    # Service/Maintenance expense
    # ✅ FIXED: Filter by rider_id to prevent cross-customer data access
    if transaction_type in ("all", "expense", "service", "maintenance"):
        maintenance = db.query(MaintenanceEntry).filter(
            MaintenanceEntry.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
            MaintenanceEntry.submitted_at >= start_dt,
            MaintenanceEntry.submitted_at <= end_dt,
        ).all()
        
        for maint in maintenance:
            transactions.append({
                "type": "Service",
                "description": f"Service - {maint.service_type_code}",
                "amount": float(maint.cost),
                "timestamp": maint.submitted_at,
                "id": str(maint.id),
                "voided": False,
                "corrected": False
            })

    # Other expenses
    # ✅ FIXED: Filter by rider_id to prevent cross-customer data access
    if transaction_type in ("all", "expense", "other"):
        others = db.query(OtherExpense).filter(
            OtherExpense.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
            OtherExpense.created_at >= start_dt,
            OtherExpense.created_at <= end_dt,
        ).all()
        
        for other in others:
            transactions.append({
                "type": other.category or "Other",
                "description": other.category or "Other",
                "amount": float(other.amount_ksh),
                "timestamp": other.created_at,
                "id": str(other.id),
                "voided": False,
                "corrected": False
            })

    # Sort by timestamp (newest first)
    transactions.sort(key=lambda x: x["timestamp"], reverse=True)
    return transactions


def calculate_financial_summary(rider_id, start_dt: datetime, end_dt: datetime, db: Session) -> dict:
    """
    Calculate financial totals and breakdown for a period.
    ✅ FIXED: All field names corrected
    ✅ FIXED: Newly onboarded customers with no transactions return zeros
    ✅ FIXED: Proper rider_id filtering
    """
    # Income from trips
    # ✅ FIXED: Filter by rider_id
    income = db.query(func.sum(Trip.amount)).filter(
        Trip.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
        Trip.recorded_at >= start_dt,
        Trip.recorded_at <= end_dt,
        Trip.status == 'active'
    ).scalar() or 0
    income = float(income)

    # Fuel/battery expense
    # ✅ FIXED: Filter by rider_id
    fuel_expense = db.query(func.sum(FuelEntry.cost)).filter(
        FuelEntry.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
        FuelEntry.submitted_at >= start_dt,
        FuelEntry.submitted_at <= end_dt,
    ).scalar() or 0
    fuel_expense = float(fuel_expense)

    # Service/maintenance expense
    # ✅ FIXED: Filter by rider_id
    service_expense = db.query(func.sum(MaintenanceEntry.cost)).filter(
        MaintenanceEntry.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
        MaintenanceEntry.submitted_at >= start_dt,
        MaintenanceEntry.submitted_at <= end_dt,
    ).scalar() or 0
    service_expense = float(service_expense)

    # Other expenses
    # ✅ FIXED: Filter by rider_id
    other_expense = db.query(func.sum(OtherExpense.amount_ksh)).filter(
        OtherExpense.rider_id == rider_id,  # ✅ CRITICAL: Rider ID filter
        OtherExpense.created_at >= start_dt,
        OtherExpense.created_at <= end_dt,
    ).scalar() or 0
    other_expense = float(other_expense)

    total_expense = fuel_expense + service_expense + other_expense
    net_profit = income - total_expense

    return {
        "income": income,
        "fuel_expense": fuel_expense,
        "service_expense": service_expense,
        "other_expense": other_expense,
        "total_expense": total_expense,
        "net_profit": net_profit,
    }


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router_api.get("/summary")
def api_financial_summary(
    rider_id: str = Query(..., description="Rider UUID"),
    period: str = Query("this_month", description="Period: today | this_week | this_month | last_month | all_time"),
    db: Session = Depends(get_db)
):
    """
    GET /api/v1/financial/summary?rider_id=UUID&period=this_month
    
    Get financial summary for a rider in a specified period.
    ✅ FIXED: Proper rider_id validation and filtering
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider_id format")

    # ✅ FIXED: Verify rider exists (optional but recommended for data validation)
    rider = db.query(Rider).filter_by(id=rider_uuid).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    start, end = calculate_period_bounds(period)
    summary = calculate_financial_summary(rider_uuid, start, end, db)
    
    return {
        "rider_id": rider_id,
        "period": period,
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "summary": summary
    }


@router_api.get("/transactions")
def api_transaction_list(
    rider_id: str = Query(..., description="Rider UUID"),
    period: str = Query("this_month", description="Period for filtering"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    GET /api/v1/financial/transactions?rider_id=UUID&period=this_month&page=1
    
    Get paginated transaction list for a rider.
    ✅ FIXED: Proper rider_id validation and filtering
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider_id format")

    # ✅ FIXED: Verify rider exists
    rider = db.query(Rider).filter_by(id=rider_uuid).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    start, end = calculate_period_bounds(period)
    all_txns = fetch_all_transactions(rider_uuid, start, end, db, "all")
    
    # Paginate
    total = len(all_txns)
    total_pages = max(1, -(-total // page_size))
    page_start = (page - 1) * page_size
    page_end = page_start + page_size
    page_items = all_txns[page_start:page_end]
    
    return {
        "rider_id": rider_id,
        "items": page_items,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "total_items": total
        }
    }


@router_compliance.get("/transactions")
def compliance_transaction_list(
    rider_id: str = Query(..., description="Rider UUID"),
    quick_select: str = Query("this_month"),
    type_filter: str = Query("all", description="Filter by type: all | trip | fuel | service | other"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    GET /compliance/financial-history/transactions?rider_id=UUID&quick_select=today&page=1
    
    Transaction list with pagination.
    ✅ FIXED: Proper rider_id validation and filtering
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider_id format")

    # ✅ FIXED: Verify rider exists
    rider = db.query(Rider).filter_by(id=rider_uuid).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    start, end = quick_range_bounds(quick_select, datetime.now(timezone.utc).replace(tzinfo=None), rider, db)
    
    # Get all transactions
    all_txns = fetch_all_transactions(rider_uuid, start, end, db, type_filter)
    
    # Paginate
    total = len(all_txns)
    total_pages = max(1, -(-total // page_size))
    page_start = (page - 1) * page_size
    page_end = page_start + page_size
    page_items = all_txns[page_start:page_end]
    
    return {
        "items": page_items,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "total_items": total
        }
    }