# backend/app/services/net_profit_service.py
# ✅ FIXED: Now properly aggregates Fuel, Battery, and Service costs from BOTH legacy tables AND OtherExpense
from sqlalchemy.orm import Session
from app.models.trip import Trip
from app.models.fuel_entry import FuelEntry
from app.models.maintenance_entry import MaintenanceEntry
from app.models.other_expense import OtherExpense
from app.services.period_range_service import today_week_month_bounds


# BR-SB13-001/002: Net Profit = Income (active trips only) minus Fuel/Energy + Service + Other Expense.
# Nothing here is ever stored — it is recomputed from source records every single time it's requested.
# ✅ FIXED: Now includes fuel, battery, and service costs from OtherExpense records as well
def _net_profit_for_bounds(db: Session, rider_id: str, start, end) -> dict:
    # BUG FIX: Trip's real columns are `amount` / `recorded_at` (see app/models/trip.py) --
    # this previously queried `fare_amount` / `completed_at`, neither of which exist, so this
    # would raise AttributeError/InvalidRequestError on first real use.
    income = (db.query(Trip)
        .filter(Trip.rider_id == rider_id, Trip.status == "active", Trip.recorded_at.between(start, end))
        .with_entities(Trip.amount).all())
    income_total = sum(float(t.amount) for t in income)

    # ✅ FIXED: Calculate fuel costs from BOTH FuelEntry table and OtherExpense records with Fuel/Battery category
    fuel_from_legacy = sum(float(f.cost) for f in db.query(FuelEntry)
                     .filter(FuelEntry.rider_id == rider_id, FuelEntry.submitted_at.between(start, end)))
    
    fuel_from_other = sum(float(o.amount_ksh) for o in db.query(OtherExpense)
        .filter(OtherExpense.rider_id == rider_id, OtherExpense.created_at.between(start, end), 
                OtherExpense.category.in_(['Fuel', 'Battery'])))
    
    fuel_total = fuel_from_legacy + fuel_from_other

    # ✅ FIXED: Calculate service costs from BOTH MaintenanceEntry table and OtherExpense records with Service category
    service_from_legacy = sum(float(m.cost) for m in db.query(MaintenanceEntry)
                        .filter(MaintenanceEntry.rider_id == rider_id, MaintenanceEntry.submitted_at.between(start, end)))
    
    service_from_other = sum(float(o.amount_ksh) for o in db.query(OtherExpense)
        .filter(OtherExpense.rider_id == rider_id, OtherExpense.created_at.between(start, end), 
                OtherExpense.category == 'Service'))
    
    service_total = service_from_legacy + service_from_other

    # ✅ FIXED: OtherExpense uses created_at (not submitted_at) and amount_ksh (not amount)
    # Get all other expenses that are NOT Fuel/Battery/Service (those are handled above)
    other_entries = (db.query(OtherExpense)
        .filter(OtherExpense.rider_id == rider_id, OtherExpense.created_at.between(start, end),
                ~OtherExpense.category.in_(['Fuel', 'Battery', 'Service']))  # ✅ FIXED: Exclude Fuel/Battery/Service
        .all())
    other_total = sum(float(o.amount_ksh) for o in other_entries)

    expense_total = fuel_total + service_total + other_total
    net_profit = income_total - expense_total  # EXC-SB13-004: allowed to be negative, never clamped

    # BR-SB13-004/005: breakdown, largest first, zero-spend categories omitted
    # ✅ FIXED: Build breakdown including both legacy and OtherExpense sources
    by_category = {"Fuel/Energy": fuel_total, "Service": service_total}
    
    # Add other expense categories (excluding Fuel/Battery/Service which are already handled)
    for o in other_entries:
        # ✅ FIXED: OtherExpense model has 'category' (not category_label_snapshot)
        by_category[o.category] = by_category.get(o.category, 0) + float(o.amount_ksh)
    
    breakdown = sorted(
        [{"category": k, "amount": v, "pct": round(v / expense_total * 100, 1) if expense_total else 0}
         for k, v in by_category.items() if v > 0],
        key=lambda row: row["amount"], reverse=True)

    return {"net_profit": net_profit, "income": income_total, "total_expense": expense_total, "breakdown": breakdown}


def net_profit_summary(db: Session, rider_id: str, period: str, now) -> dict:
    start, end = today_week_month_bounds(period, now)
    return _net_profit_for_bounds(db, rider_id, start, end)


# AUDIT FIX (blocking): sb20_statements.py has always imported `net_profit_summary_for_range`
# from this module for arbitrary period_start/period_end statement generation -- it never
# existed, so importing sb20_statements.py (and therefore starting the app, since main.py
# registers it) raised ImportError. Shares the same underlying calculation as the function above.
def net_profit_summary_for_range(db: Session, rider_id: str, period_start, period_end) -> dict:
    return _net_profit_for_bounds(db, rider_id, period_start, period_end)