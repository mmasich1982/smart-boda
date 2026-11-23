# backend/app/routers/admin_business_statements.py
# SMART BIZNA (admin side), journeys J and O of the scope document.  Statements are built from the DAILY SUMMARIES (the server keeps one year).
#   GET  /admin/business-statements?status=            Statement Requests: every request with business, period, type and status
#   POST /admin/business-statements/{id}/prepare       the Administrator prepares the statement FROM THE SERVER RECORDS and marks it Ready
# The phone renders the PDF from the prepared statement, so nothing is e-mailed.
from datetime import date
from uuid import UUID as RowId
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.auth import require_admin
from app.database import get_db
from app.models.business import Business, BusinessUser
from app.models.business_ops import BusinessStatementRequest, READY, REQUESTED
from app.routers.business_ops import _iso, _now
from app.services import business_net_profit_service as npf

router = APIRouter(prefix="/admin/business-statements", tags=["admin-business-statements"], dependencies=[Depends(require_admin)])


def build_statement(db: Session, b: Business, date_from: date, date_to: date, detailed: bool):
    """A statement for ANY period inside the year the server keeps, from the DAILY SUMMARIES: the same totals, tables and verification code as the phone builds."""
    from app.services import business_daily_service as svc
    rows = svc.summary_dicts(svc.rows_in(db, b.id, date_from, date_to))
    users = [{"id": u.id, "full_name": u.full_name, "role": u.role} for u in db.query(BusinessUser).filter_by(business_id=b.id).all()]
    totals = svc.merge_summaries(rows, users)
    kind = "detailed" if detailed else "summary"
    return {"business_id": str(b.id), "business_name": b.business_name, "date_from": date_from.isoformat(), "date_to": date_to.isoformat(),
            "generated_at": _iso(_now()), "source": "server", "type": kind, "totals": totals, "tables": svc.build_tables(kind, date_from, date_to, rows),
            "verification_code": npf.statement_code(b.id, date_from.isoformat(), date_to.isoformat(), totals)}


@router.get("")
def list_requests(status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(BusinessStatementRequest, Business).join(Business, Business.id == BusinessStatementRequest.business_id)
    if status:
        q = q.filter(BusinessStatementRequest.status == status)
    rows = q.order_by(BusinessStatementRequest.requested_at.desc()).all()
    return {"total": len(rows), "items": [{"id": str(r.id), "business_id": str(b.id), "business_name": b.business_name, "client_id": r.client_id,
                                            "statement_type": r.statement_type, "period_from": r.period_from.isoformat(), "period_to": r.period_to.isoformat(),
                                            "purpose": r.purpose, "status": r.status, "requested_at": _iso(r.requested_at), "ready_at": _iso(r.ready_at)}
                                           for r, b in rows]}


@router.post("/{request_id}/prepare")
def prepare(request_id: RowId, admin=Depends(require_admin), db: Session = Depends(get_db)):
    r = db.query(BusinessStatementRequest).filter_by(id=request_id).first()
    if not r:
        raise HTTPException(404, "Request not found.")
    b = db.query(Business).filter_by(id=r.business_id).first()
    r.statement = build_statement(db, b, r.period_from, r.period_to, r.statement_type == "detailed")
    r.status, r.ready_at, r.prepared_by_admin_id = READY, _now(), getattr(admin, "id", None)
    db.commit()
    return {"status": r.status, "verification_code": r.statement["verification_code"], "totals": r.statement["totals"]}
