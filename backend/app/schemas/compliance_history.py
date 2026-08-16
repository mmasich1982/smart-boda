# backend/app/schemas/compliance_history.py
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date

class DocumentRequest(BaseModel):
    document_type_code: str                    # BR-SB18-001
    expiry_date: Optional[date] = None          # BR-SB18-002/003: required+future only if the type expires

class StatementRequest(BaseModel):
    period_start: date                          # carried forward from Financial History, BR-SB20-002
    period_end: date
    purpose_code: Optional[str] = None        # BR-SB20-003: optional

class StatementDownloadRequest(BaseModel):
    statement_id: str
