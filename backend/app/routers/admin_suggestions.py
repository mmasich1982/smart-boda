# backend/app/routers/admin_suggestions.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from app.database import get_db
from app.models.suggestion import Suggestion
from app.middleware.auth import verify_admin_token

router = APIRouter(prefix="/admin/suggestions", tags=["admin-suggestions"])


@router.get("")
def list_all_suggestions(
    page: int = 1,
    page_size: int = 20,
    category_code: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    admin_token: dict = Depends(verify_admin_token)
):
    """
    Retrieve all suggestions submitted by riders (admin access only).
    Admin can filter by category and search by message content.
    Results are ordered by submission date (newest first).
    """
    q = db.query(Suggestion)

    if category_code:
        q = q.filter_by(category_code=category_code)

    if search:
        q = q.filter(Suggestion.message.ilike(f"%{search}%"))

    q = q.order_by(desc(Suggestion.submitted_at))
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": [
            {
                "id": str(item.id),
                "rider_id": str(item.rider_id),
                "category_code": item.category_code,
                "message": item.message,
                "submitted_at": item.submitted_at.isoformat()
            }
            for item in items
        ],
        "page": page,
        "total_pages": max(1, -(-total // page_size)),
        "total": total
    }


@router.get("/{suggestion_id}")
def get_suggestion_detail(
    suggestion_id: str,
    db: Session = Depends(get_db),
    admin_token: dict = Depends(verify_admin_token)
):
    """
    Retrieve details for a specific suggestion (admin access only).
    """
    suggestion = db.query(Suggestion).filter_by(id=suggestion_id).first()
    if not suggestion:
        raise HTTPException(404, "Suggestion not found.")

    return {
        "id": str(suggestion.id),
        "rider_id": str(suggestion.rider_id),
        "category_code": suggestion.category_code,
        "message": suggestion.message,
        "submitted_at": suggestion.submitted_at.isoformat()
    }