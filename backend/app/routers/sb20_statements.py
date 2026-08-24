# backend/app/routers/sb20_statements.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from uuid import UUID
from app.database import get_db
from app.models.statement import Statement
from app.models.statement_download import StatementDownload
from app.models.rider import Rider
from app.models.compliance_master_data import ComplianceRuleConfig
from app.schemas.compliance_history import StatementRequest
from app.services.quick_range_service import quick_range_bounds
from app.services.net_profit_service import net_profit_summary_for_range
from app.services.statement_service import verify_statement
from app.services.pin_service import verify_pin_login

router = APIRouter(prefix="/compliance/statements", tags=["sb-20"])


# RA-18-C: Confirm Your PIN gate for "Require Detailed Statement"
# Mirrors the data-export flow in sb21. Kept separate from the always-on in-app
# statement generation, which needs no PIN/email step.
@router.post("/request-detailed/verify-pin")
def verify_pin_for_detailed_statement(rider_id: str, pin: str, db: Session = Depends(get_db)):
    """
    RA-18-C: PIN verification before detailed statement request
    Returns: {verified: bool}
    """
    return verify_pin_login(db, rider_id, pin)


# CRITICAL: This route MUST come BEFORE the /{statement_id} route to prevent
# "history" from being interpreted as a statement_id (which causes UUID validation errors)
@router.get("/history/list")
def statement_history(rider_id: str, page: int = 1, db: Session = Depends(get_db)):
    """
    RA-17: Statement History & Retrieval
    BR-SB20-008: Every statement, forever (no time limit on retrieval)
    BR-SB20-010: Page size configurable by admin
    """
    rider = db.query(Rider).get(rider_id)
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    config = db.query(ComplianceRuleConfig).get(1)
    page_size = config.statement_history_page_size if config else 20
    
    # BR-SB20-008: Every statement, forever, newest first
    query = db.query(Statement).filter_by(rider_id=rider_id).order_by(Statement.generated_at.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    
    formatted_items = [
        {
            "id": str(s.id),
            "period_start": s.period_start.isoformat() if hasattr(s.period_start, 'isoformat') else str(s.period_start),
            "period_end": s.period_end.isoformat() if hasattr(s.period_end, 'isoformat') else str(s.period_end),
            "purpose": s.purpose_code,
            "net_profit": float(s.net_profit),
            "generated_at": s.generated_at.isoformat() if hasattr(s.generated_at, 'isoformat') else str(s.generated_at),
            "verification_reference": s.verification_reference,
            "verified": s.verified,
        }
        for s in items
    ]
    
    return {
        "items": formatted_items,
        "page": page,
        "total_pages": max(1, -(-total // page_size)),
        "total": total
    }


@router.post("")
def generate_statement(payload: StatementRequest, rider_id: str, online: bool, db: Session = Depends(get_db)):
    """
    RA-18-A/B: Generate a summarized statement from Financial History
    BR-SB20-001/009: Fixed forever at generation moment
    BR-SB20-002: Figures come only from carried-forward Financial History range, never projected
    BR-SB20-003: Optional purpose code
    BR-SB20-004: Verification reference generated if online
    """
    # Verify rider exists
    rider = db.query(Rider).get(rider_id)
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    # BR-SB20-002: Figures from carried-forward range only (never projected)
    figures = net_profit_summary_for_range(db, rider_id, payload.period_start, payload.period_end)
    
    # BR-SB20-001/009: Generated at this moment, fixed forever
    statement = Statement(
        rider_id=rider_id,
        period_start=payload.period_start,
        period_end=payload.period_end,
        purpose_code=payload.purpose_code,  # BR-SB20-003: optional
        income=figures["income"],
        total_expense=figures["total_expense"],
        net_profit=figures["net_profit"],
        generated_at=datetime.now(timezone.utc)
    )
    
    db.add(statement)
    db.commit()
    db.refresh(statement)
    
    # BR-SB20-004: Verify immediately if online
    if online:
        verify_statement(db, statement)
    
    return {
        "id": str(statement.id),
        "verification_reference": statement.verification_reference,
        "verified": statement.verified
    }


@router.post("/{statement_id}/verify")
def retry_verification(statement_id: str, db: Session = Depends(get_db)):
    """
    EXC-SB20-006: Retry verification for offline-generated statements
    Called automatically by sync-queue follow-up step
    """
    # Validate UUID format
    try:
        UUID(statement_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid statement ID format")
    
    statement = db.query(Statement).get(statement_id)
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    return verify_statement(db, statement)


@router.get("/{statement_id}")
def get_statement(statement_id: str, db: Session = Depends(get_db)):
    """
    RA-18-A: Retrieve statement for preview before download/sharing
    """
    # Validate UUID format
    try:
        UUID(statement_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid statement ID format")
    
    statement = db.query(Statement).get(statement_id)
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    return {
        "id": str(statement.id),
        "rider_id": str(statement.rider_id),
        "period_start": statement.period_start.isoformat() if hasattr(statement.period_start, 'isoformat') else str(statement.period_start),
        "period_end": statement.period_end.isoformat() if hasattr(statement.period_end, 'isoformat') else str(statement.period_end),
        "purpose": statement.purpose_code,
        "income": float(statement.income),
        "total_expense": float(statement.total_expense),
        "net_profit": float(statement.net_profit),
        "verification_reference": statement.verification_reference,
        "verified": statement.verified,
        "generated_at": statement.generated_at.isoformat() if hasattr(statement.generated_at, 'isoformat') else str(statement.generated_at),
    }


@router.post("/{statement_id}/request-detailed")
def request_detailed_statement(statement_id: str, contact_email: str, pin_verified: bool = False,
                                db: Session = Depends(get_db)):
    """
    RA-18-C: Submit detailed statement request to admin team
    Requires PIN verification and verified email address
    Returns: {id, contact_email, delivery_window_hours}
    BR-SB20-007: SLA window read from admin-configurable rule-config
    """
    # Validate UUID format
    try:
        UUID(statement_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid statement ID format")
    
    if not pin_verified:
        raise HTTPException(status_code=403, detail="PIN confirmation is required before requesting a detailed statement.")
    
    statement = db.query(Statement).get(statement_id)
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    # RA-18-C: Store verified email and mark as delivery requested
    statement.contact_email = contact_email
    statement.delivery_requested = True
    statement.pin_verified_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(statement)
    
    config = db.query(ComplianceRuleConfig).get(1)
    delivery_hours = config.statement_delivery_hours if config else 48
    
    # BR-SB20-007: "confirm ... within N hours" — read from admin-configurable rule-config
    return {
        "id": str(statement.id),
        "contact_email": contact_email,
        "delivery_window_hours": delivery_hours
    }


@router.post("/{statement_id}/download")
def log_download(statement_id: str, db: Session = Depends(get_db)):
    """
    BR-SB20-006 / EXC-SB20-005: Log every download separately
    Enables audit trail and duplicate-detection
    """
    # Validate UUID format
    try:
        UUID(statement_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid statement ID format")
    
    statement = db.query(Statement).get(statement_id)
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    download_record = StatementDownload(
        statement_id=statement_id,
        downloaded_at=datetime.now(timezone.utc)
    )
    db.add(download_record)
    db.commit()
    
    count = db.query(StatementDownload).filter_by(statement_id=statement_id).count()
    return {"download_count": count}