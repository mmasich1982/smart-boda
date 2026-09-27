# Fixed Net Profit Service - Backend
# File: backend/app/services/net_profit_service.py

from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.models.trip import Trip
from app.models.fuel_entry import FuelEntry
from app.models.maintenance_entry import MaintenanceEntry
from app.models.other_expense import OtherExpense  # FIX #4: Import OtherExpense
from app.models.savings_contribution import SavingsContribution
from app.models.lipa_later_payment import LipaLaterPayment

class NetProfitService:
    """
    Service for calculating net profit.
    FIX #4: Now includes other expenses in calculations.
    """
    
    @staticmethod
    def calculate_net_profit(
        db: Session,
        rider_id: str,
        start_date: datetime = None,
        end_date: datetime = None
    ) -> dict:
        """
        Calculate net profit = Revenue - (Fuel + Maintenance + Other Expenses + Savings + Lipa Later Payments)
        
        FIX #4.1: Includes other expenses in the calculation.
        """
        
        # Default to current month if dates not provided
        if not start_date:
            start_date = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if not end_date:
            end_date = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # 1. Calculate revenue from trips
        trips = db.query(Trip).filter(
            Trip.rider_id == rider_id,
            Trip.created_at >= start_date,
            Trip.created_at <= end_date
        ).all()
        
        revenue = sum(trip.fare_amount for trip in trips if trip.fare_amount) if trips else 0
        
        # 2. Calculate fuel expenses
        fuel_entries = db.query(FuelEntry).filter(
            FuelEntry.rider_id == rider_id,
            FuelEntry.created_at >= start_date,
            FuelEntry.created_at <= end_date
        ).all()
        
        fuel_total = sum(entry.amount for entry in fuel_entries if entry.amount) if fuel_entries else 0
        
        # 3. Calculate maintenance expenses
        maintenance_entries = db.query(MaintenanceEntry).filter(
            MaintenanceEntry.rider_id == rider_id,
            MaintenanceEntry.created_at >= start_date,
            MaintenanceEntry.created_at <= end_date
        ).all()
        
        maintenance_total = sum(entry.cost for entry in maintenance_entries if entry.cost) if maintenance_entries else 0
        
        # FIX #4.2: Get OTHER expenses (this was missing before!)
        other_expenses = db.query(OtherExpense).filter(
            OtherExpense.rider_id == rider_id,
            OtherExpense.expense_date >= start_date,
            OtherExpense.expense_date <= end_date
        ).all()
        
        other_expenses_total = sum(entry.amount for entry in other_expenses if entry.amount) if other_expenses else 0
        
        # 4. Calculate savings contributions
        savings_contributions = db.query(SavingsContribution).filter(
            SavingsContribution.rider_id == rider_id,
            SavingsContribution.created_at >= start_date,
            SavingsContribution.created_at <= end_date
        ).all()
        
        savings_total = sum(contrib.amount for contrib in savings_contributions if contrib.amount) if savings_contributions else 0
        
        # 5. Calculate Lipa Later payments
        lipa_later_payments = db.query(LipaLaterPayment).filter(
            LipaLaterPayment.rider_id == rider_id,
            LipaLaterPayment.created_at >= start_date,
            LipaLaterPayment.created_at <= end_date
        ).all()
        
        lipa_later_total = sum(payment.amount for payment in lipa_later_payments if payment.amount) if lipa_later_payments else 0
        
        # FIX #4.3: Calculate total expenses including other expenses
        total_expenses = fuel_total + maintenance_total + other_expenses_total + savings_total + lipa_later_total
        
        # FIX #4.4: Calculate net profit
        net_profit = revenue - total_expenses
        
        return {
            "revenue": revenue,
            "expenses": {
                "fuel": fuel_total,
                "maintenance": maintenance_total,
                "other": other_expenses_total,  # FIX #4.5: Include in response
                "savings": savings_total,
                "lipa_later": lipa_later_total,
                "total": total_expenses
            },
            "net_profit": net_profit,
            "margin_percentage": (net_profit / revenue * 100) if revenue > 0 else 0,
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat()
            },
            "expense_breakdown": {
                "fuel_percentage": (fuel_total / total_expenses * 100) if total_expenses > 0 else 0,
                "maintenance_percentage": (maintenance_total / total_expenses * 100) if total_expenses > 0 else 0,
                "other_percentage": (other_expenses_total / total_expenses * 100) if total_expenses > 0 else 0,  # FIX #4.6: Add percentage
                "savings_percentage": (savings_total / total_expenses * 100) if total_expenses > 0 else 0,
                "lipa_later_percentage": (lipa_later_total / total_expenses * 100) if total_expenses > 0 else 0
            }
        }
    
    @staticmethod
    def get_daily_net_profit(
        db: Session,
        rider_id: str,
        date: datetime = None
    ) -> dict:
        """Calculate net profit for a specific day."""
        
        if not date:
            date = datetime.now()
        
        start_date = date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = date.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        return NetProfitService.calculate_net_profit(db, rider_id, start_date, end_date)
    
    @staticmethod
    def get_weekly_net_profit(
        db: Session,
        rider_id: str,
        date: datetime = None
    ) -> dict:
        """Calculate net profit for the week containing the given date."""
        
        if not date:
            date = datetime.now()
        
        # Get Monday of the week
        start_date = date - timedelta(days=date.weekday())
        start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Get Sunday of the week
        end_date = start_date + timedelta(days=6)
        end_date = end_date.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        return NetProfitService.calculate_net_profit(db, rider_id, start_date, end_date)
    
    @staticmethod
    def get_monthly_net_profit(
        db: Session,
        rider_id: str,
        date: datetime = None
    ) -> dict:
        """Calculate net profit for the month containing the given date."""
        
        if not date:
            date = datetime.now()
        
        start_date = date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Get last day of month
        if date.month == 12:
            end_date = date.replace(year=date.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            end_date = date.replace(month=date.month + 1, day=1) - timedelta(days=1)
        
        end_date = end_date.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        return NetProfitService.calculate_net_profit(db, rider_id, start_date, end_date)
    
    @staticmethod
    def get_expense_summary(
        db: Session,
        rider_id: str,
        start_date: datetime = None,
        end_date: datetime = None
    ) -> dict:
        """
        Get a summary of all expenses by category.
        FIX #4.7: Now includes other expenses categorization.
        """
        
        if not start_date:
            start_date = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if not end_date:
            end_date = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # Get all expenses
        fuel = db.query(FuelEntry).filter(
            FuelEntry.rider_id == rider_id,
            FuelEntry.created_at >= start_date,
            FuelEntry.created_at <= end_date
        ).all()
        
        maintenance = db.query(MaintenanceEntry).filter(
            MaintenanceEntry.rider_id == rider_id,
            MaintenanceEntry.created_at >= start_date,
            MaintenanceEntry.created_at <= end_date
        ).all()
        
        # FIX #4.8: Get other expenses and organize by category
        other = db.query(OtherExpense).filter(
            OtherExpense.rider_id == rider_id,
            OtherExpense.expense_date >= start_date,
            OtherExpense.expense_date <= end_date
        ).all()
        
        # Organize other expenses by category
        other_by_category = {}
        for expense in other:
            category = expense.category
            if category not in other_by_category:
                other_by_category[category] = {
                    "total": 0,
                    "count": 0,
                    "entries": []
                }
            other_by_category[category]["total"] += expense.amount
            other_by_category[category]["count"] += 1
            other_by_category[category]["entries"].append({
                "id": expense.id,
                "amount": expense.amount,
                "description": expense.description,
                "date": expense.expense_date.isoformat()
            })
        
        return {
            "fuel": {
                "total": sum(f.amount for f in fuel if f.amount),
                "count": len(fuel),
                "entries": [
                    {
                        "id": f.id,
                        "amount": f.amount,
                        "type": f.fuel_type,
                        "date": f.created_at.isoformat()
                    }
                    for f in fuel
                ]
            },
            "maintenance": {
                "total": sum(m.cost for m in maintenance if m.cost),
                "count": len(maintenance),
                "entries": [
                    {
                        "id": m.id,
                        "amount": m.cost,
                        "type": m.service_type_code,
                        "date": m.created_at.isoformat()
                    }
                    for m in maintenance
                ]
            },
            "other": {  # FIX #4.9: Include organized other expenses
                "by_category": other_by_category,
                "total": sum(o.amount for o in other if o.amount),
                "count": len(other)
            }
        }


# ✅ FIX (ImportError: cannot import name 'net_profit_summary_for_range'):
# app/routers/sb20_statements.py has always done
#   from app.services.net_profit_service import net_profit_summary_for_range
# but only the NetProfitService class above was ever defined in this file -
# this module-level function never existed. Because sb20_statements was never
# registered in app/main.py until now, this ImportError never surfaced; the
# moment the router is imported (to be mounted), Python fails to import this
# name and the whole app crashes on startup.
#
# This is a thin adapter: it converts the date-only period bounds used by a
# Statement (BR-SB20-002: figures come only from the carried-forward
# Financial History range, period_start/period_end are plain `date` objects -
# see StatementRequest in app/schemas/compliance_history.py) into full-day
# datetime bounds, then reshapes NetProfitService.calculate_net_profit()'s
# richer response into the flat {"income", "total_expense", "net_profit"}
# shape that Statement's columns (and sb20_statements.generate_statement)
# expect.
def net_profit_summary_for_range(db: Session, rider_id: str, period_start, period_end) -> dict:
    """
    BR-SB20-002: Figures for a Statement come only from the carried-forward
    Financial History range, never projected forward.
    """
    start_dt = datetime.combine(period_start, datetime.min.time())
    end_dt = datetime.combine(period_end, datetime.max.time())

    result = NetProfitService.calculate_net_profit(db, rider_id, start_dt, end_dt)

    return {
        "income": result["revenue"],
        "total_expense": result["expenses"]["total"],
        "net_profit": result["net_profit"],
    }