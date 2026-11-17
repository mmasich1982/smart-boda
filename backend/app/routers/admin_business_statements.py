# backend/app/routers/admin_business_statements.py
# SMART BIZNA (admin side), journeys J and O of the scope document.
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
    from app.routers.business_ops import record_dicts, transaction_lines, Ctx
    recs, pays, users, spays = record_dicts(db, b.id)
    start, end = npf.range_bounds(date_from, date_to)
    totals = npf.compute(recs, pays, start, end, users, spays)
    out = {"business_id": str(b.id), "business_name": b.business_name, "date_from": date_from.isoformat(), "date_to": date_to.isoformat(),
           "generated_at": _iso(_now()), "source": "server", "type": "detailed" if detailed else "summary", "totals": totals,
           "verification_code": npf.statement_code(b.id, date_from.isoformat(), date_to.isoformat(), totals)}
    if detailed:
        rows = transaction_lines(db, Ctx(None, b), start, end)
        out["lines"] = [{"when": x["when"], "type": x["type"], "details": x["details"], "payment_method": x["payment_method"], "amount": x["amount"],
                         "status": x["status"], "recorded_by": (x["recorded_by"] or {}).get("name"), "role": (x["recorded_by"] or {}).get("role")}
                        for x in sorted(rows, key=lambda r: r["when"])]
    return out


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
