# backend/app/routers/sb19_financial_history.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database import get_db
from app.models.rider import Rider
from app.models.trip import Trip
from app.models.fuel_entry import FuelEntry
from app.models.maintenance_entry import MaintenanceEntry
from app.models.other_expense import OtherExpense
from app.models.compliance_master_data import ComplianceRuleConfig
from app.services.quick_range_service import quick_range_bounds

router = APIRouter(prefix="/compliance/financial-history", tags=["sb-19"])

@router.get("/summary")
def get_summary(rider_id: str, quick_select: str, db: Session = Depends(get_db)):
    """
    RA-17-A/B: Financial History Summary — Net Profit, Income, Expenses by Category
    Returns: {range_start, range_end, income, total_expense, net_profit, breakdown[]}
    BR-SB19-005: Fixed Trip column names (amount / recorded_at, not fare_amount / completed_at)
    BR-SB19-006: Fixed category breakdown — distinct categories, sorted by amount descending
    """
    rider = db.query(Rider).get(rider_id)
    start, end = quick_range_bounds(quick_select, datetime.now(timezone.utc), rider, db)

    # BR-SB19-005: Trip's real columns are `amount` / `recorded_at`
    # (see app/models/trip.py) — earlier code queried non-existent fields
    income = sum(float(t.amount) for t in db.query(Trip)
                  .filter(Trip.rider_id == rider_id, Trip.status == "active", Trip.recorded_at.between(start, end)))
    
    fuel_total = sum(float(f.cost) for f in db.query(FuelEntry)
                     .filter(FuelEntry.rider_id == rider_id, FuelEntry.submitted_at.between(start, end)))
    
    service_total = sum(float(m.cost) for m in db.query(MaintenanceEntry)
                        .filter(MaintenanceEntry.rider_id == rider_id, MaintenanceEntry.submitted_at.between(start, end)))
    
    other_entries = db.query(OtherExpense).filter(OtherExpense.rider_id == rider_id, 
                                                   OtherExpense.submitted_at.between(start, end)).all()
    other_total = sum(float(o.amount) for o in other_entries)
    total_expense = fuel_total + service_total + other_total

    # BR-SB19-006: fixed categories + distinct Other Expense categories, sorted by amount descending, zero-value omitted
    by_category = {"Fuel/Energy": fuel_total, "Service": service_total}
    for o in other_entries:
        by_category[o.category_label_snapshot] = by_category.get(o.category_label_snapshot, 0) + float(o.amount)
    
    breakdown = sorted(
        [{"category": k, "amount": v, "pct": round(v / total_expense * 100, 1) if total_expense else 0}
         for k, v in by_category.items() if v > 0],
        key=lambda row: row["amount"], reverse=True)

    return {
        "range_start": start.isoformat(),
        "range_end": end.isoformat(),
        "income": float(income),
        "total_expense": float(total_expense),
        "net_profit": float(income - total_expense),
        "breakdown": breakdown
    }

# BR-SB19-007/008/009/010: all 4 types by default, single-type filter, Voided/Corrected markers, newest first, paginated
@router.get("/transactions")
def get_transactions(rider_id: str, quick_select: str, type_filter: str = "all", page: int = 1, db: Session = Depends(get_db)):
    """
    RA-17-C: Transaction-Level Drill-Down
    Supports filter by type: all | trip | fuel | maintenance | other
    Marks voided trips and corrected transactions
    Returns newest transactions first (BR-SB19-009)
    Paginated response
    """
    rider = db.query(Rider).get(rider_id)
    start, end = quick_range_bounds(quick_select, datetime.now(timezone.utc), rider, db)
    config = db.query(ComplianceRuleConfig).get(1)
    page_size = config.transaction_list_page_size if config else 20

    all_txns = []
    
    # BR-SB19-007: Include all 4 transaction types
    if type_filter in ("all", "trip"):
        for t in db.query(Trip).filter(Trip.rider_id == rider_id, Trip.recorded_at.between(start, end)):
            # BR-SB19-008: voided/corrected marked, not hidden
            all_txns.append({
                "type": "Trip",
                "ts": t.recorded_at.isoformat() if hasattr(t.recorded_at, 'isoformat') else str(t.recorded_at),
                "amount": float(t.amount),
                "voided": t.status == "voided",
                "corrected": t.corrected_at is not None
            })
    
    if type_filter in ("all", "fuel"):
        for f in db.query(FuelEntry).filter(FuelEntry.rider_id == rider_id, FuelEntry.submitted_at.between(start, end)):
            all_txns.append({
                "type": "Fuel",
                "ts": f.submitted_at.isoformat() if hasattr(f.submitted_at, 'isoformat') else str(f.submitted_at),
                "amount": float(f.cost),
                "voided": False,
                "corrected": False
            })
    
    if type_filter in ("all", "maintenance"):
        for m in db.query(MaintenanceEntry).filter(MaintenanceEntry.rider_id == rider_id, MaintenanceEntry.submitted_at.between(start, end)):
            all_txns.append({
                "type": "Service",
                "ts": m.submitted_at.isoformat() if hasattr(m.submitted_at, 'isoformat') else str(m.submitted_at),
                "amount": float(m.cost),
                "voided": False,
                "corrected": False
            })
    
    if type_filter in ("all", "other"):
        for o in db.query(OtherExpense).filter(OtherExpense.rider_id == rider_id, OtherExpense.submitted_at.between(start, end)):
            all_txns.append({
                "type": o.category_label_snapshot,
                "ts": o.submitted_at.isoformat() if hasattr(o.submitted_at, 'isoformat') else str(o.submitted_at),
                "amount": float(o.amount),
                "voided": False,
                "corrected": False
            })

    # BR-SB19-009: newest first
    all_txns.sort(key=lambda t: t["ts"], reverse=True)
    
    total = len(all_txns)
    total_pages = max(1, -(-total // page_size))
    page_items = all_txns[(page - 1) * page_size : page * page_size]
    
    return {
        "items": page_items,
        "page": page,
        "total_pages": total_pages,
        "total": total
    }