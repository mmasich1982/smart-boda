# backend/app/routers/legal_content.py
# Public endpoints for riders to fetch Terms of Service and Privacy Policy documents
# Issue 15 fix: Terms and Privacy documents are now fetched from backend instead of hardcoded

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.legal_content import LegalContent

router = APIRouter(prefix="/legal", tags=["legal"])

@router.get("/terms-of-service")
def get_terms_of_service(db: Session = Depends(get_db)):
    """Get the current Terms of Service document"""
    doc = db.query(LegalContent).filter_by(key="terms_of_service").first()
    if not doc:
        # Fallback: return a placeholder until admin uploads actual content
        return {
            "key": "terms_of_service",
            "content": "Terms of Service - Please check back later or contact support.",
            "updated_at": None
        }
    return {
        "key": doc.key,
        "content": doc.content,
        "updated_at": doc.updated_at
    }

@router.get("/data-privacy-notice")
def get_data_privacy_notice(db: Session = Depends(get_db)):
    """Get the current Data Privacy Notice document"""
    doc = db.query(LegalContent).filter_by(key="data_privacy_notice").first()
    if not doc:
        # Fallback: return a placeholder until admin uploads actual content
        return {
            "key": "data_privacy_notice",
            "content": "Data Privacy Notice - Please check back later or contact support.",
            "updated_at": None
        }
    return {
        "key": doc.key,
        "content": doc.content,
        "updated_at": doc.updated_at
    }

@router.get("/all")
def get_all_legal_documents(db: Session = Depends(get_db)):
    """Get all legal documents at once (for caching)"""
    docs = db.query(LegalContent).all()
    return {
        doc.key: {
            "content": doc.content,
            "updated_at": doc.updated_at
        }
        for doc in docs
    }