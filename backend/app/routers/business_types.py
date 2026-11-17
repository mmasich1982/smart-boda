# backend/app/routers/business_types.py
# PUBLIC read of the Business Type list for Setup My Profile (the same pattern as GET /onboarding/fuel-types).
#   GET /onboarding/business-types -> [{code, display_name, sort_order}]
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.business import BusinessTypeMaster

router = APIRouter(prefix="/onboarding", tags=["Setup My Profile"])


@router.get("/business-types")
def get_business_types(db: Session = Depends(get_db)):
    rows = db.query(BusinessTypeMaster).filter_by(is_active=True).order_by(BusinessTypeMaster.sort_order, BusinessTypeMaster.id).all()
    return [{"code": r.code, "display_name": r.display_name, "sort_order": r.sort_order} for r in rows]
