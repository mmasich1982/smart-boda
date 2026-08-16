# backend/app/schemas/revenue_targets.py
# UPDATED: Schemas for Revenue Targets & Achievement Streaks (RA-09, RA-10)

from pydantic import BaseModel, Field
from typing import Optional, Dict
from datetime import datetime


class RevenueTargetResponse(BaseModel):
    """Single revenue target response."""
    period: str = Field(..., description="Period: daily | weekly | monthly")
    amount: float = Field(..., description="Target amount in KSh")
    created_at: Optional[datetime] = Field(None, description="When target was created")


class CreateRevenueTargetRequest(BaseModel):
    """Request to create/update a revenue target."""
    period: str = Field(..., description="Period: daily | weekly | monthly")
    amount: float = Field(..., gt=0, description="Target amount in KSh")


class TargetsResponse(BaseModel):
    """All active targets for a rider."""
    targets: Dict[str, RevenueTargetResponse] = Field(default_factory=dict, description="Targets keyed by period")


class SuggestedTargetResponse(BaseModel):
    """AI-suggested target based on earning history."""
    suggestion: Optional[float] = Field(None, description="Suggested amount in KSh (null if insufficient history)")
    period: str = Field(..., description="Period for which suggestion applies")


class TargetMilestoneNotification(BaseModel):
    """Notification for achieving target milestone."""
    period: str = Field(..., description="daily | weekly | monthly")
    milestone_percent: int = Field(..., description="50 | 75 | 100")
    message: str = Field(..., description="Notification message")
    created_at: datetime = Field(default_factory=datetime.utcnow)