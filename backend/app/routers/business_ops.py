# backend/app/routers/business_ops.py
# SMART BIZNA user-app API (journeys C to O of the scope document). Everything a Business Owner / Sales/Service Person does.
#   GET  /business/me                        type, role, business, business type, active flag and THIS person's two tile permissions
#   POST /business/sales                     New Sale / Service (idempotent). A Lipa Later sale also creates a business_lipa_later_record
#   POST /business/purchases                 Business Purchases (calculator amount + Cash/M-Pesa/Card/Lipa Later; 403 without the Purchases permission).
#                                            A Lipa Later purchase also creates a business_supplier_lipa_record (what the business owes the supplier)
#   POST /business/expenses                  Business Expenses         (403 without the Expenses permission)
#   PATCH|POST /business/records/{client_id}/correct · POST /business/records/{client_id}/void     (24-hour correction window)
#   GET  /business/mine?since=               this person's own records (restores a new phone)
#   GET  /business/snapshot?since=           OWNER ONLY: the whole business, with version history, for the Owner's phone
#   GET  /business/reports/daily-summary | performance | history · GET /business/transactions      OWNER ONLY (403 otherwise)
#   POST /business/statement-requests · GET /business/statement-requests                                                 OWNER ONLY
# Lipa Later (customers AND suppliers): payments, lists and ageing are in routers/business_lipa_later.py (the business's own tables and routes, the rider's rules).
# Rules live in services/business_net_profit_service.py (one formula everywhere). Every create is idempotent on a client id.
from datetime import datetime, timezone, timedelta, date
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.auth import get_current_rider
from app.database import get_db
from app.models.business import Business, BusinessUser, BusinessTypeMaster, OWNER, REGISTERED, INACTIVE
from app.models.business_ops import (BusinessSale, BusinessPurchase, BusinessExpense, BusinessStatementRequest, MODEL_OF,
                                     SALE, PURCHASE, EXPENSE, ACTIVE, CORRECTED, VOIDED)
from app.models.business_lipa_later import (BusinessLipaLaterRecord, BusinessLipaLaterPayment, BusinessSupplierLipaRecord,
                                            BusinessSupplierLipaPayment)
from app.services import business_lipa_later_service as lipa_svc
from app.routers.mobile_number import validate_mobile_number
from app.services import business_net_profit_service as npf

router = APIRouter(prefix="/business", tags=["business"])
RETENTION_MONTHS = 6


# ----------------------------------------------------------------------------------------------- who is calling
class Ctx:
    def __init__(self, bu, biz):
        self.bu, self.biz = bu, biz

    @property
    def is_owner(self):
        return self.bu.role == OWNER

    def can(self, kind):
        """Owner always; a Sales/Service Person: own choice, or the business choice when theirs is Same as business."""
        if kind == SALE or self.is_owner:
            return True
        own, default = ((self.bu.can_see_purchases, self.biz.sales_can_see_purchases) if kind == PURCHASE
                        else (self.bu.can_see_expenses, self.biz.sales_can_see_expenses))
        return bool(default if own is None else own)

    def was_allowed_at(self, kind, when):
        """An offline person saved a purchase / expense while the tile was on; the server accepts it if the permission only changed after."""
        if self.can(kind):
            return True
        ch = [t for t in (self.bu.perm_changed_at, self.biz.perm_changed_at) if t]
        return bool(ch) and npf.to_dt(when) < max(ch)


def business_header(x_business_id: Optional[str] = Header(None, alias="X-Business-Id")) -> Optional[str]:
    """MULTIPLE BUSINESSES: the business a request is FOR. The phone sends it on every business call (its own business id, never a guess)."""
    return (x_business_id or "").strip() or None


def _memberships(db, rider):
    """Every (BusinessUser, Business) this login holds: one for staff and single-business Owners, several for an Owner of several businesses."""
    rows = (db.query(BusinessUser, Business).join(Business, Business.id == BusinessUser.business_id)
            .filter(BusinessUser.rider_id == rider.id).order_by(BusinessUser.created_at, BusinessUser.id).all())
    return sorted(rows, key=lambda r: (r[1].business_name or "").lower())


def get_ctx(db, rider, business_id=None, allow_off=False) -> Ctx:
    """DATA ISOLATION: the caller is resolved to ONE membership, the business NAMED on the request, and only if the caller really holds it.
    A business that is not theirs (or does not exist) is refused with the same 403, so nothing is revealed about it. With no business named,
    only a caller who holds exactly one business is served (so an older app keeps working); an Owner of several gets no data until they choose."""
    rows = _memberships(db, rider)
    if not rows:
        raise HTTPException(403, {"code": "NOT_A_BUSINESS_USER", "message": "This account does not belong to a business."})
    if business_id:
        want = str(business_id).strip().lower()
        row = next((r for r in rows if str(r[1].id) == want), None)
        if not row:
            raise HTTPException(403, {"code": "NOT_YOUR_BUSINESS", "message": "This business does not belong to your account."})
    elif len(rows) == 1:
        row = rows[0]
    else:
        raise HTTPException(400, {"code": "BUSINESS_REQUIRED", "message": "Choose which of your businesses to open."})
    bu, biz = row
    if not allow_off and (bu.status == INACTIVE or biz.status == INACTIVE or bu.status != REGISTERED):
        raise HTTPException(403, {"code": "ACCOUNT_INACTIVE", "message": "This account has been switched off by the Administrator."})
    return Ctx(bu, biz)


def _owner(db, rider, business_id=None) -> Ctx:
    c = get_ctx(db, rider, business_id)
    if not c.is_owner:
        raise HTTPException(403, {"code": "OWNER_ONLY", "message": "Only the Business Owner can open this."})
    return c


def same_business(c: Ctx, body):
    """DATA ISOLATION: a record the phone created for business A must never be saved into business B. Every body carries the business it was made
    in; when it does not match the business named on the request it is refused and saved nowhere."""
    sent = getattr(body, "business_id", None)
    if sent and str(sent).strip().lower() != str(c.biz.id):
        raise HTTPException(409, {"code": "BUSINESS_MISMATCH", "message": "This record was made for a different business and was not saved."})


def _need(c: Ctx, kind):
    if not c.can(kind):
        raise HTTPException(403, {"code": "TILE_NOT_ALLOWED", "message": "The Administrator has not allowed this for you."})


def _now():
    return datetime.now(timezone.utc)


def _clock(t):
    """The phone's own time, but never from the future (a wrong phone clock cannot hide a record)."""
    now = _now()
    t = npf.to_dt(t) if t else now
    return now if t > now + timedelta(minutes=10) else t


# ----------------------------------------------------------------------------------------------- shapes
class Item(BaseModel):
    label: str = Field(default="", max_length=60)
    amount: float

    @field_validator("amount")
    @classmethod
    def _a(cls, v):
        if v == 0:
            raise ValueError("An amount cannot be zero.")
        return round(v, 2)


def _items_total(items: List[Item], allow_negative: bool):
    if not items:
        raise HTTPException(422, "Add at least one item.")
    if not allow_negative and any(i.amount < 0 for i in items):
        raise HTTPException(422, "Costs must be above zero.")
    total = sum(npf.cents(i.amount) for i in items)
    if total <= 0:
        raise HTTPException(422, "The total must be above zero.")
    return npf.money(total)


class SaleIn(BaseModel):
    business_id: Optional[str] = None                   # the business this record was made in (checked against the request)
    client_id: str = Field(min_length=6, max_length=64)
    items: List[Item]
    payment_method: str
    trading_at: Optional[datetime] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    due_date: Optional[date] = None


class PurchaseIn(BaseModel):
    business_id: Optional[str] = None                   # the business this record was made in (checked against the request)
    client_id: str = Field(min_length=6, max_length=64)
    items: List[Item]
    payment_method: str                                 # CASH | MPESA | CARD | LIPA_LATER
    trading_at: Optional[datetime] = None
    supplier_name: Optional[str] = None                 # Lipa Later only: who the business owes
    supplier_phone: Optional[str] = None
    due_date: Optional[date] = None


class ExpenseIn(BaseModel):
    business_id: Optional[str] = None                   # the business this record was made in (checked against the request)
    client_id: str = Field(min_length=6, max_length=64)
    details: str = Field(min_length=1, max_length=120)
    amount: float
    trading_at: Optional[datetime] = None


class CorrectIn(BaseModel):
    business_id: Optional[str] = None                   # the business this record was made in (checked against the request)
    client_id: str = Field(min_length=6, max_length=64)
    acted_at: Optional[datetime] = None
    items: Optional[List[Item]] = None
    payment_method: Optional[str] = None
    details: Optional[str] = Field(default=None, max_length=120)
    amount: Optional[float] = None                      # expense


class VoidIn(BaseModel):
    business_id: Optional[str] = None                   # the business this record was made in (checked against the request)
    client_id: str = Field(min_length=6, max_length=64)
    reason: str = Field(min_length=2, max_length=120)
    acted_at: Optional[datetime] = None


class StatementReqIn(BaseModel):
    business_id: Optional[str] = None                   # the business this record was made in (checked against the request)
    client_id: str = Field(min_length=6, max_length=64)
    statement_type: str
    period_from: date
    period_to: date
    purpose: Optional[str] = Field(default=None, max_length=120)


def _names(db, business_id):
    return {u.id: u for u in db.query(BusinessUser).filter(BusinessUser.business_id == business_id).all()}


def _who(u):
    return {"user_id": str(u.id), "name": u.full_name, "role": u.role} if u else None


def _iso(t):
    return npf.to_dt(t).isoformat() if t else None


def _snap(r):
    if r.kind == EXPENSE:
        return {"details": r.details, "total": float(r.total)}
    return {"items": r.items, "total": float(r.total), "payment_method": r.payment_method}


def _lipa_of(db, sale_ids):
    """The business Lipa Later rows for these sales, keyed by sale id."""
    if not sale_ids:
        return {}
    return {r.sale_id: r for r in db.query(BusinessLipaLaterRecord).filter(BusinessLipaLaterRecord.sale_id.in_(sale_ids)).all()}


def _paid_sum(db, lipa_id):
    return sum(npf.cents(p.amount_ksh) for p in db.query(BusinessLipaLaterPayment).filter_by(lipa_later_id=lipa_id).all())


def _supplier_lipa_of(db, purchase_ids):
    """The Lipa Later rows (what the business owes a supplier) for these purchases, keyed by purchase id."""
    if not purchase_ids:
        return {}
    return {r.purchase_id: r for r in db.query(BusinessSupplierLipaRecord).filter(BusinessSupplierLipaRecord.purchase_id.in_(purchase_ids)).all()}


def _supplier_paid_sum(db, lipa_id):
    return sum(npf.cents(p.amount_ksh) for p in db.query(BusinessSupplierLipaPayment).filter_by(lipa_later_id=lipa_id).all())


def _rec(r, users, lipa=None, paid=None):
    out = {"id": str(r.id), "client_id": r.client_id, "kind": r.kind, "total": float(r.total), "trading_at": _iso(r.trading_at),
           "received_at": _iso(r.received_at), "status": r.status, "version": r.version, "recorded_by": _who(users.get(r.user_id)),
           "corrected_at": _iso(r.corrected_at), "void_reason": r.void_reason, "voided_at": _iso(r.voided_at), "updated_at": _iso(r.updated_at)}
    if r.kind == EXPENSE:
        out.update({"details": r.details, "items": [{"label": r.details, "amount": float(r.total)}], "payment_method": None})
    else:
        out.update({"items": r.items, "payment_method": r.payment_method, "details": None})
    if lipa is not None and r.kind == SALE:
        out.update({"customer_name": lipa.customer_name, "customer_phone": lipa.customer_mobile,
                    "due_date": lipa.due_date.isoformat() if lipa.due_date else None, "paid": npf.money(paid or 0)})
    elif lipa is not None and r.kind == PURCHASE:                  # a Lipa Later purchase: owed to this supplier, not a cost until paid
        out.update({"supplier_name": lipa.supplier_name, "supplier_phone": lipa.supplier_mobile,
                    "due_date": lipa.due_date.isoformat() if lipa.due_date else None, "paid": npf.money(paid or 0)})
    return out


def _pay_row(p, users, sale_client, key="sale_client_id"):
    return {"client_id": p.client_id, key: sale_client, "amount": float(p.amount_ksh), "pay_type": p.pay_type, "notes": p.reference,
            "received_by": _who(users.get(p.business_user_id)), "trading_at": _iso(p.paid_at or p.created_at)}


# ----------------------------------------------------------------------------------------------- GET /business/me
def _profile(db, c) -> dict:
    """What the phone keeps about THIS person in THIS business (the same answer /business/me always gave)."""
    bt = db.query(BusinessTypeMaster).filter_by(code=c.biz.business_type_code).first() if c.biz.business_type_code else None
    return {"user_type": "business", "business_user_id": str(c.bu.id), "role": c.bu.role, "full_name": c.bu.full_name,
            "business_id": str(c.biz.id), "business_name": c.biz.business_name, "business_type_code": c.biz.business_type_code,
            "business_type_name": bt.display_name if bt else None,
            "active": c.bu.status == REGISTERED and c.biz.status != INACTIVE,
            "can_see_purchases": c.can(PURCHASE), "can_see_expenses": c.can(EXPENSE),
            "correction_window_hours": npf.CORRECTION_WINDOW_HOURS, "server_time": _iso(_now())}


@router.get("/me")
def me(rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    return _profile(db, get_ctx(db, rider, bid, allow_off=True))


@router.get("/my-businesses")
def my_businesses(rider=Depends(get_current_rider), db: Session = Depends(get_db)):
    """MULTIPLE BUSINESSES: every business this login holds, each with its own profile (so the phone can open any of them offline).
    Staff and single-business Owners get one entry. Nothing about any business the caller does not hold is ever returned."""
    rows = _memberships(db, rider)
    if not rows:
        raise HTTPException(403, {"code": "NOT_A_BUSINESS_USER", "message": "This account does not belong to a business."})
    return {"businesses": [_profile(db, Ctx(bu, biz)) for bu, biz in rows], "server_time": _iso(_now())}


def _owed(db, model, balance_of, business_id) -> float:
    """What is still unpaid on a business's own Lipa Later records (customers owe the business, or the business owes suppliers)."""
    total = 0
    for r in db.query(model).filter(model.business_id == business_id, model.status == "pending").all():
        total += max(0, npf.cents(balance_of(r, db)))
    return npf.money(total)


@router.get("/owner/overview")
def owner_overview(period: str = Query("today"), rider=Depends(get_current_rider), db: Session = Depends(get_db)):
    """MULTIPLE BUSINESSES, ALL MY BUSINESSES: OWNER ONLY. One block per business the caller OWNS, with totals only (never a record, customer or
    supplier). Each business's figures are worked out by the same function as its own Net Profit report, so a card always equals that report."""
    try:
        start, end = npf.period_bounds(period)
    except ValueError:
        raise HTTPException(422, "period must be today, week or month")
    rows = [(bu, biz) for bu, biz in _memberships(db, rider) if bu.role == OWNER]
    if not rows:
        raise HTTPException(403, {"code": "OWNER_ONLY", "message": "Only the Business Owner can open this."})
    items, tot = [], {"income": 0, "purchases": 0, "expenses": 0, "net_profit": 0, "owed_to_business": 0, "owed_by_business": 0}
    for bu, biz in rows:
        c = Ctx(bu, biz)
        live = bu.status == REGISTERED and biz.status != INACTIVE
        item = {"business_id": str(biz.id), "business_name": biz.business_name, "business_type_code": biz.business_type_code, "active": live}
        if live:
            t = _totals(db, c, start, end)
            item.update({k: t[k] for k in ("income", "purchases", "expenses", "net_profit", "sales_made")})
            item["owed_to_business"] = _owed(db, BusinessLipaLaterRecord, lipa_svc.get_remaining_balance, biz.id)
            item["owed_by_business"] = _owed(db, BusinessSupplierLipaRecord, lipa_svc.supplier_remaining_balance, biz.id)
            for k in tot:
                tot[k] += npf.cents(item[k])
        items.append(item)
    return {"period": period, "businesses": items, "total": {k: npf.money(v) for k, v in tot.items()}, "server_time": _iso(_now())}


# ----------------------------------------------------------------------------------------------- creates
def _existing(db, c, kind, client_id):
    return db.query(MODEL_OF[kind]).filter_by(business_id=c.biz.id, client_id=client_id).first()


def _find(db, c, client_id):
    """The record with this client id, in whichever of the three tables it lives."""
    for kind in (SALE, PURCHASE, EXPENSE):
        r = _existing(db, c, kind, client_id)
        if r:
            return r
    return None


def _save(db, *rows):
    try:
        for r in rows:
            db.add(r)
        db.commit()
    except IntegrityError:
        db.rollback()
        return False
    return True


@router.post("/sales")
def create_sale(body: SaleIn, rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = get_ctx(db, rider, bid)
    same_business(c, body)
    if (e := _existing(db, c, SALE, body.client_id)):
        return {"status": "duplicate", "id": str(e.id), "client_id": e.client_id}
    pm = (body.payment_method or "").upper()
    if pm not in npf.METHODS:
        raise HTTPException(422, "Choose Cash, M-Pesa, Card or Lipa Later.")
    total = _items_total(body.items, allow_negative=False)           # v46 calculator: the sale amount is one positive total
    name = phone = None
    if pm == "LIPA_LATER":
        name = " ".join((body.customer_name or "").split())
        ok, phone, err = validate_mobile_number(body.customer_phone or "")
        if len(name) < 2:
            raise HTTPException(422, "Enter the customer's name.")
        if not ok:
            raise HTTPException(422, err or "Enter a valid customer phone number.")
        if not body.due_date:
            raise HTTPException(422, "Enter the due date.")
        if body.due_date <= _now().astimezone(npf.EAT).date():
            raise HTTPException(422, "Due date must be after today.")                     # same rule as the rider app
    when = _clock(body.trading_at)
    sale = BusinessSale(business_id=c.biz.id, user_id=c.bu.id, client_id=body.client_id, items=[i.model_dump() for i in body.items], total=total,
                        payment_method=pm, trading_at=when)
    try:
        db.add(sale)
        db.flush()
        if pm == "LIPA_LATER":                                        # the business's own Lipa Later table, one row per credit sale
            db.add(BusinessLipaLaterRecord(business_id=c.biz.id, sale_id=sale.id, business_user_id=c.bu.id, customer_name=name, customer_mobile=phone,
                                           amount=Decimal(str(total)), sale_date=when, due_date=body.due_date, status="pending"))
        db.commit()
    except IntegrityError:
        db.rollback()
        e = _existing(db, c, SALE, body.client_id)
        return {"status": "duplicate", "id": str(e.id), "client_id": body.client_id}
    return {"status": "recorded", "id": str(sale.id), "client_id": sale.client_id}


@router.post("/purchases")
def create_purchase(body: PurchaseIn, rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = get_ctx(db, rider, bid)
    same_business(c, body)
    when = _clock(body.trading_at)
    if not c.was_allowed_at(PURCHASE, when):
        _need(c, PURCHASE)
    if (e := _existing(db, c, PURCHASE, body.client_id)):
        return {"status": "duplicate", "id": str(e.id), "client_id": e.client_id}
    pm = (body.payment_method or "").upper()
    if pm not in npf.METHODS:                                      # the same four as a sale: Cash, M-Pesa, Card, Lipa Later
        raise HTTPException(422, "Choose Cash, M-Pesa, Card or Lipa Later.")
    total = _items_total(body.items, allow_negative=False)
    name = phone = None
    if pm == "LIPA_LATER":
        name = " ".join((body.supplier_name or "").split())
        ok, phone, err = validate_mobile_number(body.supplier_phone or "")
        if len(name) < 2:
            raise HTTPException(422, "Enter the supplier's name.")
        if not ok:
            raise HTTPException(422, err or "Enter a valid supplier phone number.")
        if not body.due_date:
            raise HTTPException(422, "Enter the payment due date.")
        if body.due_date <= _now().astimezone(npf.EAT).date():
            raise HTTPException(422, "Due date must be after today.")
    rec = BusinessPurchase(business_id=c.biz.id, user_id=c.bu.id, client_id=body.client_id, items=[i.model_dump() for i in body.items], total=total,
                           payment_method=pm, trading_at=when)
    try:
        db.add(rec)
        db.flush()
        if pm == "LIPA_LATER":                                     # what the business owes this supplier: owed, not a cost, until paid
            db.add(BusinessSupplierLipaRecord(business_id=c.biz.id, purchase_id=rec.id, business_user_id=c.bu.id, supplier_name=name, supplier_mobile=phone,
                                              amount=Decimal(str(total)), purchase_date=when, due_date=body.due_date, status="pending"))
        db.commit()
    except IntegrityError:
        db.rollback()
        e = _existing(db, c, PURCHASE, body.client_id)
        return {"status": "duplicate", "id": str(e.id), "client_id": body.client_id}
    return {"status": "recorded", "id": str(rec.id), "client_id": rec.client_id}


@router.post("/expenses")
def create_expense(body: ExpenseIn, rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = get_ctx(db, rider, bid)
    same_business(c, body)
    when = _clock(body.trading_at)
    if not c.was_allowed_at(EXPENSE, when):
        _need(c, EXPENSE)
    if (e := _existing(db, c, EXPENSE, body.client_id)):
        return {"status": "duplicate", "id": str(e.id), "client_id": e.client_id}
    details = " ".join(body.details.split())
    if not details:
        raise HTTPException(422, "Enter the expense details.")
    if body.amount is None or body.amount <= 0:
        raise HTTPException(422, "Enter an amount above zero.")
    rec = BusinessExpense(business_id=c.biz.id, user_id=c.bu.id, client_id=body.client_id, details=details, total=round(body.amount, 2), trading_at=when)
    if not _save(db, rec):
        e = _existing(db, c, EXPENSE, body.client_id)
        return {"status": "duplicate", "id": str(e.id), "client_id": body.client_id}
    return {"status": "recorded", "id": str(rec.id), "client_id": rec.client_id}


# ----------------------------------------------------------------------------------------------- correct / void
def _editable(db, c, client_id, acted_at):
    r = _find(db, c, client_id)
    if not r:
        raise HTTPException(404, "Record not found.")
    if r.status == VOIDED:
        raise HTTPException(409, {"code": "ALREADY_VOIDED", "message": "A voided record cannot be changed again."})
    if not c.is_owner and r.user_id != c.bu.id:
        raise HTTPException(403, {"code": "NOT_YOURS", "message": "You can only change records you recorded yourself."})
    if not c.can(r.kind):
        raise HTTPException(403, {"code": "TILE_NOT_ALLOWED", "message": "The Administrator has not allowed this for you."})
    if not npf.within_correction_window(r.trading_at, acted_at):
        raise HTTPException(409, {"code": "WINDOW_CLOSED", "message": "The 24-hour correction window for this record has closed."})
    return r


def _already_applied(db, c, record_client_id, change_client_id):
    """A retried correction or void (same change id as the last one applied to this record) is answered as a duplicate, never applied twice."""
    r = _find(db, c, record_client_id)
    return bool(r and r.last_change_client_id == change_client_id)


@router.api_route("/records/{record_client_id}/correct", methods=["PATCH", "POST"])    # the phone's sync queue only sends POST
def correct_record(record_client_id: str, body: CorrectIn, rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = get_ctx(db, rider, bid)
    same_business(c, body)
    if _already_applied(db, c, record_client_id, body.client_id):
        return {"status": "duplicate", "client_id": body.client_id}
    acted = _clock(body.acted_at)                                  # judged by the time the PHONE recorded the correction
    r = _editable(db, c, record_client_id, acted)
    lipa = _lipa_of(db, [r.id]).get(r.id) if r.kind == SALE else (_supplier_lipa_of(db, [r.id]).get(r.id) if r.kind == PURCHASE else None)
    if r.kind == EXPENSE:
        if body.details is not None:
            d = " ".join(body.details.split())
            if not d:
                raise HTTPException(422, "Enter the expense details.")
            r.details = d
        amt = body.amount if body.amount is not None else float(r.total)
        if amt <= 0:
            raise HTTPException(422, "Enter an amount above zero.")
        r.total = round(amt, 2)
    else:
        if body.items is not None:
            r.total = _items_total(body.items, allow_negative=False)
            r.items = [i.model_dump() for i in body.items]
        if body.payment_method is not None:
            pm = body.payment_method.upper()
            if pm not in npf.METHODS:
                raise HTTPException(422, "That payment method is not allowed here.")
            if (pm == "LIPA_LATER") != (r.payment_method == "LIPA_LATER"):          # a purchase needs the supplier's details to go on Lipa Later
                raise HTTPException(409, "A record cannot be switched to or from Lipa Later. Void it and record it again.")
            r.payment_method = pm
    if lipa is not None:
        paid = _paid_sum(db, lipa.id) if r.kind == SALE else _supplier_paid_sum(db, lipa.id)
        if npf.cents(r.total) < paid:
            raise HTTPException(409, "The amount cannot be lower than what has already been paid.")
        lipa.amount = Decimal(str(r.total))               # the Lipa Later record keeps its original amount in step with the correction
    r.status, r.version, r.corrected_by, r.corrected_at, r.last_change_client_id = CORRECTED, r.version + 1, c.bu.id, acted, body.client_id
    db.commit()
    return {"status": "corrected", "record": _rec(r, _names(db, c.biz.id))}


@router.post("/records/{record_client_id}/void")
def void_record(record_client_id: str, body: VoidIn, rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = get_ctx(db, rider, bid)
    same_business(c, body)
    if _already_applied(db, c, record_client_id, body.client_id):
        return {"status": "duplicate", "client_id": body.client_id}
    acted = _clock(body.acted_at)
    r = _editable(db, c, record_client_id, acted)
    lipa = _lipa_of(db, [r.id]).get(r.id) if r.kind == SALE else (_supplier_lipa_of(db, [r.id]).get(r.id) if r.kind == PURCHASE else None)
    if lipa is not None and (_paid_sum(db, lipa.id) if r.kind == SALE else _supplier_paid_sum(db, lipa.id)) > 0:
        raise HTTPException(409, {"code": "HAS_PAYMENTS", "message": "A Lipa Later record that already has a payment cannot be voided."})
    r.status, r.version, r.void_reason, r.voided_by, r.voided_at, r.last_change_client_id = VOIDED, r.version + 1, body.reason.strip(), c.bu.id, acted, body.client_id
    if lipa is not None:
        lipa.status = "voided"                                    # leaves the Lipa Later Customers / Suppliers Report
    db.commit()
    return {"status": "voided", "record": _rec(r, _names(db, c.biz.id))}


# ----------------------------------------------------------------------------------------------- sync pulls
def _since(since):
    try:
        return npf.to_dt(since) if since else None
    except ValueError:
        raise HTTPException(422, "since must be a date and time.")


def _bundle(db, c, kinds, own_only, since):
    """Records (all three tables), Lipa Later details and payments, changed after `since`."""
    t = _since(since)
    users = _names(db, c.biz.id)
    recs = []
    for k in kinds:
        M = MODEL_OF[k]
        q = db.query(M).filter(M.business_id == c.biz.id)
        if own_only:
            q = q.filter(M.user_id == c.bu.id)
        if t:
            q = q.filter(M.updated_at > t)
        recs += q.order_by(M.updated_at).all()
    lipa = _lipa_of(db, [r.id for r in recs if r.kind == SALE])
    slipa = _supplier_lipa_of(db, [r.id for r in recs if r.kind == PURCHASE])
    out_recs = []
    for r in recs:
        if r.kind == PURCHASE:
            out_recs.append(_rec(r, users, slipa.get(r.id), _supplier_paid_sum(db, slipa[r.id].id) if r.id in slipa else None))
        else:
            out_recs.append(_rec(r, users, lipa.get(r.id), _paid_sum(db, lipa[r.id].id) if r.id in lipa else None))
    # payments: any payment (new or changed) on a sale this person may see, even if the sale itself did not change
    sale_q = db.query(BusinessSale).filter(BusinessSale.business_id == c.biz.id)
    if own_only:
        sale_q = sale_q.filter(BusinessSale.user_id == c.bu.id)
    sales = {s.id: s for s in sale_q.all()}
    lipa_all = _lipa_of(db, list(sales))
    lipa_ids = {l.id: sid for sid, l in lipa_all.items()}
    pq = db.query(BusinessLipaLaterPayment).filter(BusinessLipaLaterPayment.business_id == c.biz.id)
    if t:
        pq = pq.filter(BusinessLipaLaterPayment.created_at > t)
    pays = [_pay_row(p, users, sales[lipa_ids[p.lipa_later_id]].client_id) for p in pq.all() if p.lipa_later_id in lipa_ids]
    # what the business paid its suppliers (only for people who may see purchases)
    spays = []
    if PURCHASE in kinds:
        pur_q = db.query(BusinessPurchase).filter(BusinessPurchase.business_id == c.biz.id)
        if own_only:
            pur_q = pur_q.filter(BusinessPurchase.user_id == c.bu.id)
        purchases = {p.id: p for p in pur_q.all()}
        slipa_all = _supplier_lipa_of(db, list(purchases))
        sl_ids = {l.id: pid for pid, l in slipa_all.items()}
        sq = db.query(BusinessSupplierLipaPayment).filter(BusinessSupplierLipaPayment.business_id == c.biz.id)
        if t:
            sq = sq.filter(BusinessSupplierLipaPayment.created_at > t)
        spays = [_pay_row(p, users, purchases[sl_ids[p.lipa_later_id]].client_id, "purchase_client_id") for p in sq.all() if p.lipa_later_id in sl_ids]
    return {"business_id": str(c.biz.id), "records": out_recs, "payments": pays, "supplier_payments": spays, "server_time": _iso(_now())}   # business_id: the phone refuses a bundle meant for another business


@router.get("/mine")
def my_records(since: Optional[str] = None, rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = get_ctx(db, rider, bid)
    return _bundle(db, c, [k for k in (SALE, PURCHASE, EXPENSE) if c.can(k)], True, since)


@router.get("/snapshot")
def snapshot(since: Optional[str] = None, rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = _owner(db, rider, bid)
    out = _bundle(db, c, [SALE, PURCHASE, EXPENSE], False, since)
    users = _names(db, c.biz.id)
    out["users"] = [{"user_id": str(u.id), "name": u.full_name, "role": u.role, "active": u.status != INACTIVE} for u in users.values()]
    return out


# ----------------------------------------------------------------------------------------------- Owner reports
def record_dicts(db, business_id):
    """(records, customer payments, users, supplier payments) in the shape the shared money service wants."""
    users = db.query(BusinessUser).filter_by(business_id=business_id).all()
    recs = []
    for k, M in MODEL_OF.items():
        for r in db.query(M).filter(M.business_id == business_id).all():
            recs.append({"id": r.id, "kind": k, "user_id": r.user_id, "total": r.total, "payment_method": getattr(r, "payment_method", None),
                         "status": r.status, "trading_at": r.trading_at, "details": getattr(r, "details", None)})
    sale_of = {l.id: l.sale_id for l in db.query(BusinessLipaLaterRecord).filter(BusinessLipaLaterRecord.business_id == business_id).all()}
    pays = [{"record_id": sale_of.get(p.lipa_later_id), "amount": p.amount_ksh, "received_by": p.business_user_id, "trading_at": p.paid_at or p.created_at}
            for p in db.query(BusinessLipaLaterPayment).filter(BusinessLipaLaterPayment.business_id == business_id).all()]
    purchase_of = {l.id: l.purchase_id for l in db.query(BusinessSupplierLipaRecord).filter(BusinessSupplierLipaRecord.business_id == business_id).all()}
    spays = [{"record_id": purchase_of.get(p.lipa_later_id), "amount": p.amount_ksh, "received_by": p.business_user_id, "trading_at": p.paid_at or p.created_at}
             for p in db.query(BusinessSupplierLipaPayment).filter(BusinessSupplierLipaPayment.business_id == business_id).all()]
    return recs, pays, [{"id": u.id, "full_name": u.full_name, "role": u.role} for u in users], spays


def _totals(db, c, start, end):
    recs, pays, users, spays = record_dicts(db, c.biz.id)
    return npf.compute(recs, pays, start, end, users, spays)


def _range(date_from, date_to):
    if date_to < date_from:
        raise HTTPException(422, "The end date is before the start date.")
    return npf.range_bounds(date_from, date_to)


@router.get("/reports/daily-summary")
def daily_summary(rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = _owner(db, rider, bid)
    start, end = npf.period_bounds("today")
    out = _totals(db, c, start, end)
    out["date"] = start.date().isoformat()
    return out


@router.get("/reports/performance")
def performance(period: str = Query("today"), rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = _owner(db, rider, bid)
    try:
        start, end = npf.period_bounds(period)
    except ValueError:
        raise HTTPException(422, "period must be today, week or month")
    out = _totals(db, c, start, end)
    out["period"] = period
    return out


@router.get("/reports/history")
def history(date_from: date, date_to: date, rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = _owner(db, rider, bid)
    start, end = _range(date_from, date_to)
    out = _totals(db, c, start, end)
    out.update({"date_from": date_from.isoformat(), "date_to": date_to.isoformat()})
    return out


def transaction_lines(db, c, start, end, kind=None):
    users = _names(db, c.biz.id)
    out, sale_by_id = [], {}
    for k, M in MODEL_OF.items():
        for r in db.query(M).filter(M.business_id == c.biz.id, M.trading_at >= start, M.trading_at < end).all():
            on_credit = k in (SALE, PURCHASE) and r.payment_method == "LIPA_LATER"          # neutral line: owed to / by the business, not money moved
            sign = 0 if on_credit else (1 if k == SALE else -1)
            if k == SALE:
                sale_by_id[r.id] = r
            out.append({"type": k, "sign": sign, "amount": float(r.total), "when": _iso(r.trading_at), "client_id": r.client_id,
                        "payment_method": getattr(r, "payment_method", None),
                        "details": r.details if k == EXPENSE else ", ".join(i.get("label") or "" for i in (r.items or []) if i.get("label")),
                        "status": r.status, "recorded_by": _who(users.get(r.user_id))})
    lipa = {l.id: l for l in db.query(BusinessLipaLaterRecord).filter(BusinessLipaLaterRecord.business_id == c.biz.id).all()}
    sales_all = {s.id: s for s in db.query(BusinessSale).filter(BusinessSale.business_id == c.biz.id).all()}
    for p in db.query(BusinessLipaLaterPayment).filter(BusinessLipaLaterPayment.business_id == c.biz.id).all():
        when = p.paid_at or p.created_at
        if not (start <= npf.to_dt(when) < end):
            continue
        l = lipa.get(p.lipa_later_id)
        s = sales_all.get(l.sale_id) if l else None
        out.append({"type": "LIPA_PAYMENT", "sign": 1, "amount": float(p.amount_ksh), "when": _iso(when), "client_id": p.client_id,
                    "payment_method": "LIPA_LATER", "details": l.customer_name if l else "", "status": s.status if s else "active",
                    "recorded_by": _who(users.get(p.business_user_id))})
    slipa = {l.id: l for l in db.query(BusinessSupplierLipaRecord).filter(BusinessSupplierLipaRecord.business_id == c.biz.id).all()}
    purchases_all = {p.id: p for p in db.query(BusinessPurchase).filter(BusinessPurchase.business_id == c.biz.id).all()}
    for p in db.query(BusinessSupplierLipaPayment).filter(BusinessSupplierLipaPayment.business_id == c.biz.id).all():
        when = p.paid_at or p.created_at
        if not (start <= npf.to_dt(when) < end):
            continue
        l = slipa.get(p.lipa_later_id)
        pu = purchases_all.get(l.purchase_id) if l else None
        out.append({"type": "SUPPLIER_PAYMENT", "sign": -1, "amount": float(p.amount_ksh), "when": _iso(when), "client_id": p.client_id,
                    "payment_method": "LIPA_LATER", "details": l.supplier_name if l else "", "status": pu.status if pu else "active",
                    "recorded_by": _who(users.get(p.business_user_id))})
    out.sort(key=lambda x: x["when"], reverse=True)
    return [x for x in out if not kind or x["type"] == kind or (kind == SALE and x["type"] == "LIPA_PAYMENT") or (kind == PURCHASE and x["type"] == "SUPPLIER_PAYMENT")]


@router.get("/transactions")
def transactions(date_from: date, date_to: date, kind: Optional[str] = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                 rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = _owner(db, rider, bid)
    start, end = _range(date_from, date_to)
    rows = transaction_lines(db, c, start, end, kind.upper() if kind else None)
    return {"total": len(rows), "items": rows[offset: offset + limit]}


# ----------------------------------------------------------------------------------------------- statements older than six months
def window_cutoff(today: date = None) -> date:
    t = today or _now().astimezone(npf.EAT).date()
    m = t.month - RETENTION_MONTHS
    y = t.year + (m - 1) // 12
    m = (m - 1) % 12 + 1
    from calendar import monthrange
    return date(y, m, min(t.day, monthrange(y, m)[1]))


@router.post("/statement-requests")
def create_statement_request(body: StatementReqIn, rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = _owner(db, rider, bid)
    same_business(c, body)
    if db.query(BusinessStatementRequest).filter_by(business_id=c.biz.id, client_id=body.client_id).first():
        return {"status": "duplicate", "client_id": body.client_id}
    if body.statement_type not in ("summary", "detailed"):
        raise HTTPException(422, "Choose Summary or Detailed.")
    today = _now().astimezone(npf.EAT).date()
    if body.period_to < body.period_from:
        raise HTTPException(422, "The end date is before the start date.")
    if body.period_to > today:
        raise HTTPException(422, "The period cannot be in the future.")
    if body.period_from >= window_cutoff(today):
        raise HTTPException(422, {"code": "WITHIN_WINDOW", "message": "You can generate this statement yourself in the app."})
    r = BusinessStatementRequest(business_id=c.biz.id, requested_by=c.bu.id, client_id=body.client_id, statement_type=body.statement_type,
                                 period_from=body.period_from, period_to=body.period_to, purpose=body.purpose)
    if not _save(db, r):
        return {"status": "duplicate", "client_id": body.client_id}
    return {"status": "requested", "client_id": r.client_id}


def request_out(r, include_statement=True):
    return {"client_id": r.client_id, "statement_type": r.statement_type, "period_from": r.period_from.isoformat(), "period_to": r.period_to.isoformat(),
            "purpose": r.purpose, "status": r.status, "requested_at": _iso(r.requested_at), "ready_at": _iso(r.ready_at),
            "statement": r.statement if include_statement and r.status == "ready" else None}


@router.get("/statement-requests")
def list_statement_requests(rider=Depends(get_current_rider), bid: Optional[str] = Depends(business_header), db: Session = Depends(get_db)):
    c = _owner(db, rider, bid)
    rows = db.query(BusinessStatementRequest).filter_by(business_id=c.biz.id).order_by(BusinessStatementRequest.requested_at.desc()).all()
    return {"items": [request_out(r) for r in rows]}
