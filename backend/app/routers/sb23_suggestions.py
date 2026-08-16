# backend/app/routers/sb23_suggestions.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database import get_db
from app.models.suggestion import Suggestion

router = APIRouter(prefix="/suggestions", tags=["sb-23"])


@router.post("")
def submit_suggestion(
    rider_id: str = Query(..., description="Rider ID is required"),
    category_code: str | None = Query(None, description="Suggestion category"),
    message: str = Query(..., description="Suggestion message"),
    db: Session = Depends(get_db)
):
    """
    Submit a suggestion or feedback (RA-35).
    - rider_id: required, identifies the rider
    - category_code: optional; if not provided, defaults to 'Other'
    - message: required and capped at 500 characters
    """
    if not message or not message.strip():
        raise HTTPException(422, "Please write your message before sending.")
    
    s = Suggestion(
        rider_id=rider_id,
        category_code=category_code or 'Other',
        message=message.strip()[:500],
        submitted_at=datetime.now(timezone.utc)
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": str(s.id)}


@router.get("")
def list_suggestions(
    rider_id: str = Query(..., description="Rider ID is required"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db)
):
    """
    Retrieve a rider's past feedback (RA-35).
    A rider only ever sees their own past feedback, never anyone else's.
    Results are ordered by submission date (newest first).
    """
    if not rider_id:
        raise HTTPException(422, "rider_id is required")
    
    q = db.query(Suggestion).filter_by(rider_id=rider_id).order_by(Suggestion.submitted_at.desc())
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": items,
        "page": page,
        "total_pages": max(1, -(-total // page_size)),
        "total": total
    }