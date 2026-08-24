# backend/app/services/statement_service.py
import random, string
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.statement import Statement

def generate_verification_reference() -> str:
    return "SB-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=10))  # BR-SB20-004

# Called both at generation time (if online) and by the sync-queue follow-up step (EXC-SB20-006)
def verify_statement(db: Session, statement: Statement) -> dict:
    if not statement.verified:
        statement.verification_reference = generate_verification_reference()
        statement.verified = True
        db.commit()
    return {"verification_reference": statement.verification_reference, "verified": statement.verified}
