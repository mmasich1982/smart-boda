# backend/app/schemas/financial_performance.py
# UPDATED: Schemas for Net Profit Dashboard, Other Expense logging, and Savings tracking
# Includes schemas for: Net Profit (RA-07), Other Expenses (RA-08), Savings Tracker (SB-16)
# ✓ FIXED: Pydantic V1 → V2 migration (ConfigDict)

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime


class ExpenseBreakdown(BaseModel):
    """Individual expense category breakdown for display."""
    category: str = Field(..., description="Category name (Fuel/Energy, Service, Food, etc.)")
    amount: float = Field(..., description="Total amount for this category in KSh")


class NetProfitResponse(BaseModel):
    """Net profit dashboard summary for a period."""
    net_profit: float = Field(..., description="Net Profit = Income - Total Expenses")
    income: float = Field(..., description="Total realized income from trips")
    total_expense: float = Field(..., description="Total of all expenses")
    fuel_expense: float = Field(..., description="Fuel/Energy expense")
    maintenance_expense: float = Field(..., description="Service/Maintenance expense")
    other_expense: float = Field(..., description="Sum of other expenses by category")
    breakdown: List[ExpenseBreakdown] = Field(default_factory=list, description="Expense breakdown by category")
    week_avg_daily_profit: float = Field(default=0.0, description="Average daily profit this week (for nudge logic)")


class OtherExpenseRequest(BaseModel):
    """Request to log an other expense."""
    category: str = Field(..., description="Expense category (from FinancialMasterData)")
    amount: float = Field(..., gt=0, description="Amount in KSh")
    note: Optional[str] = Field(None, description="Optional note about the expense")
    submitted_at: Optional[str] = Field(None, description="ISO timestamp of when submitted")


class OtherExpenseResponse(BaseModel):
    """Response after logging an expense."""
    id: int = Field(..., description="Expense entry ID")
    status: str = Field(..., description="Status: created")


# ============================================================================
# SAVINGS TRACKER SCHEMAS (SB-16)
# ============================================================================

class SavingsAccountRequest(BaseModel):
    """Request to register a new savings account."""
    type: str = Field(..., description="Account type: 'sacco' or 'chama'")
    name: str = Field(..., description="Account name (e.g., 'My Sacco', 'Office Chama')")
    frequency: str = Field(..., description="Contribution frequency: 'daily', 'weekly', 'monthly'")


class SavingsContributionRequest(BaseModel):
    """Request to add a contribution to a savings account."""
    account_id: str = Field(..., description="UUID of the savings account")
    amount: float = Field(..., gt=0, description="Amount contributed in KSh")


# ============================================================================
# GOALS & REMITTANCE SCHEMAS (SB-17)
# ============================================================================

class GoalRequest(BaseModel):
    """Request to create a new financial goal."""
    goal_type_code: str = Field(..., description="Goal type code from GoalTypeMaster")
    name: str = Field(..., description="Goal name (e.g., 'Buy new bike')")
    target_amount: float = Field(..., gt=0, description="Target amount in KSh")
    target_date: Optional[datetime] = Field(None, description="Target completion date (ISO format)")


class GoalContributionRequest(BaseModel):
    """Request to add a contribution to a goal."""
    goal_id: str = Field(..., description="UUID of the goal")
    amount: float = Field(..., gt=0, description="Amount contributed in KSh")
    note: Optional[str] = Field(None, description="Optional note about the contribution")


class RemittanceRequest(BaseModel):
    """Request to send a remittance to a saved recipient."""
    recipient_name: str = Field(..., description="Name of the recipient")
    relationship_code: Optional[str] = Field(None, description="Relationship code (BR-SB17-008: optional)")
    amount: float = Field(..., gt=0, description="Amount to remit in KSh")
    channel_code: str = Field(..., description="Payment channel code (e.g., 'mpesa', 'bank')")