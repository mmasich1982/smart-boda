# backend/app/routers/compliance_master_data_admin.py
# Compliance-related master data management for the Super Admin Console

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.compliance_master_data import (
    DocumentTypeMaster,
    StatementPurposeMaster,
    ComplianceRuleConfig
)
from app.auth import require_super_admin

# ═══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS FOR VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════

class DocumentTypeCreate(BaseModel):
    """Pydantic model for creating a document type"""
    code: str
    display_name: str
    sort_order: int = 0


class DocumentTypeUpdate(BaseModel):
    """Pydantic model for updating a document type"""
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


class StatementPurposeCreate(BaseModel):
    """Pydantic model for creating a statement purpose"""
    code: str
    display_name: str
    sort_order: int = 0


class StatementPurposeUpdate(BaseModel):
    """Pydantic model for updating a statement purpose"""
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


class ComplianceRuleConfigUpdate(BaseModel):
    """Pydantic model for updating compliance rule configuration"""
    expiry_reminder_first_days: Optional[int] = None
    expiry_reminder_final_days: Optional[int] = None
    transaction_list_page_size: Optional[int] = None
    statement_history_page_size: Optional[int] = None


router = APIRouter(
    prefix="/admin/compliance-master-data",
    tags=["super-admin"],
    dependencies=[Depends(require_super_admin)]
)


# ═══════════════════════════════════════════════════════════════════════════════
# DOCUMENT TYPE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/document-types")
def list_document_types(db: Session = Depends(get_db)):
    """Get all document types ordered by sort order
    
    BR-SB18-002: Only the 2 governed types the rider ever sees
    """
    return db.query(DocumentTypeMaster).order_by(DocumentTypeMaster.sort_order).all()


@router.post("/document-types")
def create_document_type(doc_type: DocumentTypeCreate, db: Session = Depends(get_db)):
    """Create a new document type master record"""
    # Check if code already exists
    existing = db.query(DocumentTypeMaster).filter(
        DocumentTypeMaster.code == doc_type.code
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Document type code already exists")
    
    row = DocumentTypeMaster(
        code=doc_type.code,
        display_name=doc_type.display_name,
        sort_order=doc_type.sort_order
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/document-types/{doc_type_id}")
def get_document_type(doc_type_id: int, db: Session = Depends(get_db)):
    """Get a specific document type by ID"""
    doc_type = db.query(DocumentTypeMaster).get(doc_type_id)
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    return doc_type


@router.put("/document-types/{doc_type_id}")
@router.patch("/document-types/{doc_type_id}")  # ISSUE #2 FIX: Added PATCH support
def update_document_type(
    doc_type_id: int,
    doc_type: DocumentTypeUpdate,
    db: Session = Depends(get_db)
):
    """Update a document type master record
    
    ISSUE #2 FIX: Added @router.patch decorator for PATCH method support
    """
    row = db.query(DocumentTypeMaster).get(doc_type_id)
    if not row:
        raise HTTPException(status_code=404, detail="Document type not found")
    
    if doc_type.display_name is not None:
        row.display_name = doc_type.display_name
    if doc_type.is_active is not None:
        row.is_active = doc_type.is_active
    
    db.commit()
    db.refresh(row)
    return row


@router.delete("/document-types/{doc_type_id}")
def delete_document_type(doc_type_id: int, db: Session = Depends(get_db)):
    """Delete a document type master record"""
    row = db.query(DocumentTypeMaster).get(doc_type_id)
    if not row:
        raise HTTPException(status_code=404, detail="Document type not found")
    
    db.delete(row)
    db.commit()
    return {"message": "Document type deleted successfully"}


# ═══════════════════════════════════════════════════════════════════════════════
# STATEMENT PURPOSE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/statement-purposes")
def list_statement_purposes(db: Session = Depends(get_db)):
    """Get all statement purposes ordered by sort order"""
    return db.query(StatementPurposeMaster).order_by(StatementPurposeMaster.sort_order).all()


@router.post("/statement-purposes")
def create_statement_purpose(purpose: StatementPurposeCreate, db: Session = Depends(get_db)):
    """Create a new statement purpose master record"""
    # Check if code already exists
    existing = db.query(StatementPurposeMaster).filter(
        StatementPurposeMaster.code == purpose.code
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Statement purpose code already exists")
    
    row = StatementPurposeMaster(
        code=purpose.code,
        display_name=purpose.display_name,
        sort_order=purpose.sort_order
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/statement-purposes/{purpose_id}")
def get_statement_purpose(purpose_id: int, db: Session = Depends(get_db)):
    """Get a specific statement purpose by ID"""
    purpose = db.query(StatementPurposeMaster).get(purpose_id)
    if not purpose:
        raise HTTPException(status_code=404, detail="Statement purpose not found")
    return purpose


@router.put("/statement-purposes/{purpose_id}")
@router.patch("/statement-purposes/{purpose_id}")  # ISSUE #2 FIX: Added PATCH support
def update_statement_purpose(
    purpose_id: int,
    purpose: StatementPurposeUpdate,
    db: Session = Depends(get_db)
):
    """Update a statement purpose master record
    
    ISSUE #2 FIX: Added @router.patch decorator for PATCH method support
    """
    row = db.query(StatementPurposeMaster).get(purpose_id)
    if not row:
        raise HTTPException(status_code=404, detail="Statement purpose not found")
    
    if purpose.display_name is not None:
        row.display_name = purpose.display_name
    if purpose.is_active is not None:
        row.is_active = purpose.is_active
    
    db.commit()
    db.refresh(row)
    return row


@router.delete("/statement-purposes/{purpose_id}")
def delete_statement_purpose(purpose_id: int, db: Session = Depends(get_db)):
    """Delete a statement purpose master record"""
    row = db.query(StatementPurposeMaster).get(purpose_id)
    if not row:
        raise HTTPException(status_code=404, detail="Statement purpose not found")
    
    db.delete(row)
    db.commit()
    return {"message": "Statement purpose deleted successfully"}


# ═══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE RULE CONFIGURATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/rule-config")
def get_rule_config(db: Session = Depends(get_db)):
    """Get the current compliance rule configuration"""
    config = db.query(ComplianceRuleConfig).get(1)
    if not config:
        raise HTTPException(status_code=404, detail="Compliance rule configuration not found")
    return config


@router.put("/rule-config")
@router.patch("/rule-config")  # ISSUE #2 FIX: Added PATCH support
def update_rule_config(
    config: ComplianceRuleConfigUpdate,
    db: Session = Depends(get_db)
):
    """Update compliance rule configuration
    
    ISSUE #2 FIX: Added @router.patch decorator for PATCH method support
    BR-SB18-006/BR-SB19-010/BR-SB20-010 — One write, app-wide effect, no release needed
    """
    row = db.query(ComplianceRuleConfig).get(1)
    if not row:
        raise HTTPException(status_code=404, detail="Compliance rule configuration not found")
    
    if config.expiry_reminder_first_days is not None:
        row.expiry_reminder_first_days = config.expiry_reminder_first_days
    if config.expiry_reminder_final_days is not None:
        row.expiry_reminder_final_days = config.expiry_reminder_final_days
    if config.transaction_list_page_size is not None:
        row.transaction_list_page_size = config.transaction_list_page_size
    if config.statement_history_page_size is not None:
        row.statement_history_page_size = config.statement_history_page_size
    
    db.commit()
    db.refresh(row)
    return row  # BR-SB18-006/BR-SB19-010/BR-SB20-010 — one write, app-wide effect, no release needed
