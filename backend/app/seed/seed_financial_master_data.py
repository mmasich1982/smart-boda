# backend/app/seed/seed_financial_master_data.py
from app.database import SessionLocal
from app.models.financial_master_data import ExpenseCategoryMaster, GoalTypeMaster, FamilyRelationshipMaster, FinancialRuleConfig

EXPENSE_CATEGORIES = [
    {"code": "loan_repayment", "display_name": "Loan Repayment", "sort_order": 1},
    {"code": "sacco_dues", "display_name": "SACCO Dues", "sort_order": 2},
    {"code": "personal_draw", "display_name": "Personal Draw", "sort_order": 3},
    {"code": "household", "display_name": "Household", "sort_order": 4},
    {"code": "other", "display_name": "Other", "sort_order": 5},
]
GOAL_TYPES = [
    {"code": "school_fees", "display_name": "School Fees", "sort_order": 1},
    {"code": "land", "display_name": "Land", "sort_order": 2},
    {"code": "second_bike", "display_name": "Second Bike", "sort_order": 3},
    {"code": "other", "display_name": "Other", "sort_order": 4},
]
FAMILY_RELATIONSHIPS = [
    {"code": "mother", "display_name": "Mother", "sort_order": 1},
    {"code": "father", "display_name": "Father", "sort_order": 2},
    {"code": "wife", "display_name": "Wife", "sort_order": 3},
    {"code": "husband", "display_name": "Husband", "sort_order": 4},
    {"code": "child", "display_name": "Child", "sort_order": 5},
    {"code": "sibling", "display_name": "Sibling", "sort_order": 6},
    {"code": "other", "display_name": "Other", "sort_order": 7},
]

def run():
    db = SessionLocal()
    for row in EXPENSE_CATEGORIES: db.merge(ExpenseCategoryMaster(**row))
    for row in GOAL_TYPES: db.merge(GoalTypeMaster(**row))
    for row in FAMILY_RELATIONSHIPS: db.merge(FamilyRelationshipMaster(**row))
    db.merge(FinancialRuleConfig(id=1, target_min_trip_count=7, milestone_thresholds_pct="50,75,100"))
    db.commit()
    db.close()

if __name__ == "__main__":
    run()
