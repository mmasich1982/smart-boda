# backend/app/routers/business_lipa_later.py
# SMART BIZNA Lipa Later API: the business's own routes (the rider's /lipa-later routes are untouched). Same behaviour as the rider app,
# on business tables:
#   POST /business/lipa-later/payments        record a customer payment (Full / Partial), idempotent on client_id
#   GET  /business/lipa-later/customers       customers who owe (include_paid=true for settled): Owner sees all, a seller their own
#   GET  /business/lipa-later/ageing-report   current / 1-30 / 31-60 / 61-90 / 90+ days overdue
# v48: the same three for what the business OWES its suppliers (a Lipa Later purchase). Owed, not a cost, until paid; each payment is the cost.
#   POST /business/lipa-later/supplier-payments       record a payment made to a supplier (Full / Partial), idempotent on client_id
#   GET  /business/lipa-later/suppliers               suppliers still owed (include_paid=true for settled): Owner sees all, a seller their own
#   GET  /business/lipa-later/supplier-ageing-report  the same buckets
# These need the Purchases permission (403 otherwise), like Business Purchases itself.
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.auth import get_current_rider
from app.database import get_db
from app.models.business_ops import BusinessSale, BusinessPurchase, PURCHASE
from app.models.business_lipa_later import (BusinessLipaLaterRecord, BusinessLipaLaterPayment, BusinessSupplierLipaRecord,
                                            BusinessSupplierLipaPayment)
from app.routers.business_ops import get_ctx, _clock, _need, business_header, same_business
from app.services import business_net_profit_service as npf
from app.services import business_lipa_later_service as lipa

router = APIRouter(prefix="/business/lipa-later", tags=["business-lipa-later"])


class PaymentIn(BaseModel):
    business_id: Optional[str] = None                   # the business this payment was made in (checked against the request)
    client_id: str = Field(min_length=6, max_length=64)
    sale_client_id: str = Field(min_length=6, max_length=64)
    pay_type: str
    amount: float
    notes: Optional[str] = Field(default=None, max_length=255)
    paid_at: Optional[datetime] = None


@router.post("/payments")
def record_payment(body: PaymentIn, rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = get_ctx(db, rider, bid)
    same_business(c, body)
    dup = db.query(BusinessLipaLaterPayment).filter_by(business_id=c.biz.id, client_id=body.client_id).first()
    if dup:
        rec = db.query(BusinessLipaLaterRecord).filter_by(id=dup.lipa_later_id).first()
        return {"status": "duplicate", "client_id": body.client_id, "remaining_balance": lipa.get_remaining_balance(rec, db)}
    sale = db.query(BusinessSale).filter_by(business_id=c.biz.id, client_id=body.sale_client_id).first()
    rec = db.query(BusinessLipaLaterRecord).filter_by(sale_id=sale.id).first() if sale else None
    if not rec:
        raise HTTPException(404, {"code": "SALE_NOT_FOUND", "message": "This Lipa Later sale was not found."})
    if rec.status == "voided":
        raise HTTPException(409, "This sale was voided.")
    if not c.is_owner and rec.business_user_id != c.bu.id:
        raise HTTPException(403, {"code": "NOT_YOURS", "message": "You can only take payments on your own Lipa Later sales."})
    if body.pay_type not in ("full", "partial") or body.amount is None or body.amount <= 0:
        raise HTTPException(422, "Enter the amount received.")
    balance = npf.cents(lipa.get_remaining_balance(rec, db))
    if balance <= 0:
        raise HTTPException(409, "This sale is already settled.")
    amt = npf.cents(body.amount)
    if body.pay_type == "full" and amt < balance:
        raise HTTPException(422, "A full payment must cover the balance.")
    if body.pay_type == "partial" and amt >= balance:
        raise HTTPException(422, "A partial payment must be less than the balance.")
    when = _clock(body.paid_at)
    pay = BusinessLipaLaterPayment(business_id=c.biz.id, lipa_later_id=rec.id, business_user_id=c.bu.id, client_id=body.client_id,
                                   amount_ksh=Decimal(str(npf.money(amt))), payment_date=when.astimezone(npf.EAT).date(), paid_at=when,
                                   pay_type=body.pay_type, reference=body.notes or "")
    try:
        db.add(pay)
        db.flush()
        status = lipa.update_lipa_later_status(rec, db)
        db.commit()
    except IntegrityError:
        db.rollback()
        return {"status": "duplicate", "client_id": body.client_id}
    return {"status": "recorded", "client_id": body.client_id, "amount_paid": npf.money(amt),
            "remaining_balance": lipa.get_remaining_balance(rec, db), "record_status": status}


def _scope(db, c, include_paid):
    q = db.query(BusinessLipaLaterRecord).filter(BusinessLipaLaterRecord.business_id == c.biz.id, BusinessLipaLaterRecord.status != "voided")
    if not c.is_owner:
        q = q.filter(BusinessLipaLaterRecord.business_user_id == c.bu.id)
    if not include_paid:
        q = q.filter(BusinessLipaLaterRecord.status == "pending")
    return q.order_by(BusinessLipaLaterRecord.due_date.asc()).all()


@router.get("/customers")
def customers(include_paid: bool = False, rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = get_ctx(db, rider, bid)
    today = lipa.today_eat()
    out = []
    for r in _scope(db, c, include_paid):
        sale = db.query(BusinessSale).filter_by(id=r.sale_id).first()
        remaining = lipa.get_remaining_balance(r, db)
        days = lipa.calculate_days_overdue(r.due_date, today)
        out.append({"sale_client_id": sale.client_id if sale else None, "customer_name": r.customer_name, "customer_mobile": r.customer_mobile,
                    "amount": float(r.amount), "sale_date": r.sale_date.isoformat() if r.sale_date else None, "due_date": str(r.due_date),
                    "status": r.status, "is_overdue": days > 0, "is_due_today": r.due_date == today, "days_overdue": days,
                    "total_paid": float(r.amount) - remaining, "remaining_balance": max(0, remaining),
                    "payment_count": db.query(BusinessLipaLaterPayment).filter_by(lipa_later_id=r.id).count()})
    return out


@router.get("/ageing-report")
def ageing_report(rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = get_ctx(db, rider, bid)
    buckets = {k: [] for k in lipa.BUCKETS}
    for r in _scope(db, c, False):
        buckets[lipa.bucket_of(lipa.calculate_days_overdue(r.due_date))].append(r)
    fmt = lambda rows: {"count": len(rows), "total_amount": sum(float(r.amount) for r in rows),                      # noqa: E731
                        "records": [{"customer_name": r.customer_name, "customer_mobile": r.customer_mobile, "amount": float(r.amount), "due_date": str(r.due_date),
                                     "days_overdue": lipa.calculate_days_overdue(r.due_date), "remaining_balance": max(0, lipa.get_remaining_balance(r, db))}
                                    for r in sorted(rows, key=lambda x: x.due_date)]}
    return {k: fmt(v) for k, v in buckets.items()}


# ----------------------------------------------------------------------------------------------- suppliers (what the business owes)
class SupplierPaymentIn(BaseModel):
    business_id: Optional[str] = None                   # the business this payment was made in (checked against the request)
    client_id: str = Field(min_length=6, max_length=64)
    purchase_client_id: str = Field(min_length=6, max_length=64)
    pay_type: str
    amount: float
    notes: Optional[str] = Field(default=None, max_length=255)
    paid_at: Optional[datetime] = None


@router.post("/supplier-payments")
def record_supplier_payment(body: SupplierPaymentIn, rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = get_ctx(db, rider, bid)
    same_business(c, body)
    _need(c, PURCHASE)
    dup = db.query(BusinessSupplierLipaPayment).filter_by(business_id=c.biz.id, client_id=body.client_id).first()
    if dup:
        rec = db.query(BusinessSupplierLipaRecord).filter_by(id=dup.lipa_later_id).first()
        return {"status": "duplicate", "client_id": body.client_id, "remaining_balance": lipa.supplier_remaining_balance(rec, db)}
    purchase = db.query(BusinessPurchase).filter_by(business_id=c.biz.id, client_id=body.purchase_client_id).first()
    rec = db.query(BusinessSupplierLipaRecord).filter_by(purchase_id=purchase.id).first() if purchase else None
    if not rec:
        raise HTTPException(404, {"code": "PURCHASE_NOT_FOUND", "message": "This Lipa Later purchase was not found."})
    if rec.status == "voided":
        raise HTTPException(409, "This purchase was voided.")
    if not c.is_owner and rec.business_user_id != c.bu.id:
        raise HTTPException(403, {"code": "NOT_YOURS", "message": "You can only record payments on your own Lipa Later purchases."})
    if body.pay_type not in ("full", "partial") or body.amount is None or body.amount <= 0:
        raise HTTPException(422, "Enter the amount paid.")
    balance = npf.cents(lipa.supplier_remaining_balance(rec, db))
    if balance <= 0:
        raise HTTPException(409, "This supplier is already fully paid.")
    amt = npf.cents(body.amount)
    if body.pay_type == "full" and amt < balance:
        raise HTTPException(422, "A full payment must cover the balance.")
    if body.pay_type == "partial" and amt >= balance:
        raise HTTPException(422, "A partial payment must be less than the balance.")
    when = _clock(body.paid_at)
    pay = BusinessSupplierLipaPayment(business_id=c.biz.id, lipa_later_id=rec.id, business_user_id=c.bu.id, client_id=body.client_id,
                                      amount_ksh=Decimal(str(npf.money(amt))), payment_date=when.astimezone(npf.EAT).date(), paid_at=when,
                                      pay_type=body.pay_type, reference=body.notes or "")
    try:
        db.add(pay)
        db.flush()
        status = lipa.update_lipa_later_status(rec, db, BusinessSupplierLipaPayment)
        db.commit()
    except IntegrityError:
        db.rollback()
        return {"status": "duplicate", "client_id": body.client_id}
    return {"status": "recorded", "client_id": body.client_id, "amount_paid": npf.money(amt),
            "remaining_balance": lipa.supplier_remaining_balance(rec, db), "record_status": status}


def _supplier_scope(db, c, include_paid):
    q = db.query(BusinessSupplierLipaRecord).filter(BusinessSupplierLipaRecord.business_id == c.biz.id, BusinessSupplierLipaRecord.status != "voided")
    if not c.is_owner:
        q = q.filter(BusinessSupplierLipaRecord.business_user_id == c.bu.id)
    if not include_paid:
        q = q.filter(BusinessSupplierLipaRecord.status == "pending")
    return q.order_by(BusinessSupplierLipaRecord.due_date.asc()).all()


@router.get("/suppliers")
def suppliers(include_paid: bool = False, rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = get_ctx(db, rider, bid)
    _need(c, PURCHASE)
    today = lipa.today_eat()
    out = []
    for r in _supplier_scope(db, c, include_paid):
        purchase = db.query(BusinessPurchase).filter_by(id=r.purchase_id).first()
        remaining = lipa.supplier_remaining_balance(r, db)
        days = lipa.calculate_days_overdue(r.due_date, today)
        out.append({"purchase_client_id": purchase.client_id if purchase else None, "supplier_name": r.supplier_name, "supplier_mobile": r.supplier_mobile,
                    "amount": float(r.amount), "purchase_date": r.purchase_date.isoformat() if r.purchase_date else None, "due_date": str(r.due_date),
                    "status": r.status, "is_overdue": days > 0, "is_due_today": r.due_date == today, "days_overdue": days,
                    "total_paid": float(r.amount) - remaining, "remaining_balance": max(0, remaining),
                    "payment_count": db.query(BusinessSupplierLipaPayment).filter_by(lipa_later_id=r.id).count()})
    return out


@router.get("/supplier-ageing-report")
def supplier_ageing_report(rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = get_ctx(db, rider, bid)
    _need(c, PURCHASE)
    buckets = {k: [] for k in lipa.BUCKETS}
    for r in _supplier_scope(db, c, False):
        buckets[lipa.bucket_of(lipa.calculate_days_overdue(r.due_date))].append(r)
    fmt = lambda rows: {"count": len(rows), "total_amount": sum(lipa.supplier_remaining_balance(r, db) for r in rows),            # noqa: E731
                        "records": [{"supplier_name": r.supplier_name, "supplier_mobile": r.supplier_mobile, "amount": float(r.amount), "due_date": str(r.due_date),
                                     "days_overdue": lipa.calculate_days_overdue(r.due_date), "remaining_balance": max(0, lipa.supplier_remaining_balance(r, db))}
                                    for r in sorted(rows, key=lambda x: x.due_date)]}
    out = {k: fmt(v) for k, v in buckets.items()}
    out["total_outstanding"] = sum(v["total_amount"] for v in out.values())
    out["pending_suppliers"] = sum(v["count"] for v in out.values() if isinstance(v, dict))
    return out
