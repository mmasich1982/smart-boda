from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.database import get_db
from app.models.remittance import Remittance
from app.models.saved_recipient import SavedRecipient
from app.models.other_expense import OtherExpense
from app.models.rider import Rider
from app.auth import get_current_rider
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/api/remittance", tags=["remittance"])

class RemittanceCreate(BaseModel):
    recipient: str
    relationship: Optional[str] = None
    amount: float
    channel: str

class RemittanceResponse(BaseModel):
    id: str
    recipient: str
    relationship: Optional[str]
    amount: float
    channel: str
    ts: datetime
    sync_status: str

    class Config:
        from_attributes = True

class SavedRecipientResponse(BaseModel):
    name: str

    class Config:
        from_attributes = True

class RemittanceSummary(BaseModel):
    total_sent: float
    entries_logged: int
    remittances: List[RemittanceResponse]

@router.post("/send", response_model=RemittanceResponse)
def save_remittance(
    payload: RemittanceCreate,
    db: Session = Depends(get_db),
    current_rider: dict = Depends(get_current_rider),
):
    """
    Save a new remittance (Send Money Home) transaction.
    Automatically logs corresponding expense entry.
    """
    rider_id = current_rider.get("rider_id")
    
    if not payload.recipient:
        raise HTTPException(status_code=400, detail="Recipient is required")
    
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    
    if not payload.channel:
        raise HTTPException(status_code=400, detail="Channel is required")
    
    try:
        # Create remittance record
        remittance = Remittance(
            id=f"RMT-{int(100000 + (datetime.now().timestamp() % 900000))}",
            rider_id=rider_id,
            recipient=payload.recipient,
            relationship=payload.relationship,
            amount=payload.amount,
            channel=payload.channel,
            ts=datetime.utcnow(),
            sync_status="synced",
        )
        db.add(remittance)
        
        # Add to saved recipients if new
        existing = db.query(SavedRecipient).filter(
            SavedRecipient.rider_id == rider_id,
            SavedRecipient.name == payload.recipient,
        ).first()
        
        if not existing:
            saved_recipient = SavedRecipient(
                rider_id=rider_id,
                name=payload.recipient,
            )
            db.add(saved_recipient)
        
        # Create corresponding expense entry
        expense = OtherExpense(
            id=f"EXP-{int(datetime.now().timestamp() * 1000)}",
            rider_id=rider_id,
            category="Family Remittance",
            amount=payload.amount,
            note=f"To {payload.recipient}",
            ts=datetime.utcnow(),
            sync_status="synced",
        )
        db.add(expense)
        
        db.commit()
        db.refresh(remittance)
        
        return remittance
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history", response_model=RemittanceSummary)
def get_remittance_history(
    period: str = Query("thisMonth", regex="^(thisMonth|lastMonth|last6|sinceJoining)$"),
    db: Session = Depends(get_db),
    current_rider: dict = Depends(get_current_rider),
):
    """
    Get remittance history filtered by period.
    Periods: thisMonth, lastMonth, last6, sinceJoining
    """
    rider_id = current_rider.get("rider_id")
    
    # Calculate date range
    end_date = datetime.utcnow()
    if period == "thisMonth":
        start_date = end_date.replace(day=1)
    elif period == "lastMonth":
        first_of_this_month = end_date.replace(day=1)
        start_date = (first_of_this_month - timedelta(days=1)).replace(day=1)
        end_date = first_of_this_month
    elif period == "last6":
        start_date = end_date - timedelta(days=180)
    else:  # sinceJoining
        rider = db.query(Rider).filter(Rider.id == rider_id).first()
        start_date = rider.created_at if rider else (end_date - timedelta(days=999999))
    
    # Query remittances
    remittances = db.query(Remittance).filter(
        Remittance.rider_id == rider_id,
        Remittance.ts >= start_date,
        Remittance.ts <= end_date,
    ).order_by(Remittance.ts.desc()).all()
    
    total_sent = sum(r.amount for r in remittances)
    
    return RemittanceSummary(
        total_sent=total_sent,
        entries_logged=len(remittances),
        remittances=remittances,
    )

@router.get("/recipients", response_model=List[SavedRecipientResponse])
def get_saved_recipients(
    db: Session = Depends(get_db),
    current_rider: dict = Depends(get_current_rider),
):
    """
    Get list of saved recipients for quick selection.
    """
    rider_id = current_rider.get("rider_id")
    
    recipients = db.query(SavedRecipient).filter(
        SavedRecipient.rider_id == rider_id,
    ).order_by(SavedRecipient.created_at.desc()).all()
    
    return recipients

@router.get("/{remittance_id}", response_model=RemittanceResponse)
def get_remittance_detail(
    remittance_id: str,
    db: Session = Depends(get_db),
    current_rider: dict = Depends(get_current_rider),
):
    """
    Get details of a specific remittance transaction.
    """
    rider_id = current_rider.get("rider_id")
    
    remittance = db.query(Remittance).filter(
        Remittance.id == remittance_id,
        Remittance.rider_id == rider_id,
    ).first()
    
    if not remittance:
        raise HTTPException(status_code=404, detail="Remittance not found")
    
    return remittance

@router.delete("/{remittance_id}")
def delete_remittance(
    remittance_id: str,
    db: Session = Depends(get_db),
    current_rider: dict = Depends(get_current_rider),
):
    """
    Delete a remittance transaction (within correction window).
    """
    rider_id = current_rider.get("rider_id")
    
    remittance = db.query(Remittance).filter(
        Remittance.id == remittance_id,
        Remittance.rider_id == rider_id,
    ).first()
    
    if not remittance:
        raise HTTPException(status_code=404, detail="Remittance not found")
    
    # Check if within correction window (e.g., 24 hours)
    time_since_creation = datetime.utcnow() - remittance.ts
    if time_since_creation > timedelta(hours=24):
        raise HTTPException(
            status_code=403,
            detail="Cannot delete remittance outside correction window",
        )
    
    db.delete(remittance)
    db.commit()
    
    return {"message": "Remittance deleted successfully"}