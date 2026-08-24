# backend/app/routers/financial_master_data_admin.py
# Financial-related master data management for the Super Admin Console

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.financial_master_data import (
    ExpenseCategoryMaster,
    GoalTypeMaster,
    FamilyRelationshipMaster,
    FinancialRuleConfig
)
from app.auth import require_super_admin

# ═══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS FOR VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════

class ExpenseCategoryCreate(BaseModel):
    """Pydantic model for creating an expense category"""
    code: str
    display_name: str
    sort_order: int = 0


class ExpenseCategoryUpdate(BaseModel):
    """Pydantic model for updating an expense category"""
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


class GoalTypeCreate(BaseModel):
    """Pydantic model for creating a goal type"""
    code: str
    display_name: str
    sort_order: int = 0


class GoalTypeUpdate(BaseModel):
    """Pydantic model for updating a goal type"""
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


class FamilyRelationshipCreate(BaseModel):
    """Pydantic model for creating a family relationship"""
    code: str
    display_name: str
    sort_order: int = 0


class FamilyRelationshipUpdate(BaseModel):
    """Pydantic model for updating a family relationship"""
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


class FinancialRuleConfigUpdate(BaseModel):
    """Pydantic model for updating financial rule configuration"""
    target_min_trip_count: Optional[int] = None
    milestone_thresholds_pct: Optional[str] = None


router = APIRouter(
    prefix="/admin/financial-master-data",
    tags=["super-admin"],
    dependencies=[Depends(require_super_admin)]
)


# ═══════════════════════════════════════════════════════════════════════════════
# EXPENSE CATEGORY ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/expense-categories")
def list_expense_categories(db: Session = Depends(get_db)):
    """Get all expense categories ordered by sort order
    
    BR-SB13-006: Expense categories used for financial tracking
    """
    return db.query(ExpenseCategoryMaster).order_by(ExpenseCategoryMaster.sort_order).all()


@router.post("/expense-categories")
def create_expense_category(category: ExpenseCategoryCreate, db: Session = Depends(get_db)):
    """Create a new expense category master record"""
    # Check if code already exists
    existing = db.query(ExpenseCategoryMaster).filter(
        ExpenseCategoryMaster.code == category.code
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Expense category code already exists")
    
    row = ExpenseCategoryMaster(
        code=category.code,
        display_name=category.display_name,
        sort_order=category.sort_order
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/expense-categories/{category_id}")
def get_expense_category(category_id: int, db: Session = Depends(get_db)):
    """Get a specific expense category by ID"""
    category = db.query(ExpenseCategoryMaster).get(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Expense category not found")
    return category


@router.put("/expense-categories/{category_id}")
@router.patch("/expense-categories/{category_id}")  # ISSUE #2 FIX: Added PATCH support
def update_expense_category(
    category_id: int,
    category: ExpenseCategoryUpdate,
    db: Session = Depends(get_db)
):
    """Update an expense category master record
    
    ISSUE #2 FIX: Added @router.patch decorator for PATCH method support
    """
    row = db.query(ExpenseCategoryMaster).get(category_id)
    if not row:
        raise HTTPException(status_code=404, detail="Expense category not found")
    
    if category.display_name is not None:
        row.display_name = category.display_name
    if category.is_active is not None:
        row.is_active = category.is_active
    
    db.commit()
    db.refresh(row)
    return row


@router.delete("/expense-categories/{category_id}")
def delete_expense_category(category_id: int, db: Session = Depends(get_db)):
    """Delete an expense category master record"""
    row = db.query(ExpenseCategoryMaster).get(category_id)
    if not row:
        raise HTTPException(status_code=404, detail="Expense category not found")
    
    db.delete(row)
    db.commit()
    return {"message": "Expense category deleted successfully"}


# ═══════════════════════════════════════════════════════════════════════════════
# GOAL TYPE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/goal-types")
def list_goal_types(db: Session = Depends(get_db)):
    """Get all goal types ordered by sort order
    
    BR-SB17-002: Goal types used for goal management
    """
    return db.query(GoalTypeMaster).order_by(GoalTypeMaster.sort_order).all()


@router.post("/goal-types")
def create_goal_type(goal_type: GoalTypeCreate, db: Session = Depends(get_db)):
    """Create a new goal type master record"""
    # Check if code already exists
    existing = db.query(GoalTypeMaster).filter(
        GoalTypeMaster.code == goal_type.code
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Goal type code already exists")
    
    row = GoalTypeMaster(
        code=goal_type.code,
        display_name=goal_type.display_name,
        sort_order=goal_type.sort_order
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/goal-types/{goal_type_id}")
def get_goal_type(goal_type_id: int, db: Session = Depends(get_db)):
    """Get a specific goal type by ID"""
    goal_type = db.query(GoalTypeMaster).get(goal_type_id)
    if not goal_type:
        raise HTTPException(status_code=404, detail="Goal type not found")
    return goal_type


@router.put("/goal-types/{goal_type_id}")
@router.patch("/goal-types/{goal_type_id}")  # ISSUE #2 FIX: Added PATCH support
def update_goal_type(
    goal_type_id: int,
    goal_type: GoalTypeUpdate,
    db: Session = Depends(get_db)
):
    """Update a goal type master record
    
    ISSUE #2 FIX: Added @router.patch decorator for PATCH method support
    """
    row = db.query(GoalTypeMaster).get(goal_type_id)
    if not row:
        raise HTTPException(status_code=404, detail="Goal type not found")
    
    if goal_type.display_name is not None:
        row.display_name = goal_type.display_name
    if goal_type.is_active is not None:
        row.is_active = goal_type.is_active
    
    db.commit()
    db.refresh(row)
    return row


@router.delete("/goal-types/{goal_type_id}")
def delete_goal_type(goal_type_id: int, db: Session = Depends(get_db)):
    """Delete a goal type master record"""
    row = db.query(GoalTypeMaster).get(goal_type_id)
    if not row:
        raise HTTPException(status_code=404, detail="Goal type not found")
    
    db.delete(row)
    db.commit()
    return {"message": "Goal type deleted successfully"}


# ═══════════════════════════════════════════════════════════════════════════════
# FAMILY RELATIONSHIP ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/family-relationships")
def list_family_relationships(db: Session = Depends(get_db)):
    """Get all family relationships ordered by sort order"""
    return db.query(FamilyRelationshipMaster).order_by(FamilyRelationshipMaster.sort_order).all()


@router.post("/family-relationships")
def create_family_relationship(relationship: FamilyRelationshipCreate, db: Session = Depends(get_db)):
    """Create a new family relationship master record"""
    # Check if code already exists
    existing = db.query(FamilyRelationshipMaster).filter(
        FamilyRelationshipMaster.code == relationship.code
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Family relationship code already exists")
    
    row = FamilyRelationshipMaster(
        code=relationship.code,
        display_name=relationship.display_name,
        sort_order=relationship.sort_order
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/family-relationships/{relationship_id}")
def get_family_relationship(relationship_id: int, db: Session = Depends(get_db)):
    """Get a specific family relationship by ID"""
    relationship = db.query(FamilyRelationshipMaster).get(relationship_id)
    if not relationship:
        raise HTTPException(status_code=404, detail="Family relationship not found")
    return relationship


@router.put("/family-relationships/{relationship_id}")
@router.patch("/family-relationships/{relationship_id}")  # ISSUE #2 FIX: Added PATCH support
def update_family_relationship(
    relationship_id: int,
    relationship: FamilyRelationshipUpdate,
    db: Session = Depends(get_db)
):
    """Update a family relationship master record
    
    ISSUE #2 FIX: Added @router.patch decorator for PATCH method support
    """
    row = db.query(FamilyRelationshipMaster).get(relationship_id)
    if not row:
        raise HTTPException(status_code=404, detail="Family relationship not found")
    
    if relationship.display_name is not None:
        row.display_name = relationship.display_name
    if relationship.is_active is not None:
        row.is_active = relationship.is_active
    
    db.commit()
    db.refresh(row)
    return row


@router.delete("/family-relationships/{relationship_id}")
def delete_family_relationship(relationship_id: int, db: Session = Depends(get_db)):
    """Delete a family relationship master record"""
    row = db.query(FamilyRelationshipMaster).get(relationship_id)
    if not row:
        raise HTTPException(status_code=404, detail="Family relationship not found")
    
    db.delete(row)
    db.commit()
    return {"message": "Family relationship deleted successfully"}


# ═══════════════════════════════════════════════════════════════════════════════
# FINANCIAL RULE CONFIGURATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/rule-config")
def get_rule_config(db: Session = Depends(get_db)):
    """Get the current financial rule configuration"""
    config = db.query(FinancialRuleConfig).get(1)
    if not config:
        raise HTTPException(status_code=404, detail="Financial rule configuration not found")
    return config


@router.put("/rule-config")
@router.patch("/rule-config")  # ISSUE #2 FIX: Added PATCH support
def update_rule_config(
    config: FinancialRuleConfigUpdate,
    db: Session = Depends(get_db)
):
    """Update financial rule configuration
    
    ISSUE #2 FIX: Added @router.patch decorator for PATCH method support
    BR-SB15-002/006 — One write, app-wide effect, no release needed
    """
    row = db.query(FinancialRuleConfig).get(1)
    if not row:
        raise HTTPException(status_code=404, detail="Financial rule configuration not found")
    
    if config.target_min_trip_count is not None:
        row.target_min_trip_count = config.target_min_trip_count
    if config.milestone_thresholds_pct is not None:
        row.milestone_thresholds_pct = config.milestone_thresholds_pct
    
    db.commit()
    db.refresh(row)
    return row  # BR-SB15-002/006 — one write, app-wide effect, no release needed
