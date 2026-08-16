# backend/app/services/savings_service.py
# ADDED: sb16_savings_tracker.py had this logic written inline in the router; extracted so it
# can be unit-tested directly (backend/tests expects add_savings_contribution(db, account_id,
# amount) as an importable function) and so lifetime_total updates atomically with the insert.
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.savings_account import SavingsAccount
from app.models.savings_contribution import SavingsContribution


def add_savings_contribution(db: Session, account_id: str, amount: float) -> SavingsContribution:
    if not amount or amount <= 0:
        raise ValueError("Enter an amount greater than zero.")  # EXC-SB16-002
    contribution = SavingsContribution(account_id=account_id, amount=amount,
                                        submitted_at=datetime.now(timezone.utc))  # BR-SB16-006
    db.add(contribution)
    account = db.query(SavingsAccount).get(account_id)
    account.lifetime_total = float(account.lifetime_total or 0) + float(amount)
    db.commit()
    db.refresh(contribution)
    return contribution
