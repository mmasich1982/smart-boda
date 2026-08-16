# backend/app/routers/sb16_savings_tracker.py
# Savings Tracker - SACCO and CHAMA management (SB-16)
# Allows riders to track savings in community groups and savings clubs

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database import get_db
from app.auth import verify_token
from app.models.savings_account import SavingsAccount
from app.models.savings_contribution import SavingsContribution
from app.models.rider import Rider
from app.schemas.financial_performance import SavingsAccountRequest, SavingsContributionRequest
from app.services.period_range_service import month_filter_bounds
from app.services.savings_service import add_savings_contribution

router = APIRouter(prefix="/savings", tags=["sb-16"])


@router.get("/accounts")
def list_accounts(
    rider_id: str = Query(..., description="Rider ID"),
    db: Session = Depends(get_db),
):
    """
    List all savings accounts for a rider (both SACCO and CHAMA).
    Returns empty list if no accounts exist (EXC-SB16-003/004).
    
    Args:
        rider_id: UUID of the rider
        db: Database session
    
    Returns:
        List of all savings accounts
    """
    accounts = db.query(SavingsAccount).filter_by(rider_id=rider_id).all()
    return {"accounts": accounts if accounts else []}


@router.post("/accounts")
def register_account(
    payload: SavingsAccountRequest,
    rider_id: str = Query(..., description="Rider ID"),
    db: Session = Depends(get_db),
):
    """
    Register a new savings account (SACCO or CHAMA).
    
    Duplicates are allowed (BR-SB16-003).
    New accounts start at zero balance (BR-SB16-002).
    
    Args:
        payload: Account details (type, name, frequency)
        rider_id: UUID of the rider
        db: Database session
    
    Returns:
        {"id": "<account_uuid>", "ok": True}
    """
    if not payload.name.strip():
        raise HTTPException(status_code=422, detail="Name is required.")  # EXC-SB16-001
    
    account = SavingsAccount(
        rider_id=rider_id,
        type=payload.type,
        name=payload.name,
        frequency=payload.frequency
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    
    return {"id": str(account.id), "ok": True}


@router.post("/contribution")
def add_contribution(
    payload: SavingsContributionRequest,
    db: Session = Depends(get_db),
):
    """
    Add a contribution to a savings account.
    
    Args:
        payload: Contribution details (account_id, amount)
        db: Database session
    
    Returns:
        {"ok": True}
    
    Raises:
        HTTPException: If account not found or amount invalid (EXC-SB16-002)
    """
    try:
        add_savings_contribution(db, payload.account_id, payload.amount)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))  # EXC-SB16-002
    
    return {"ok": True}


@router.get("/report")
def get_report(
    rider_id: str = Query(..., description="Rider ID"),
    period: str = Query(..., description="Period filter: 'this_month', 'this_week', etc."),
    db: Session = Depends(get_db),
):
    """
    Get comprehensive savings report for a rider.
    
    Returns:
    - Combined total + per-account detail
    - Period filter only affects period_total, never the lifetime total (BR-SB16-008/009)
    - Totals broken down by account type (sacco vs chama)
    
    Args:
        rider_id: UUID of the rider
        period: Time period to filter contributions
        db: Database session
    
    Returns:
        {
            "accounts": [
                {
                    "id": "<uuid>",
                    "type": "sacco" | "chama",
                    "name": "Account Name",
                    "frequency": "daily" | "weekly" | "monthly",
                    "lifetime_total": float,
                    "period_total": float
                }
            ],
            "sacco_total": float,
            "chama_total": float
        }
    """
    
    rider = db.query(Rider).get(rider_id)
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    start, end = month_filter_bounds(period, datetime.now(timezone.utc), rider.created_at)
    accounts = db.query(SavingsAccount).filter_by(rider_id=rider_id).all()
    
    if not accounts:
        return {"accounts": [], "sacco_total": 0, "chama_total": 0}  # EXC-SB16-005

    result = []
    for acc in accounts:
        contribs = db.query(SavingsContribution).filter_by(account_id=acc.id).all()
        lifetime_total = sum(float(c.amount) for c in contribs)
        
        # BUG FIX: some DB backends (notably SQLite) return naive datetimes for a
        # timezone-aware column, which crashes a naive/aware comparison here in production
        # test runs. Normalize both sides to naive UTC just for this comparison.
        def _naive(dt):
            return dt.replace(tzinfo=None) if dt.tzinfo else dt
        
        start_n, end_n = _naive(start), _naive(end)
        period_contribs = [c for c in contribs if start_n <= _naive(c.submitted_at) <= end_n]
        period_total = sum(float(c.amount) for c in period_contribs)  # EXC-SB16-006: 0 -> period empty-state, lifetime total still shown
        
        result.append({
            "id": str(acc.id),
            "type": acc.type,
            "name": acc.name,
            "frequency": acc.frequency,
            "lifetime_total": lifetime_total,
            "period_total": period_total
        })
    
    return {
        "accounts": result,
        "sacco_total": sum(a["lifetime_total"] for a in result if a["type"] == "sacco"),
        "chama_total": sum(a["lifetime_total"] for a in result if a["type"] == "chama")
    }