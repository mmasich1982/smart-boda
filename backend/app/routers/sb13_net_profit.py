# Fixed Net Profit Router - Backend
# File: backend/app/routers/sb13_net_profit.py

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime
from app.database import get_db
from app.services.net_profit_service import NetProfitService
from app.models.rider import Rider

router = APIRouter(prefix="/net-profit", tags=["net_profit"])

@router.get("/calculate/{rider_id}")
async def calculate_net_profit(
    rider_id: str,
    start_date: str = Query(None),
    end_date: str = Query(None),
    period: str = Query("month"),  # day, week, month, custom
    db: Session = Depends(get_db)
):
    """
    Calculate net profit for a rider.
    FIX #12: Uses the updated NetProfitService that includes other expenses.
    """
    try:
        # Verify rider exists
        rider = db.query(Rider).filter(Rider.id == rider_id).first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        
        # Parse dates based on period
        if period == "day":
            result = NetProfitService.get_daily_net_profit(db, rider_id)
        elif period == "week":
            result = NetProfitService.get_weekly_net_profit(db, rider_id)
        elif period == "month":
            result = NetProfitService.get_monthly_net_profit(db, rider_id)
        elif period == "custom":
            if not start_date or not end_date:
                raise HTTPException(status_code=400, detail="start_date and end_date required for custom period")
            
            try:
                start = datetime.fromisoformat(start_date)
                end = datetime.fromisoformat(end_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use ISO 8601 format.")
            
            result = NetProfitService.calculate_net_profit(db, rider_id, start, end)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown period: {period}")
        
        return {
            "status": "success",
            "data": result,
            "rider_id": rider_id,
            "period": period
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/expense-summary/{rider_id}")
async def get_expense_summary(
    rider_id: str,
    start_date: str = Query(None),
    end_date: str = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get detailed expense summary by category.
    FIX #12.1: Now includes other expenses in the summary.
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
            except ValueError:
                pass
        
        summary = NetProfitService.get_expense_summary(db, rider_id, start, end)
        
        return {
            "status": "success",
            "data": summary,
            "rider_id": rider_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/trend/{rider_id}")
async def get_profit_trend(
    rider_id: str,
    days: int = Query(30),
    db: Session = Depends(get_db)
):
    """
    Get daily profit trend for the last N days.
    FIX #12.2: Calculated using the updated service with other expenses included.
    """
    try:
        # Verify rider exists
        rider = db.query(Rider).filter(Rider.id == rider_id).first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        
        from datetime import timedelta
        
        trend = []
        for i in range(days):
            date = datetime.now() - timedelta(days=i)
            daily = NetProfitService.get_daily_net_profit(db, rider_id, date)
            
            trend.insert(0, {  # Insert at beginning to maintain chronological order
                "date": daily["period"]["start"],
                "revenue": daily["revenue"],
                "expenses": daily["expenses"]["total"],
                "net_profit": daily["net_profit"],
                "margin": daily["margin_percentage"]
            })
        
        return {
            "status": "success",
            "data": trend,
            "rider_id": rider_id,
            "period_days": days
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/breakdown/{rider_id}")
async def get_expense_breakdown(
    rider_id: str,
    start_date: str = Query(None),
    end_date: str = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get expense breakdown showing percentage distribution.
    FIX #12.3: Includes other expenses in the breakdown.
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
            except ValueError:
                pass
        
        profit = NetProfitService.calculate_net_profit(db, rider_id, start, end)
        
        return {
            "status": "success",
            "data": {
                "summary": profit["expense_breakdown"],
                "percentages": profit["expense_breakdown"],
                "total_expenses": profit["expenses"]["total"]
            },
            "rider_id": rider_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))