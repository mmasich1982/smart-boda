# backend/app/routers/sb18_compliance.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database import get_db
from app.models.compliance_document import ComplianceDocument
from app.models.compliance_master_data import DocumentTypeMaster, ComplianceRuleConfig
from app.schemas.compliance_history import DocumentRequest
from app.services.document_status_service import document_status, STATUS_URGENCY, check_expiry_reminders

router = APIRouter(prefix="/compliance", tags=["sb-18"])

@router.get("/documents")
def list_documents(rider_id: str = Query(..., description="Rider ID"), db: Session = Depends(get_db)):
    today = datetime.now(timezone.utc).date()
    config = db.query(ComplianceRuleConfig).get(1)
    docs = db.query(ComplianceDocument).filter_by(rider_id=rider_id, archived=False).all()
    rows = []
    for d in docs:
        status = document_status(d.expiry_date, today)
        fired = check_expiry_reminders(d, today, config.expiry_reminder_first_days, config.expiry_reminder_final_days)
        rows.append({"id": str(d.id), "document_type_code": d.document_type_code, "expiry_date": d.expiry_date,
                      "status": status, "reminders_fired": fired})
    db.commit()  # persists any reminder flags flipped above
    return sorted(rows, key=lambda r: STATUS_URGENCY[r["status"]])  # BR-SB18-007: most urgent first

# NTF bell icon: how many active documents currently need action (BR-SB18-012)
@router.get("/documents/action-needed-count")
def action_needed_count(rider_id: str = Query(..., description="Rider ID"), db: Session = Depends(get_db)):
    today = datetime.now(timezone.utc).date()
    docs = db.query(ComplianceDocument).filter_by(rider_id=rider_id, archived=False).all()
    count = sum(1 for d in docs if document_status(d.expiry_date, today) != "valid")
    return {"count": count}

@router.post("/documents")
def save_document(
    payload: DocumentRequest, 
    rider_id: str = Query(..., description="Rider ID"),
    db: Session = Depends(get_db)
):
    if not payload.document_type_code:
        raise HTTPException(422, "Select a Document Type.")  # EXC-SB18-001
    if not payload.expiry_date:
        raise HTTPException(422, "Enter an Expiry Date for this document type.")  # EXC-SB18-002 — both governed types always expire
    if payload.expiry_date <= datetime.now(timezone.utc).date():
        raise HTTPException(422, "Expiry Date must be in the future.")  # EXC-SB18-003

    # BR-SB18-004: archive any prior non-archived record of this type, never delete it
    existing = db.query(ComplianceDocument).filter_by(rider_id=rider_id, document_type_code=payload.document_type_code, archived=False).first()
    is_renewal = existing is not None
    if existing:
        existing.archived = True

    doc = ComplianceDocument(rider_id=rider_id, document_type_code=payload.document_type_code,
                              expiry_date=payload.expiry_date, submitted_at=datetime.now(timezone.utc))
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {"id": str(doc.id), "is_renewal": is_renewal, "ok": True}  # NTF-SB18-001/002 choose copy off is_renewal

@router.get("/documents/history")
def document_history(rider_id: str = Query(..., description="Rider ID"), db: Session = Depends(get_db)):
    return db.query(ComplianceDocument).filter_by(rider_id=rider_id).order_by(ComplianceDocument.submitted_at.desc()).all()  # BR-SB18-010: archived rows included, never deleted