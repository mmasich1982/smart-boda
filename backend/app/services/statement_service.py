# Fixed Statement Service - Backend
# File: backend/app/services/statement_service.py

from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.trip import Trip
from app.models.fuel_entry import FuelEntry
from app.models.maintenance_entry import MaintenanceEntry
from app.models.other_expense import OtherExpense  # FIX #6: Import
from app.models.savings_contribution import SavingsContribution
from app.models.lipa_later_payment import LipaLaterPayment
from app.models.rider import Rider

# ✅ FIX (ImportError: cannot import name 'verify_statement' from
# 'app.services.statement_service'):
# app/routers/sb20_statements.py has always done
#   from app.services.statement_service import verify_statement
# but this module never defined that name - only the StatementService class
# above (generate_statement / generate_html_statement) existed. Because
# sb20_statements.py was never registered in app/main.py until now, this
# ImportError never surfaced; the moment the router is imported (to be
# mounted), Python fails to import this name and the whole app crashes on
# startup. Added below, alongside (not instead of) everything already in
# this file.
import uuid
from app.models.statement import Statement

class StatementService:
    """
    Service for generating financial statements.
    FIX #6: Now includes other expenses in statement generation.
    """
    
    @staticmethod
    def generate_statement(
        db: Session,
        rider_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> dict:
        """
        Generate a comprehensive financial statement for a rider.
        FIX #6.1: Statement now includes other expenses.
        """
        
        # Get rider info
        rider = db.query(Rider).filter(Rider.id == rider_id).first()
        if not rider:
            raise ValueError("Rider not found")
        
        # Get all transactions
        trips = db.query(Trip).filter(
            Trip.rider_id == rider_id,
            Trip.created_at >= start_date,
            Trip.created_at <= end_date
        ).all()
        
        fuel_entries = db.query(FuelEntry).filter(
            FuelEntry.rider_id == rider_id,
            FuelEntry.created_at >= start_date,
            FuelEntry.created_at <= end_date
        ).all()
        
        maintenance_entries = db.query(MaintenanceEntry).filter(
            MaintenanceEntry.rider_id == rider_id,
            MaintenanceEntry.created_at >= start_date,
            MaintenanceEntry.created_at <= end_date
        ).all()
        
        # FIX #6.2: Get other expenses
        other_expenses = db.query(OtherExpense).filter(
            OtherExpense.rider_id == rider_id,
            OtherExpense.expense_date >= start_date,
            OtherExpense.expense_date <= end_date
        ).all()
        
        savings_contributions = db.query(SavingsContribution).filter(
            SavingsContribution.rider_id == rider_id,
            SavingsContribution.created_at >= start_date,
            SavingsContribution.created_at <= end_date
        ).all()
        
        lipa_later_payments = db.query(LipaLaterPayment).filter(
            LipaLaterPayment.rider_id == rider_id,
            LipaLaterPayment.created_at >= start_date,
            LipaLaterPayment.created_at <= end_date
        ).all()
        
        # Calculate totals
        revenue = sum(t.fare_amount for t in trips if t.fare_amount) if trips else 0
        fuel_total = sum(f.amount for f in fuel_entries if f.amount) if fuel_entries else 0
        maintenance_total = sum(m.cost for m in maintenance_entries if m.cost) if maintenance_entries else 0
        
        # FIX #6.3: Calculate other expenses total
        other_expenses_total = sum(o.amount for o in other_expenses if o.amount) if other_expenses else 0
        
        savings_total = sum(s.amount for s in savings_contributions if s.amount) if savings_contributions else 0
        lipa_later_total = sum(p.amount for p in lipa_later_payments if p.amount) if lipa_later_payments else 0
        
        # FIX #6.4: Include other expenses in total expenses
        total_expenses = fuel_total + maintenance_total + other_expenses_total + savings_total + lipa_later_total
        
        net_profit = revenue - total_expenses
        
        return {
            "statement_id": f"STM-{rider_id}-{start_date.strftime('%Y%m%d')}-{end_date.strftime('%Y%m%d')}",
            "rider": {
                "id": rider.id,
                "name": rider.name,
                "phone": rider.phone
            },
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "days": (end_date - start_date).days + 1
            },
            "summary": {
                "revenue": revenue,
                "total_expenses": total_expenses,
                "net_profit": net_profit,
                "margin_percentage": (net_profit / revenue * 100) if revenue > 0 else 0
            },
            "revenue_details": {
                "total_trips": len(trips),
                "total_revenue": revenue,
                "average_per_trip": (revenue / len(trips)) if trips else 0,
                "trips": [
                    {
                        "id": t.id,
                        "date": t.created_at.isoformat(),
                        "from": t.pickup_location,
                        "to": t.dropoff_location,
                        "fare": t.fare_amount,
                        "distance": t.distance,
                        "duration": t.duration
                    }
                    for t in trips
                ]
            },
            "expense_details": {
                "fuel": {
                    "total": fuel_total,
                    "count": len(fuel_entries),
                    "percentage": (fuel_total / total_expenses * 100) if total_expenses > 0 else 0,
                    "entries": [
                        {
                            "id": f.id,
                            "date": f.created_at.isoformat(),
                            "type": f.fuel_type,
                            "amount": f.amount,
                            "quantity": f.quantity
                        }
                        for f in fuel_entries
                    ]
                },
                "maintenance": {
                    "total": maintenance_total,
                    "count": len(maintenance_entries),
                    "percentage": (maintenance_total / total_expenses * 100) if total_expenses > 0 else 0,
                    "entries": [
                        {
                            "id": m.id,
                            "date": m.created_at.isoformat(),
                            "type": m.service_type_code,
                            "amount": m.cost,
                            "provider": m.service_provider
                        }
                        for m in maintenance_entries
                    ]
                },
                # FIX #6.5: Add other expenses to statement
                "other_expenses": {
                    "total": other_expenses_total,
                    "count": len(other_expenses),
                    "percentage": (other_expenses_total / total_expenses * 100) if total_expenses > 0 else 0,
                    "entries": [
                        {
                            "id": o.id,
                            "date": o.expense_date.isoformat(),
                            "category": o.category,
                            "amount": o.amount,
                            "description": o.description
                        }
                        for o in other_expenses
                    ]
                },
                "savings": {
                    "total": savings_total,
                    "count": len(savings_contributions),
                    "percentage": (savings_total / total_expenses * 100) if total_expenses > 0 else 0
                },
                "lipa_later": {
                    "total": lipa_later_total,
                    "count": len(lipa_later_payments),
                    "percentage": (lipa_later_total / total_expenses * 100) if total_expenses > 0 else 0
                }
            },
            "expense_breakdown": {  # FIX #6.6: Updated breakdown includes other expenses
                "fuel": fuel_total,
                "maintenance": maintenance_total,
                "other_expenses": other_expenses_total,
                "savings": savings_total,
                "lipa_later": lipa_later_total,
                "total": total_expenses
            },
            "generated_at": datetime.utcnow().isoformat()
        }
    
    @staticmethod
    def generate_html_statement(
        db: Session,
        rider_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> str:
        """
        Generate an HTML version of the financial statement.
        FIX #6.7: HTML includes other expenses section.
        """
        
        statement = StatementService.generate_statement(db, rider_id, start_date, end_date)
        
        html = f"""
        <html>
        <head>
            <title>Financial Statement - {statement['rider']['name']}</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 20px; }}
                .header {{ text-align: center; margin-bottom: 30px; }}
                .section {{ margin: 20px 0; padding: 15px; border: 1px solid #ddd; }}
                .summary {{ background-color: #f0f0f0; }}
                table {{ width: 100%; border-collapse: collapse; margin: 10px 0; }}
                th, td {{ border: 1px solid #ccc; padding: 8px; text-align: left; }}
                th {{ background-color: #333; color: white; }}
                .total {{ font-weight: bold; background-color: #f9f9f9; }}
                .amount {{ text-align: right; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Financial Statement</h1>
                <p>{statement['rider']['name']} ({statement['rider']['id']})</p>
                <p>{statement['period']['start']} to {statement['period']['end']}</p>
            </div>
            
            <div class="section summary">
                <h2>Summary</h2>
                <table>
                    <tr>
                        <td>Total Revenue</td>
                        <td class="amount">KSh {statement['summary']['revenue']:,.2f}</td>
                    </tr>
                    <tr>
                        <td>Total Expenses</td>
                        <td class="amount">KSh {statement['summary']['total_expenses']:,.2f}</td>
                    </tr>
                    <tr class="total">
                        <td>Net Profit</td>
                        <td class="amount">KSh {statement['summary']['net_profit']:,.2f}</td>
                    </tr>
                    <tr>
                        <td>Profit Margin</td>
                        <td class="amount">{statement['summary']['margin_percentage']:.1f}%</td>
                    </tr>
                </table>
            </div>
            
            <div class="section">
                <h2>Revenue Details</h2>
                <p>Total Trips: {statement['revenue_details']['total_trips']}</p>
                <p>Average per Trip: KSh {statement['revenue_details']['average_per_trip']:,.2f}</p>
            </div>
            
            <div class="section">
                <h2>Expense Breakdown</h2>
                <table>
                    <tr>
                        <th>Category</th>
                        <th>Count</th>
                        <th class="amount">Amount</th>
                        <th class="amount">% of Total</th>
                    </tr>
                    <tr>
                        <td>Fuel</td>
                        <td>{statement['expense_details']['fuel']['count']}</td>
                        <td class="amount">KSh {statement['expense_details']['fuel']['total']:,.2f}</td>
                        <td class="amount">{statement['expense_details']['fuel']['percentage']:.1f}%</td>
                    </tr>
                    <tr>
                        <td>Maintenance</td>
                        <td>{statement['expense_details']['maintenance']['count']}</td>
                        <td class="amount">KSh {statement['expense_details']['maintenance']['total']:,.2f}</td>
                        <td class="amount">{statement['expense_details']['maintenance']['percentage']:.1f}%</td>
                    </tr>
                    <tr>
                        <td>Other Expenses</td>
                        <td>{statement['expense_details']['other_expenses']['count']}</td>
                        <td class="amount">KSh {statement['expense_details']['other_expenses']['total']:,.2f}</td>
                        <td class="amount">{statement['expense_details']['other_expenses']['percentage']:.1f}%</td>
                    </tr>
                    <tr>
                        <td>Savings</td>
                        <td>{statement['expense_details']['savings']['count']}</td>
                        <td class="amount">KSh {statement['expense_details']['savings']['total']:,.2f}</td>
                        <td class="amount">{statement['expense_details']['savings']['percentage']:.1f}%</td>
                    </tr>
                    <tr>
                        <td>Lipa Later Payments</td>
                        <td>{statement['expense_details']['lipa_later']['count']}</td>
                        <td class="amount">KSh {statement['expense_details']['lipa_later']['total']:,.2f}</td>
                        <td class="amount">{statement['expense_details']['lipa_later']['percentage']:.1f}%</td>
                    </tr>
                    <tr class="total">
                        <td>TOTAL EXPENSES</td>
                        <td></td>
                        <td class="amount">KSh {statement['expense_details']['fuel']['total'] + statement['expense_details']['maintenance']['total'] + statement['expense_details']['other_expenses']['total'] + statement['expense_details']['savings']['total'] + statement['expense_details']['lipa_later']['total']:,.2f}</td>
                        <td class="amount">100%</td>
                    </tr>
                </table>
            </div>
            
            <div class="section">
                <p style="font-size: 12px; color: #666;">Generated on {statement['generated_at']}</p>
            </div>
        </body>
        </html>
        """
        
        return html


# ✅ FIX (ImportError - see the comment near the top of this file for the
# full explanation): app/routers/sb20_statements.py needs a module-level
# verify_statement(db, statement) function, separate from the
# StatementService class above.
def verify_statement(db: Session, statement: Statement) -> Statement:
    """
    BR-SB20-004: Verify a statement by assigning it a verification reference
    and marking it verified. Figures on the statement itself are never
    recalculated here (BR-SB20-001/009: fixed forever at generation moment) -
    this only stamps the verification.

    Idempotent: called both when a statement is generated online
    (sb20_statements.generate_statement) and later, potentially more than
    once, when an offline-generated statement retries verification after
    syncing (sb20_statements.retry_verification). Re-verifying an
    already-verified statement is a no-op and keeps its existing reference.
    """
    if not statement.verified or not statement.verification_reference:
        # Short, human-shareable reference (fits the verification_reference
        # column, String(20)) e.g. "STMT-4F9A2B7C1D"
        statement.verification_reference = f"STMT-{uuid.uuid4().hex[:10].upper()}"
        statement.verified = True
        db.commit()
        db.refresh(statement)

    return statement