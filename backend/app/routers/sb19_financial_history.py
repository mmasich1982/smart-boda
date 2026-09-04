# backend/app/routers/sb19_financial_history.py
# ✅ FIXED v2.0: Complete Financial History Module with Corrected Field Names
# ✅ FIXED: OtherExpense field corrections (amount_ksh, created_at, category)
# ✅ FIXED: Respects rider onboarding date (no historical data before signup)
# ✅ FIXED: All 4 expense types now display correctly (income, fuel, service, other)
# ✅ FIXED: Date filtering aligned with selected range and rider history

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from uuid import UUID
from app.database import get_db
from app.models.rider import Rider
from app.models.trip import Trip
from app.models.fuel_entry import FuelEntry
from app.models.maintenance_entry import MaintenanceEntry
from app.models.other_expense import OtherExpense
from app.models.lipa_later_payment import LipaLaterPayment
from app.models.compliance_master_data import ComplianceRuleConfig
from app.services.quick_range_service import quick_range_bounds

router = APIRouter(prefix="/compliance/financial-history", tags=["sb-19"])


# ============================================================================
# UTILITY: Validate Rider Onboarding Date
# ============================================================================

def validate_period_against_rider(rider_id: str, period_start: datetime, db: Session) -> datetime:
    """
    ✅ FIXED: Clip period_start to rider's onboarding date.
    Ensures no historical data is shown for newly onboarded customers.
    
    Example:
    - Rider onboarded: Aug 18, 2024
    - Query period: Jul 1 - Aug 1 (Last Month)
    - Returned period: Aug 18 - Aug 1 (clipped to onboarding date)
    - Result: Empty (no transactions before Aug 18)
    """
    rider = db.query(Rider).filter(Rider.id == rider_id).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    # If period starts before rider onboarded, clip to onboarding date
    if rider.created_at and period_start < rider.created_at:
        return rider.created_at
    
    return period_start


# ============================================================================
# ENDPOINT: Get Financial Summary
# ============================================================================

@router.get("/summary")
def get_summary(
    rider_id: str = Query(..., description="Rider UUID"),
    quick_select: str = Query("this_month", description="Period: today | this_week | this_month | last_month"),
    db: Session = Depends(get_db)
):
    """
    RA-17-A/B: Financial History Summary — Net Profit, Income, Expenses by Category
    Returns: {range_start, range_end, income, total_expense, net_profit, breakdown[]}
    
    ✅ FIXED: All field names corrected for accurate data retrieval
    ✅ FIXED: Respects rider onboarding date
    ✅ FIXED: No historical transactions for newly onboarded customers
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider_id format")
    
    rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    start, end = quick_range_bounds(quick_select, datetime.now(timezone.utc), rider, db)
    
    # ✅ FIXED: Clip period to rider's onboarding date
    start = validate_period_against_rider(rider_id, start, db)
    
    # ✅ FIXED: Trip income with correct field names
    # Field corrections: amount (was fare_amount), recorded_at (was completed_at)
    income = sum(
        float(t.amount) for t in db.query(Trip).filter(
            Trip.rider_id == rider_uuid,
            Trip.status == "active",
            Trip.recorded_at.between(start, end)
        )
    )
    
    # ✅ NEW: Include Lipa Later payments in income
    lipa_later_income = sum(
        float(p.amount_ksh) for p in db.query(LipaLaterPayment).filter(
            LipaLaterPayment.rider_id == rider_uuid,
            LipaLaterPayment.payment_date.between(start.date(), end.date())
        )
    )
    income += lipa_later_income
    
    # ✅ FIXED: Fuel/Battery expense with correct fields
    # Field corrections: cost ✓, submitted_at ✓
    fuel_total = sum(
        float(f.cost) for f in db.query(FuelEntry).filter(
            FuelEntry.rider_id == rider_uuid,
            FuelEntry.submitted_at.between(start, end)
        )
    )
    
    # ✅ FIXED: Service/Maintenance expense with correct fields
    # Field corrections: cost ✓, submitted_at ✓
    service_total = sum(
        float(m.cost) for m in db.query(MaintenanceEntry).filter(
            MaintenanceEntry.rider_id == rider_uuid,
            MaintenanceEntry.submitted_at.between(start, end)
        )
    )
    
    # ✅ FIXED: Other expenses with CORRECTED field names
    # Field corrections:
    #   - created_at (NOT submitted_at) ✓
    #   - amount_ksh (NOT amount) ✓
    #   - category (NOT category_label_snapshot) ✓
    other_entries = db.query(OtherExpense).filter(
        OtherExpense.rider_id == rider_uuid,
        OtherExpense.created_at.between(start, end)  # ✅ FIXED: created_at
    ).all()
    
    other_total = sum(float(o.amount_ksh) for o in other_entries)  # ✅ FIXED: amount_ksh
    total_expense = fuel_total + service_total + other_total

    # ✅ FIXED: Breakdown includes all expense categories with correct field access
    by_category = {
        "Fuel/Energy": fuel_total,
        "Service": service_total
    }
    
    for o in other_entries:
        # ✅ FIXED: Use 'category' field (not category_label_snapshot)
        cat = o.category or "Other"
        by_category[cat] = by_category.get(cat, 0.0) + float(o.amount_ksh)
    
    # Filter out zero-value categories and sort by amount descending
    breakdown = sorted(
        [
            {
                "category": k,
                "amount": v,
                "pct": round(v / total_expense * 100, 1) if total_expense else 0
            }
            for k, v in by_category.items() if v > 0
        ],
        key=lambda row: row["amount"],
        reverse=True
    )

    return {
        "range_start": start.isoformat(),
        "range_end": end.isoformat(),
        "income": float(income),
        "total_expense": float(total_expense),
        "net_profit": float(income - total_expense),
        "breakdown": breakdown,
        "rider_onboarded": rider.created_at.isoformat() if rider.created_at else None
    }


# ============================================================================
# ENDPOINT: Get Transaction Details
# ============================================================================

@router.get("/transactions")
def get_transactions(
    rider_id: str = Query(..., description="Rider UUID"),
    quick_select: str = Query("this_month", description="Period: today | this_week | this_month | last_month"),
    type_filter: str = Query("all", description="Filter: all | trip | fuel | maintenance | other"),
    page: int = Query(1, ge=1, description="Page number for pagination"),
    db: Session = Depends(get_db)
):
    """
    RA-17-C: Transaction-Level Drill-Down
    
    Supports filter by type: all | trip | fuel | maintenance | other
    Marks voided trips and corrected transactions
    Returns newest transactions first
    Paginated response
    
    ✅ FIXED: All 4 expense types properly displayed
    ✅ FIXED: Respects rider onboarding date
    ✅ FIXED: Field names corrected for OtherExpense
    """
    try:
        rider_uuid = UUID(rider_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rider_id format")
    
    rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    start, end = quick_range_bounds(quick_select, datetime.now(timezone.utc), rider, db)
    
    # ✅ FIXED: Clip period to rider's onboarding date
    start = validate_period_against_rider(rider_id, start, db)
    
    # Get pagination config
    config = db.query(ComplianceRuleConfig).get(1)
    page_size = config.transaction_list_page_size if config else 20

    all_txns = []
    
    # ✅ FIXED: Trip transactions with correct field names
    # Fields: amount ✓, recorded_at ✓, status ✓, corrected_at ✓
    if type_filter in ("all", "trip"):
        for t in db.query(Trip).filter(
            Trip.rider_id == rider_uuid,
            Trip.recorded_at.between(start, end)
        ):
            all_txns.append({
                "type": "Trip",
                "ts": t.recorded_at.isoformat() if hasattr(t.recorded_at, 'isoformat') else str(t.recorded_at),
                "amount": float(t.amount),
                "voided": t.status == "voided",
                "corrected": t.corrected_at is not None
            })
    
    # ✅ FIXED: Fuel/Battery transactions with correct field names
    # Fields: cost ✓, submitted_at ✓
    if type_filter in ("all", "fuel"):
        for f in db.query(FuelEntry).filter(
            FuelEntry.rider_id == rider_uuid,
            FuelEntry.submitted_at.between(start, end)
        ):
            all_txns.append({
                "type": "Fuel",
                "ts": f.submitted_at.isoformat() if hasattr(f.submitted_at, 'isoformat') else str(f.submitted_at),
                "amount": float(f.cost),
                "voided": False,
                "corrected": False
            })
    
    # ✅ FIXED: Service/Maintenance transactions with correct field names
    # Fields: cost ✓, submitted_at ✓
    if type_filter in ("all", "maintenance"):
        for m in db.query(MaintenanceEntry).filter(
            MaintenanceEntry.rider_id == rider_uuid,
            MaintenanceEntry.submitted_at.between(start, end)
        ):
            all_txns.append({
                "type": "Service",
                "ts": m.submitted_at.isoformat() if hasattr(m.submitted_at, 'isoformat') else str(m.submitted_at),
                "amount": float(m.cost),
                "voided": False,
                "corrected": False
            })
    
    # ✅ FIXED: Other expenses with CORRECTED field names
    # Field corrections:
    #   - created_at (NOT submitted_at) ✓
    #   - amount_ksh (NOT amount) ✓
    #   - category (NOT category_label_snapshot) ✓
    if type_filter in ("all", "other"):
        for o in db.query(OtherExpense).filter(
            OtherExpense.rider_id == rider_uuid,
            OtherExpense.created_at.between(start, end)  # ✅ FIXED: created_at
        ):
            all_txns.append({
                "type": o.category or "Other",  # ✅ FIXED: category
                "ts": o.created_at.isoformat() if hasattr(o.created_at, 'isoformat') else str(o.created_at),
                "amount": float(o.amount_ksh),  # ✅ FIXED: amount_ksh
                "voided": False,
                "corrected": False
            })
    
    # ✅ NEW: Lipa Later payments as income transactions
    # Include Lipa Later payments in the transaction history
    if type_filter in ("all", "trip"):
        # Convert start and end to date objects for comparison with payment_date
        start_date = start.date() if hasattr(start, 'date') else start
        end_date = end.date() if hasattr(end, 'date') else end
        
        for lp in db.query(LipaLaterPayment).filter(
            LipaLaterPayment.rider_id == rider_uuid,
            LipaLaterPayment.payment_date.between(start_date, end_date)
        ):
            all_txns.append({
                "type": "Lipa Later Payment",
                "ts": datetime.combine(lp.payment_date, datetime.min.time()).isoformat() if lp.payment_date else datetime.now(timezone.utc).isoformat(),
                "amount": float(lp.amount_ksh) if lp.amount_ksh else 0.0,
                "voided": False,
                "corrected": False
            })

    # ✅ FIXED: Sort by timestamp, newest first
    all_txns.sort(key=lambda t: t["ts"], reverse=True)
    
    # ✅ FIXED: Pagination
    total = len(all_txns)
    total_pages = max(1, -(-total // page_size))
    page_items = all_txns[(page - 1) * page_size : page * page_size]
    
    return {
        "items": page_items,
        "page": page,
        "total_pages": total_pages,
        "total": total,
        "range_start": start.isoformat(),
        "range_end": end.isoformat(),
        "rider_onboarded": rider.created_at.isoformat() if rider.created_at else None
    }