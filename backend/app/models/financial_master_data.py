# backend/app/models/financial_master_data.py
# AUDIT FIX (MVP0 §04, Gap): same pattern as fuel_master_data.py -- ExpenseCategoryMaster,
# GoalTypeMaster, FamilyRelationshipMaster already exist in their own files and are
# re-exported here; FinancialRuleConfig genuinely didn't exist, transcribed from the columns
# already specified in alembic/0004_module_d_financial_performance.py.
from sqlalchemy import Column, Integer, String
from app.database import Base
from app.models.expense_category_master import ExpenseCategoryMaster  # noqa: F401 (re-export)
from app.models.goal_type_master import GoalTypeMaster  # noqa: F401 (re-export)
from app.models.family_relationship_master import FamilyRelationshipMaster  # noqa: F401 (re-export)


class FinancialRuleConfig(Base):
    __tablename__ = "financial_rule_config"
    id = Column(Integer, primary_key=True)  # single-row config table
    target_min_trip_count = Column(Integer, default=7)  # BR-SB15-002
    milestone_thresholds_pct = Column(String(30), default="50,75,100")
