"""
backend/app/routers/sb17_goals_remittance.py

✅ FIXED: Proper rider_id parameter handling
✅ FIXED: Token comparison with type casting
✅ FIXED: Proper status field usage (not archived boolean)
✅ FIXED: Complete error validation
✅ FIXED: Proper response formats
✅ FIXED: Python syntax - parameters with defaults in correct order

All endpoints now require rider_id query parameter for authentication.
"""

from fastapi import APIRouter, Query, Header, HTTPException, Depends, Path, Body
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel
import uuid

from app.database import get_db
from app.auth import verify_token
from app.models.goal import Goal
from app.models.goal_contribution import GoalContribution
from app.models.remittance import Remittance
from app.models.saved_recipient import SavedRecipient

router = APIRouter(prefix="/financial", tags=["financial"])

# ============================================================================
# SCHEMAS
# ============================================================================

class GoalRequest(BaseModel):
    goal_type_code: str
    name: Optional[str] = None
    target_amount: float
    target_date: Optional[str] = None

class GoalContributionRequest(BaseModel):
    goal_id: str
    amount: float

class RemittanceRequest(BaseModel):
    recipient_name: str
    relationship_code: Optional[str] = None
    amount: float
    channel_code: str

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_current_rider(
    rider_id: str = Query(..., description="Rider ID"),
    authorization: str = Header(None),
    db: Session = Depends(get_db)
) -> str:
    """
    ✅ CRITICAL: Verify rider_id and token match
    
    Required for all endpoints that access rider-specific data.
    """
    if not rider_id:
        raise HTTPException(status_code=422, detail="rider_id query parameter required")
    
    # Verify token
    token = verify_token(authorization)
    if not token:
        raise HTTPException(status_code=403, detail="Invalid or missing token")
    
    # ✅ CRITICAL FIX: Convert to string for comparison
    # Token.sub is UUID, rider_id is string
    if str(token.get("sub")) != str(rider_id):
        raise HTTPException(
            status_code=403,
            detail="Unauthorized: token does not match rider_id"
        )
    
    return rider_id

# ============================================================================
# GOALS ENDPOINTS
# ============================================================================

@router.get("/goals")
def list_goals(
    rider_id: str = Depends(get_current_rider),
    db: Session = Depends(get_db)
):
    """
    ✅ GET /financial/goals?rider_id={rider_id}
    
    Returns all goals (active + archived) for the rider.
    
    Response format:
    [
        {
            "id": "uuid",
            "goal_type_code": "school_fees",
            "name": "School Fees 2025",
            "target_amount": 50000,
            "target_date": "2025-12-31",
            "earned": 15000,
            "archived": false,
            "status": "active",
            "contributions": [
                {"amount": 5000, "ts": "2024-08-01T10:00:00Z"},
                {"amount": 10000, "ts": "2024-08-05T15:30:00Z"}
            ]
        }
    ]
    """
    try:
        goals = db.query(Goal).filter(Goal.rider_id == rider_id).all()
        
        result = []
        for goal in goals:
            contributions = db.query(GoalContribution).filter_by(goal_id=goal.id).all()
            earned = sum(float(c.amount) for c in contributions)
            
            result.append({
                "id": str(goal.id),
                "goal_type_code": goal.goal_type_code,
                "name": goal.name,
                "target_amount": float(goal.target_amount),
                "target_date": str(goal.target_date) if goal.target_date else None,
                "earned": earned,
                "archived": goal.status == "archived",
                "status": goal.status,
                "contributions": [
                    {
                        "amount": float(c.amount),
                        "ts": c.submitted_at.isoformat()
                    }
                    for c in contributions
                ]
            })
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/goals/{goal_id}")
def get_goal(
    goal_id: str = Path(..., description="Goal ID"),
    rider_id: str = Depends(get_current_rider),
    db: Session = Depends(get_db)
):
    """
    ✅ GET /financial/goals/{goal_id}?rider_id={rider_id}
    
    Returns single goal with full contribution history.
    """
    try:
        goal = db.query(Goal).filter(
            and_(Goal.id == goal_id, Goal.rider_id == rider_id)
        ).first()
        
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found")
        
        contributions = db.query(GoalContribution).filter_by(goal_id=goal_id).all()
        earned = sum(float(c.amount) for c in contributions)
        
        return {
            "id": str(goal.id),
            "goal_type_code": goal.goal_type_code,
            "name": goal.name,
            "target_amount": float(goal.target_amount),
            "target_date": str(goal.target_date) if goal.target_date else None,
            "earned": earned,
            "archived": goal.status == "archived",
            "status": goal.status,
            "contributions": [
                {
                    "amount": float(c.amount),
                    "ts": c.submitted_at.isoformat()
                }
                for c in contributions
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/goals", status_code=201)
def create_goal(
    payload: GoalRequest,
    rider_id: str = Depends(get_current_rider),
    db: Session = Depends(get_db)
):
    """
    ✅ POST /financial/goals?rider_id={rider_id}
    
    Create new goal for rider.
    
    Required fields:
    - goal_type_code: string (school_fees, land, second_bike, other)
    - target_amount: float (must be > 0)
    
    Optional fields:
    - name: string
    - target_date: string (YYYY-MM-DD format)
    """
    try:
        # Validation
        if not payload.goal_type_code:
            raise HTTPException(status_code=422, detail="Select a Goal Type.")
        
        target = float(payload.target_amount)
        if not target or target <= 0:
            raise HTTPException(
                status_code=422,
                detail="Enter a Target Amount greater than zero."
            )
        
        # Create goal
        goal = Goal(
            id=uuid.uuid4(),
            rider_id=rider_id,
            goal_type_code=payload.goal_type_code,
            name=payload.name or payload.goal_type_code,
            target_amount=target,
            target_date=payload.target_date,
            status="active"  # ✅ FIXED: Use status field
        )
        
        db.add(goal)
        db.commit()
        db.refresh(goal)
        
        return {
            "id": str(goal.id),
            "goal_type_code": goal.goal_type_code,
            "name": goal.name,
            "target_amount": float(goal.target_amount),
            "target_date": str(goal.target_date) if goal.target_date else None,
            "earned": 0,
            "archived": False,
            "status": "active",
            "contributions": []
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/goals/{goal_id}")
def update_goal(
    goal_id: str = Path(..., description="Goal ID"),
    rider_id: str = Depends(get_current_rider),
    db: Session = Depends(get_db),
    payload: dict = Body(...)
):
    """
    ✅ PATCH /financial/goals/{goal_id}?rider_id={rider_id}
    
    Update goal status (archive/unarchive).
    
    Request body:
    {
        "archived": true
    }
    """
    try:
        goal = db.query(Goal).filter(
            and_(Goal.id == goal_id, Goal.rider_id == rider_id)
        ).first()
        
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found")
        
        # Update archived status
        if payload and "archived" in payload:
            if payload["archived"]:
                goal.status = "archived"
            else:
                goal.status = "active"
            db.commit()
        
        return {
            "id": str(goal.id),
            "status": goal.status,
            "archived": goal.status == "archived"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/goals/{goal_id}")
def delete_goal(
    goal_id: str = Path(..., description="Goal ID"),
    rider_id: str = Depends(get_current_rider),
    db: Session = Depends(get_db)
):
    """
    ✅ DELETE /financial/goals/{goal_id}?rider_id={rider_id}
    
    Delete goal and all associated contributions.
    """
    try:
        goal = db.query(Goal).filter(
            and_(Goal.id == goal_id, Goal.rider_id == rider_id)
        ).first()
        
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found")
        
        # Delete contributions first
        db.query(GoalContribution).filter_by(goal_id=goal_id).delete()
        
        # Delete goal
        db.delete(goal)
        db.commit()
        
        return {"id": str(goal.id), "deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# CONTRIBUTION ENDPOINTS
# ============================================================================

@router.post("/goals/contribution")
def save_contribution(
    payload: GoalContributionRequest,
    rider_id: str = Depends(get_current_rider),
    db: Session = Depends(get_db)
):
    """
    ✅ POST /financial/goals/contribution?rider_id={rider_id}
    
    Record contribution to goal.
    
    Request body:
    {
        "goal_id": "uuid",
        "amount": 5000
    }
    
    Response:
    {
        "earned": 15000,
        "achieved": false
    }
    
    If achieved is true, client should navigate to GoalAchieved screen.
    """
    try:
        # Validation
        if not payload.goal_id:
            raise HTTPException(status_code=422, detail="goal_id required")
        
        amount = float(payload.amount)
        if not amount or amount <= 0:
            raise HTTPException(
                status_code=422,
                detail="Enter a contribution amount greater than zero."
            )
        
        # Get goal
        goal = db.query(Goal).filter(
            and_(Goal.id == payload.goal_id, Goal.rider_id == rider_id)
        ).first()
        
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found")
        
        # Save contribution
        contribution = GoalContribution(
            id=uuid.uuid4(),
            goal_id=payload.goal_id,
            amount=amount,
            submitted_at=datetime.now(timezone.utc)
        )
        
        db.add(contribution)
        db.commit()
        
        # Calculate total and check achievement
        total_earned = sum(
            float(c.amount) 
            for c in db.query(GoalContribution).filter_by(goal_id=payload.goal_id).all()
        )
        
        achieved = total_earned >= float(goal.target_amount)
        
        # ✅ CRITICAL FIX: Update status to achieved
        if achieved and goal.status == "active":
            goal.status = "achieved"
            db.commit()
        
        return {
            "earned": total_earned,
            "achieved": achieved
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# REMITTANCE ENDPOINTS
# ============================================================================

@router.post("/remittance", status_code=201)
def save_remittance(
    payload: RemittanceRequest,
    rider_id: str = Depends(get_current_rider),
    db: Session = Depends(get_db)
):
    """
    ✅ POST /financial/remittance?rider_id={rider_id}
    
    Send money home to recipient.
    
    Request body:
    {
        "recipient_name": "Mother",
        "relationship_code": "Mother",
        "amount": 5000,
        "channel_code": "mpesa"
    }
    """
    try:
        # Validation
        if not payload.recipient_name or not payload.recipient_name.strip():
            raise HTTPException(status_code=422, detail="Select or enter a Recipient.")
        
        amount = float(payload.amount)
        if not amount or amount <= 0:
            raise HTTPException(status_code=422, detail="Enter an amount greater than zero.")
        
        if not payload.channel_code:
            raise HTTPException(status_code=422, detail="Select the Channel Used.")
        
        # Get or create saved recipient
        recipient = db.query(SavedRecipient).filter(
            and_(
                SavedRecipient.rider_id == rider_id,
                SavedRecipient.name == payload.recipient_name.strip()
            )
        ).first()
        
        if not recipient:
            recipient = SavedRecipient(
                id=uuid.uuid4(),
                rider_id=rider_id,
                name=payload.recipient_name.strip()
            )
            db.add(recipient)
        
        # Create remittance
        remittance = Remittance(
            id='RMT-' + str(int(datetime.now(timezone.utc).timestamp() * 1000)),
            rider_id=rider_id,
            recipient=payload.recipient_name.strip(),
            recipient_relationship=payload.relationship_code,
            amount=amount,
            channel=payload.channel_code,
            ts=datetime.now(timezone.utc),
            sync_status='synced'
        )
        
        db.add(remittance)
        db.commit()
        db.refresh(remittance)
        
        return {"id": remittance.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/remittances")
def list_remittances(
    rider_id: str = Depends(get_current_rider),
    db: Session = Depends(get_db)
):
    """
    ✅ GET /financial/remittances?rider_id={rider_id}
    
    List all remittances sent by rider (newest first).
    
    Response format:
    [
        {
            "id": "RMT-123456",
            "recipient": "Mother",
            "relationship": "Mother",
            "amount": 5000,
            "channel": "mpesa",
            "ts": "2024-08-08T10:00:00Z"
        }
    ]
    """
    try:
        remittances = db.query(Remittance).filter(
            Remittance.rider_id == rider_id
        ).order_by(Remittance.ts.desc()).all()
        
        return [
            {
                "id": r.id,
                "recipient": r.recipient,
                "relationship": r.recipient_relationship,
                "amount": float(r.amount),
                "channel": r.channel,
                "ts": r.ts.isoformat() if r.ts else None
            }
            for r in remittances
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/recipients")
def list_recipients(
    rider_id: str = Depends(get_current_rider),
    db: Session = Depends(get_db)
):
    """
    ✅ GET /financial/recipients?rider_id={rider_id}
    
    List saved recipients for rider.
    
    Response format:
    [
        {"name": "Mother"},
        {"name": "Father"},
        {"name": "Sister"}
    ]
    """
    try:
        recipients = db.query(SavedRecipient).filter(
            SavedRecipient.rider_id == rider_id
        ).all()
        
        return [{"name": r.name} for r in recipients]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))