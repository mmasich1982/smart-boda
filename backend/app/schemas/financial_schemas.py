"""
financial_schemas.py
Pydantic schemas for financial history and statement requests/responses
✓ FIXED: Pydantic V1 → V2 migration (ConfigDict)
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, List
from datetime import datetime

# ============= Financial Summary Schemas =============

class FinancialSummaryResponse(BaseModel):
    """Response for financial summary endpoint"""
    period_start: int = Field(..., description="Period start timestamp in milliseconds")
    period_end: int = Field(..., description="Period end timestamp in milliseconds")
    income: float = Field(..., ge=0, description="Total income for period")
    expenses: Dict = Field(
        ...,
        description="Expense breakdown by category and type"
    )
    total_expense: float = Field(..., ge=0, description="Total expenses for period")
    net_profit: float = Field(..., description="Net profit (income - expenses)")

    # ✓ FIXED: V1 Config → V2 ConfigDict
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "period_start": 1641038400000,
                "period_end": 1643716800000,
                "income": 15000.0,
                "expenses": {
                    "fuel": 2000.0,
                    "maintenance": 1500.0,
                    "other": 500.0,
                    "by_category": {
                        "Fuel/Energy": 2000.0,
                        "Service": 1500.0,
                        "Insurance": 500.0
                    }
                },
                "total_expense": 4000.0,
                "net_profit": 11000.0
            }
        }
    )


# ============= Transaction Schemas =============

class TransactionItem(BaseModel):
    """Individual transaction"""
    id: int
    type: str  # 'trip', 'fuel', 'maintenance', 'other'
    timestamp: int
    amount: float
    category: Optional[str] = None
    status: Optional[str] = None
    correction_reason: Optional[str] = None

    # ✓ FIXED: V1 Config → V2 ConfigDict
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": 123,
                "type": "trip",
                "timestamp": 1643716800000,
                "amount": 250.0,
                "status": "active"
            }
        }
    )


class TransactionListResponse(BaseModel):
    """Response for transaction list"""
    count: int
    transactions: List[TransactionItem]  # ✓ FIXED: Changed list[TransactionItem] to List[TransactionItem]

    # ✓ FIXED: V1 Config → V2 ConfigDict
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "count": 42,
                "transactions": []
            }
        }
    )


# ============= Statement Generation Schemas =============

class StatementGenerationRequest(BaseModel):
    """Request to generate a new statement"""
    start_ms: int = Field(..., description="Period start timestamp in milliseconds")
    end_ms: int = Field(..., description="Period end timestamp in milliseconds")
    purpose: Optional[str] = Field(
        None,
        max_length=255,
        description="Purpose of statement (e.g., Loan Application)"
    )

    # ✓ FIXED: V1 Config → V2 ConfigDict
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "start_ms": 1641038400000,
                "end_ms": 1643716800000,
                "purpose": "Loan Application"
            }
        }
    )


class StatementResponse(BaseModel):
    """Response for generated statement"""
    id: int
    period_start: int
    period_end: int
    purpose: Optional[str]
    income: float
    total_expense: float
    net_profit: float
    verification_ref: str
    verified: bool

    # ✓ FIXED: V1 Config → V2 ConfigDict
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": 1,
                "period_start": 1641038400000,
                "period_end": 1643716800000,
                "purpose": "Loan Application",
                "income": 15000.0,
                "total_expense": 4000.0,
                "net_profit": 11000.0,
                "verification_ref": "VRF-abc123def456",
                "verified": True
            }
        }
    )


class StatementDownloadRequest(BaseModel):
    """Request to download statement as PDF"""
    statement_id: int

    # ✓ FIXED: V1 Config → V2 ConfigDict
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "statement_id": 1
            }
        }
    )


# ============= Detailed Statement Schemas =============

class DetailedStatementRequestSubmission(BaseModel):
    """Request for detailed statement delivery"""
    statement_id: int = Field(..., description="ID of statement to detail")
    email: str = Field(..., description="Email for statement delivery")

    # ✓ FIXED: V1 Config → V2 ConfigDict
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "statement_id": 1,
                "email": "rider@example.com"
            }
        }
    )


class DetailedStatementRequestResponse(BaseModel):
    """Response after submitting detailed statement request"""
    request_id: int
    email: str
    status: str  # 'pending', 'in_progress', 'completed'
    sla_hours: int

    # ✓ FIXED: V1 Config → V2 ConfigDict
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "request_id": 1,
                "email": "rider@example.com",
                "status": "pending",
                "sla_hours": 24
            }
        }
    )


# ============= Statement History Schemas =============

class StatementHistoryItem(BaseModel):
    """Single statement in history"""
    id: int
    period_start: int
    period_end: int
    purpose: Optional[str]
    income: float
    total_expense: float
    net_profit: float
    verified: bool
    created_at: str

    # ✓ FIXED: V1 Config → V2 ConfigDict
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": 1,
                "period_start": 1641038400000,
                "period_end": 1643716800000,
                "purpose": "Loan Application",
                "income": 15000.0,
                "total_expense": 4000.0,
                "net_profit": 11000.0,
                "verified": True,
                "created_at": "2022-12-15T10:30:00"
            }
        }
    )


class StatementHistoryResponse(BaseModel):
    """Response for statement history list"""
    count: int
    statements: List[StatementHistoryItem]  # ✓ FIXED: Changed list[StatementHistoryItem] to List[StatementHistoryItem]

    # ✓ FIXED: V1 Config → V2 ConfigDict
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "count": 5,
                "statements": []
            }
        }
    )


# ============= Expense Entry Schemas =============

class FuelEntryCreate(BaseModel):
    """Request to create fuel entry"""
    cost: float = Field(..., gt=0, description="Fuel cost in KSh")
    liters: Optional[float] = Field(None, gt=0, description="Liters purchased")
    location: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=500)

    # ✓ FIXED: V1 Config → V2 ConfigDict
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "cost": 1500.0,
                "liters": 10,
                "location": "Shell Station, Nairobi",
                "notes": "Regular top-up"
            }
        }
    )


class MaintenanceEntryCreate(BaseModel):
    """Request to create maintenance entry"""
    cost: float = Field(..., gt=0, description="Service cost in KSh")
    service: str = Field(..., max_length=255, description="Type of service")
    mechanic: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=500)

    # ✓ FIXED: V1 Config → V2 ConfigDict
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "cost": 2000.0,
                "service": "Oil Change",
                "mechanic": "John's Garage",
                "notes": "Regular maintenance"
            }
        }
    )


class OtherExpenseCreate(BaseModel):
    """Request to create other expense entry"""
    amount: float = Field(..., gt=0, description="Expense amount in KSh")
    category: str = Field(..., max_length=100, description="Expense category")
    description: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=500)

    # ✓ FIXED: V1 Config → V2 ConfigDict
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "amount": 500.0,
                "category": "Insurance",
                "description": "Monthly insurance premium",
                "notes": "Bike insurance"
            }
        }
    )