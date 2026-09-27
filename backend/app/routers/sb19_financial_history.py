# Fixed Financial History Router - Backend
# File: backend/app/routers/sb19_financial_history.py

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from app.database import get_db
from app.models.trip import Trip
from app.models.fuel_entry import FuelEntry
from app.models.maintenance_entry import MaintenanceEntry
from app.models.other_expense import OtherExpense  # FIX #11: Import
from app.models.savings_contribution import SavingsContribution
from app.models.lipa_later_payment import LipaLaterPayment
from app.models.rider import Rider
from typing import Optional, List

router = APIRouter(prefix="/financial", tags=["financial"])

@router.get("/history/{rider_id}")
async def get_financial_history(
    rider_id: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    transaction_type: Optional[str] = Query(None),  # trip, fuel, maintenance, other_expense, etc.
    skip: int = Query(0),
    limit: int = Query(50),
    db: Session = Depends(get_db)
):
    """
    Get complete financial history including all transaction types.
    FIX #11.1: Now includes other_expense transactions.
    """
    try:
        # Verify rider exists
        rider = db.query(Rider).filter(Rider.id == rider_id).first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        
        # Parse dates
        start = None
        end = None
        if start_date:
            try:
                start = datetime.fromisoformat(start_date)
            except ValueError:
                pass
        if end_date:
            try:
                end = datetime.fromisoformat(end_date)
                end = end + timedelta(days=1)
            except ValueError:
                pass
        
        transactions = []
        
        # Get trips (income)
        if not transaction_type or transaction_type == 'trip':
            trips_query = db.query(Trip).filter(Trip.rider_id == rider_id)
            if start:
                trips_query = trips_query.filter(Trip.created_at >= start)
            if end:
                trips_query = trips_query.filter(Trip.created_at < end)
            
            trips = trips_query.order_by(Trip.created_at.desc()).all()
            for trip in trips:
                transactions.append({
                    "type": "trip",
                    "category": "income",
                    "id": str(trip.id),
                    "amount": trip.fare_amount,
                    "date": trip.created_at.isoformat(),
                    "description": f"Trip - {trip.pickup_location} → {trip.dropoff_location}",
                    "details": {
                        "distance": trip.distance,
                        "duration": trip.duration,
                        "payment_method": trip.payment_method
                    }
                })
        
        # Get fuel expenses
        if not transaction_type or transaction_type == 'fuel':
            fuel_query = db.query(FuelEntry).filter(FuelEntry.rider_id == rider_id)
            if start:
                fuel_query = fuel_query.filter(FuelEntry.created_at >= start)
            if end:
                fuel_query = fuel_query.filter(FuelEntry.created_at < end)
            
            fuel_entries = fuel_query.order_by(FuelEntry.created_at.desc()).all()
            for fuel in fuel_entries:
                transactions.append({
                    "type": "fuel",
                    "category": "expense",
                    "id": str(fuel.id),
                    "amount": fuel.amount,
                    "date": fuel.created_at.isoformat(),
                    "description": f"Fuel - {fuel.fuel_type}",
                    "details": {
                        "fuel_type": fuel.fuel_type,
                        "quantity": fuel.quantity,
                        "unit_price": fuel.unit_price
                    }
                })
        
        # Get maintenance expenses
        if not transaction_type or transaction_type == 'maintenance':
            maint_query = db.query(MaintenanceEntry).filter(MaintenanceEntry.rider_id == rider_id)
            if start:
                maint_query = maint_query.filter(MaintenanceEntry.created_at >= start)
            if end:
                maint_query = maint_query.filter(MaintenanceEntry.created_at < end)
            
            maint_entries = maint_query.order_by(MaintenanceEntry.created_at.desc()).all()
            for maint in maint_entries:
                transactions.append({
                    "type": "maintenance",
                    "category": "expense",
                    "id": str(maint.id),
                    "amount": maint.cost,
                    "date": maint.created_at.isoformat(),
                    "description": f"Maintenance - {maint.service_type_code}",
                    "details": {
                        "service_type": maint.service_type_code,
                        "service_provider": maint.service_provider
                    }
                })
        
        # FIX #11.2: Get other expenses (THIS WAS MISSING!)
        if not transaction_type or transaction_type == 'other_expense':
            other_query = db.query(OtherExpense).filter(OtherExpense.rider_id == rider_id)
            if start:
                other_query = other_query.filter(OtherExpense.expense_date >= start)
            if end:
                other_query = other_query.filter(OtherExpense.expense_date < end)
            
            other_expenses = other_query.order_by(OtherExpense.expense_date.desc()).all()
            for expense in other_expenses:
                transactions.append({
                    "type": "other_expense",
                    "category": "expense",
                    "id": str(expense.id),
                    "amount": expense.amount,
                    "date": expense.expense_date.isoformat(),
                    "description": f"{expense.category.capitalize()} - {expense.description}",
                    "details": {
                        "category": expense.category,
                        "description": expense.description
                    }
                })
        
        # Get savings contributions
        if not transaction_type or transaction_type == 'savings':
            savings_query = db.query(SavingsContribution).filter(SavingsContribution.rider_id == rider_id)
            if start:
                savings_query = savings_query.filter(SavingsContribution.created_at >= start)
            if end:
                savings_query = savings_query.filter(SavingsContribution.created_at < end)
            
            savings = savings_query.order_by(SavingsContribution.created_at.desc()).all()
            for saving in savings:
                transactions.append({
                    "type": "savings",
                    "category": "transfer",
                    "id": str(saving.id),
                    "amount": saving.amount,
                    "date": saving.created_at.isoformat(),
                    "description": "Savings contribution",
                    "details": {"goal_id": str(saving.goal_id) if saving.goal_id else None}
                })
        
        # Get Lipa Later payments
        if not transaction_type or transaction_type == 'lipa_later':
            lipa_query = db.query(LipaLaterPayment).filter(LipaLaterPayment.rider_id == rider_id)
            if start:
                lipa_query = lipa_query.filter(LipaLaterPayment.created_at >= start)
            if end:
                lipa_query = lipa_query.filter(LipaLaterPayment.created_at < end)
            
            lipa_payments = lipa_query.order_by(LipaLaterPayment.created_at.desc()).all()
            for payment in lipa_payments:
                transactions.append({
                    "type": "lipa_later",
                    "category": "expense",
                    "id": str(payment.id),
                    "amount": payment.amount,
                    "date": payment.created_at.isoformat(),
                    "description": "Lipa Later payment",
                    "details": {"payment_method": payment.payment_method}
                })
        
        # Sort by date descending
        transactions.sort(key=lambda x: x['date'], reverse=True)
        
        # Apply pagination
        total = len(transactions)
        paginated = transactions[skip:skip + limit]
        
        return {
            "status": "success",
            "transactions": paginated,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/category-breakdown/{rider_id}")
async def get_category_breakdown(
    rider_id: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get expense breakdown by category including other expenses.
    FIX #11.3: Now includes other_expense categories in breakdown.
    """
    try:
        # Verify rider exists
        rider = db.query(Rider).filter(Rider.id == rider_id).first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        
        # Parse dates
        start = None
        end = None
        if start_date:
            try:
                start = datetime.fromisoformat(start_date)
            except ValueError:
                pass
        if end_date:
            try:
                end = datetime.fromisoformat(end_date)
                end = end + timedelta(days=1)
            except ValueError:
                pass
        
        breakdown = {
            "income": {"total": 0, "count": 0},
            "fuel": {"total": 0, "count": 0},
            "maintenance": {"total": 0, "count": 0},
            "other_expenses": {},  # FIX #11.4: Add other expenses breakdown
            "savings": {"total": 0, "count": 0},
            "lipa_later": {"total": 0, "count": 0}
        }
        
        # Get all transaction totals
        trips = db.query(Trip).filter(Trip.rider_id == rider_id)
        if start:
            trips = trips.filter(Trip.created_at >= start)
        if end:
            trips = trips.filter(Trip.created_at < end)
        trips = trips.all()
        breakdown["income"]["total"] = sum(t.fare_amount for t in trips if t.fare_amount)
        breakdown["income"]["count"] = len(trips)
        
        fuel = db.query(FuelEntry).filter(FuelEntry.rider_id == rider_id)
        if start:
            fuel = fuel.filter(FuelEntry.created_at >= start)
        if end:
            fuel = fuel.filter(FuelEntry.created_at < end)
        fuel = fuel.all()
        breakdown["fuel"]["total"] = sum(f.amount for f in fuel if f.amount)
        breakdown["fuel"]["count"] = len(fuel)
        
        maint = db.query(MaintenanceEntry).filter(MaintenanceEntry.rider_id == rider_id)
        if start:
            maint = maint.filter(MaintenanceEntry.created_at >= start)
        if end:
            maint = maint.filter(MaintenanceEntry.created_at < end)
        maint = maint.all()
        breakdown["maintenance"]["total"] = sum(m.cost for m in maint if m.cost)
        breakdown["maintenance"]["count"] = len(maint)
        
        # FIX #11.5: Get other expenses broken down by category
        other = db.query(OtherExpense).filter(OtherExpense.rider_id == rider_id)
        if start:
            other = other.filter(OtherExpense.expense_date >= start)
        if end:
            other = other.filter(OtherExpense.expense_date < end)
        other = other.all()
        
        # Organize by category
        for expense in other:
            cat = expense.category
            if cat not in breakdown["other_expenses"]:
                breakdown["other_expenses"][cat] = {"total": 0, "count": 0}
            breakdown["other_expenses"][cat]["total"] += expense.amount
            breakdown["other_expenses"][cat]["count"] += 1
        
        savings = db.query(SavingsContribution).filter(SavingsContribution.rider_id == rider_id)
        if start:
            savings = savings.filter(SavingsContribution.created_at >= start)
        if end:
            savings = savings.filter(SavingsContribution.created_at < end)
        savings = savings.all()
        breakdown["savings"]["total"] = sum(s.amount for s in savings if s.amount)
        breakdown["savings"]["count"] = len(savings)
        
        lipa = db.query(LipaLaterPayment).filter(LipaLaterPayment.rider_id == rider_id)
        if start:
            lipa = lipa.filter(LipaLaterPayment.created_at >= start)
        if end:
            lipa = lipa.filter(LipaLaterPayment.created_at < end)
        lipa = lipa.all()
        breakdown["lipa_later"]["total"] = sum(l.amount for l in lipa if l.amount)
        breakdown["lipa_later"]["count"] = len(lipa)
        
        return {
            "status": "success",
            "breakdown": breakdown,
            "period": {
                "start": start.isoformat() if start else None,
                "end": end.isoformat() if end else None
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/transactions-by-tab/{rider_id}")
async def get_transactions_by_tab(
    rider_id: str,
    tab: str = Query(...),  # trip, fuel, maintenance, other_expense, etc.
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(50),
    db: Session = Depends(get_db)
):
    """
    Get transactions filtered by tab/category.
    FIX #11.6: Handles 'other_expense' tab properly.
    """
    try:
        # Verify rider exists
        rider = db.query(Rider).filter(Rider.id == rider_id).first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        
        # Parse dates
        start = None
        end = None
        if start_date:
            try:
                start = datetime.fromisoformat(start_date)
            except ValueError:
                pass
        if end_date:
            try:
                end = datetime.fromisoformat(end_date)
                end = end + timedelta(days=1)
            except ValueError:
                pass
        
        transactions = []
        
        # FIX #11.7: Handle each tab type including other_expense
        if tab == 'trip':
            query = db.query(Trip).filter(Trip.rider_id == rider_id)
            if start:
                query = query.filter(Trip.created_at >= start)
            if end:
                query = query.filter(Trip.created_at < end)
            
            results = query.order_by(Trip.created_at.desc()).offset(skip).limit(limit).all()
            total = query.count()
            
            for item in results:
                transactions.append({
                    "id": str(item.id),
                    "type": "trip",
                    "amount": item.fare_amount,
                    "date": item.created_at.isoformat(),
                    "description": f"{item.pickup_location} → {item.dropoff_location}"
                })
        
        elif tab == 'fuel':
            query = db.query(FuelEntry).filter(FuelEntry.rider_id == rider_id)
            if start:
                query = query.filter(FuelEntry.created_at >= start)
            if end:
                query = query.filter(FuelEntry.created_at < end)
            
            results = query.order_by(FuelEntry.created_at.desc()).offset(skip).limit(limit).all()
            total = query.count()
            
            for item in results:
                transactions.append({
                    "id": str(item.id),
                    "type": "fuel",
                    "amount": item.amount,
                    "date": item.created_at.isoformat(),
                    "description": item.fuel_type
                })
        
        elif tab == 'maintenance':
            query = db.query(MaintenanceEntry).filter(MaintenanceEntry.rider_id == rider_id)
            if start:
                query = query.filter(MaintenanceEntry.created_at >= start)
            if end:
                query = query.filter(MaintenanceEntry.created_at < end)
            
            results = query.order_by(MaintenanceEntry.created_at.desc()).offset(skip).limit(limit).all()
            total = query.count()
            
            for item in results:
                transactions.append({
                    "id": str(item.id),
                    "type": "maintenance",
                    "amount": item.cost,
                    "date": item.created_at.isoformat(),
                    "description": item.service_type_code
                })
        
        # FIX #11.8: Handle other_expense tab (was missing before!)
        elif tab == 'other_expense':
            query = db.query(OtherExpense).filter(OtherExpense.rider_id == rider_id)
            if start:
                query = query.filter(OtherExpense.expense_date >= start)
            if end:
                query = query.filter(OtherExpense.expense_date < end)
            
            results = query.order_by(OtherExpense.expense_date.desc()).offset(skip).limit(limit).all()
            total = query.count()
            
            for item in results:
                transactions.append({
                    "id": str(item.id),
                    "type": "other_expense",
                    "amount": item.amount,
                    "date": item.expense_date.isoformat(),
                    "description": f"{item.category} - {item.description}",
                    "category": item.category
                })
        
        else:
            raise HTTPException(status_code=400, detail=f"Unknown tab: {tab}")
        
        return {
            "status": "success",
            "tab": tab,
            "transactions": transactions,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))