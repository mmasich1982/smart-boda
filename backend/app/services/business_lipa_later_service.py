# backend/app/services/business_lipa_later_service.py
# SMART BIZNA Lipa Later rules. These are the rider app's rules from routers/sb05_lipa_later.py, applied to the business tables:
#   * remaining balance = original amount - everything paid (never below 0)             (get_remaining_balance)
#   * status is "paid" when the balance reaches 0, otherwise "pending"                  (update_lipa_later_status)
#   * days overdue = days after the due date (0 when due today or in the future)        (calculate_days_overdue)
#   * ageing buckets: current, 1-30, 31-60, 61-90, 90+ days overdue                    (get_ageing_report)
# Smart Bizna adds only what a business needs: Full must cover the balance, Partial must be below it (checked in the router).
from datetime import date, datetime, timezone
from decimal import Decimal
from app.models.business_lipa_later import BusinessLipaLaterPayment, BusinessSupplierLipaPayment
from app.services.business_net_profit_service import EAT


def today_eat() -> date:
    return datetime.now(timezone.utc).astimezone(EAT).date()


def calculate_days_overdue(due_date: date, today: date = None) -> int:
    today = today or today_eat()
    return 0 if due_date >= today else (today - due_date).days


# The SAME rules serve both sides: customers who owe the business (default) and suppliers the business owes (pay_model=BusinessSupplierLipaPayment).
def paid_sum(db, record, pay_model=BusinessLipaLaterPayment) -> Decimal:
    rows = db.query(pay_model.amount_ksh).filter(pay_model.lipa_later_id == record.id).all()
    return sum((Decimal(str(r[0])) for r in rows if r[0]), Decimal("0"))


def get_remaining_balance(record, db, pay_model=BusinessLipaLaterPayment) -> float:
    if not record:
        return 0.0
    return float(max(Decimal("0"), Decimal(str(record.amount)) - paid_sum(db, record, pay_model)))


def update_lipa_later_status(record, db, pay_model=BusinessLipaLaterPayment) -> str:
    if get_remaining_balance(record, db, pay_model) <= 0:
        record.status, record.paid_at = "paid", datetime.now(timezone.utc)
        return "paid"
    record.status = "pending"
    return "pending"


def supplier_remaining_balance(record, db) -> float:
    return get_remaining_balance(record, db, BusinessSupplierLipaPayment)


def supplier_paid_sum(db, record) -> Decimal:
    return paid_sum(db, record, BusinessSupplierLipaPayment)


BUCKETS = ("current", "overdue_1_30", "overdue_31_60", "overdue_61_90", "overdue_90_plus")


def bucket_of(days_overdue: int) -> str:
    if days_overdue <= 0:
        return "current"
    if days_overdue <= 30:
        return "overdue_1_30"
    if days_overdue <= 60:
        return "overdue_31_60"
    if days_overdue <= 90:
        return "overdue_61_90"
    return "overdue_90_plus"
