# backend/app/services/business_daily_service.py
# SMART BIZNA DAILY SUMMARIES on the server: ONE row per business per day.
#   During the day every phone sends its lines (business_sale / purchase / expense and the Lipa Later tables). consolidate_business() runs for a business whenever it is read
#   (and nightly for all): it counts every line of every PAST day in that day's single summary row, marks the lines counted, and deletes them (open Lipa Later records and their
#   payments stay until settled; a record settled today stays until tomorrow). A line arriving late for an already-closed day is added to that day's row and deleted too; the
#   tombstone table stops a re-sent line being counted twice. Reports, statements, performance and restore read the daily rows plus today's lines.
# The money is worked out by the SAME function as everywhere (business_net_profit_service.compute), person by person, then added.
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.business import BusinessUser
from app.models.business_daily import BusinessDailySummary, BusinessRecordTombstone, AppSetting
from app.models.business_lipa_later import (BusinessLipaLaterRecord, BusinessLipaLaterPayment, BusinessSupplierLipaRecord, BusinessSupplierLipaPayment)
from app.models.business_ops import BusinessSale, BusinessPurchase, BusinessExpense, SALE, PURCHASE, EXPENSE
from app.services import business_net_profit_service as npf

EAT = npf.EAT
METHODS = ("CASH", "MPESA", "CARD", "LIPA_LATER")
METHOD_LABEL = {"CASH": "Cash", "MPESA": "M-Pesa", "CARD": "Card", "LIPA_LATER": "Lipa Later"}
KEEP_DAYS = 366                      # summaries are kept for one year
TOMBSTONE_DAYS = 7                   # a consolidated line's client id is remembered this long (re-sends after a lost reply)
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
DEFAULT_FEES = [{"from": 4, "to": 6, "fee": 500}, {"from": 7, "to": 9, "fee": 800}, {"from": 10, "to": 12, "fee": 1000}]
FEES_KEY = "statement_fee_tiers"
PHONE_KEY = "support_phone"
DEFAULT_SUPPORT_PHONE = "+254101605262"


def _c(v) -> int:
    return npf.cents(v or 0)


def eat_today(now: datetime = None) -> date:
    return (now or datetime.now(timezone.utc)).astimezone(EAT).date()


def _day(t) -> date:
    return npf.to_dt(t).astimezone(EAT).date()


# ------------------------------------------------------------------------------------------------ adding summaries up
def _person_row(p) -> dict:
    return {"user_id": str(p["user_id"]), "full_name": p.get("full_name"), "role": p.get("role"), "income": 0, "sales_count": 0, "purchases": 0, "expenses": 0, "purchases_count": 0, "expenses_count": 0}


def merge_summaries(items, users=()) -> dict:
    """Add summary rows (dicts: a business-day row, a person's row, or an own-view row) into the totals shape of npf.compute, plus by_person with every figure and days_with_sales.
    Income is the sum of the rows' income; money is added in whole cents."""
    by = {m: {"count": 0, "c": 0} for m in METHODS}
    income = purchases = expenses = sales_made = pcount = ecount = 0
    groups, person, sale_days = {}, {}, set()
    for u in users:
        person[str(u["id"])] = _person_row({"user_id": u["id"], "full_name": u.get("full_name"), "role": u.get("role")})
    for s in items:
        income += _c(s.get("income")); purchases += _c(s.get("purchases")); expenses += _c(s.get("expenses")); sales_made += int(s.get("sales_made") or 0)
        pcount += int(s.get("purchases_count") or 0); ecount += int(s.get("expenses_count") or 0)
        if int(s.get("sales_made") or 0) > 0 and s.get("day"):
            sale_days.add(str(s["day"]))
        for m in s.get("by_payment_method", []):
            if m["method"] in by:
                by[m["method"]]["count"] += int(m.get("count") or 0); by[m["method"]]["c"] += _c(m.get("amount"))
        for c in s.get("cost_breakdown", []):
            if c["label"] == "Purchases":
                continue
            key = " ".join(str(c["label"]).split()).lower() or "other"
            g = groups.setdefault(key, {"label": " ".join(str(c["label"]).split()) or "Other", "c": 0}); g["c"] += _c(c["amount"])
        for p in s.get("by_person", []):
            row = person.setdefault(str(p["user_id"]), _person_row(p))
            if not row["full_name"] and p.get("full_name"):
                row["full_name"], row["role"] = p["full_name"], p.get("role")
            row["income"] += _c(p.get("income")); row["sales_count"] += int(p.get("sales_count") or 0)
            row["purchases"] += _c(p.get("purchases")); row["expenses"] += _c(p.get("expenses"))
            row["purchases_count"] += int(p.get("purchases_count") or 0); row["expenses_count"] += int(p.get("expenses_count") or 0)
    methods_total = sum(by[m]["c"] for m in METHODS)
    net = income - (purchases + expenses)
    pcts = npf._largest_remainder([by[m]["c"] for m in METHODS], methods_total)
    lines = ([{"label": "Purchases", "c": purchases}] if purchases else []) + sorted(groups.values(), key=lambda g: (-g["c"], g["label"]))
    cp = npf._largest_remainder([l["c"] for l in lines], purchases + expenses)
    return {"income": npf.money(income), "purchases": npf.money(purchases), "expenses": npf.money(expenses), "net_profit": npf.money(net), "sales_made": sales_made,
            "purchases_count": pcount, "expenses_count": ecount, "days_with_sales": len(sale_days),
            "by_payment_method": [{"method": m, "label": METHOD_LABEL[m], "count": by[m]["count"], "amount": npf.money(by[m]["c"]), "percent": pcts[i]} for i, m in enumerate(METHODS)],
            "total_received": npf.money(income),
            "cost_breakdown": [{"label": l["label"], "amount": npf.money(l["c"]), "percent": cp[i]} for i, l in enumerate(lines)],
            "by_person": [dict(v, income=npf.money(v["income"]), purchases=npf.money(v["purchases"]), expenses=npf.money(v["expenses"]), costs=npf.money(v["purchases"] + v["expenses"])) for v in person.values()]}


def _row_from_merged(day: date, m: dict) -> dict:
    """A merged result in the shape stored in business_daily_summary and sent to the phones."""
    return {"day": day.isoformat() if isinstance(day, date) else str(day), "income": m["income"], "purchases": m["purchases"], "expenses": m["expenses"], "net_profit": m["net_profit"],
            "sales_made": m["sales_made"], "purchases_count": m["purchases_count"], "expenses_count": m["expenses_count"],
            "by_payment_method": [{"method": x["method"], "count": x["count"], "amount": x["amount"]} for x in m["by_payment_method"]],
            "cost_breakdown": [{"label": x["label"], "amount": x["amount"]} for x in m["cost_breakdown"]],
            "by_person": [{k: p[k] for k in ("user_id", "full_name", "role", "income", "sales_count", "purchases", "expenses", "purchases_count", "expenses_count")}
                          for p in m["by_person"] if p["income"] or p["purchases"] or p["expenses"] or p["sales_count"]]}


def own_view(row: dict, user_id) -> dict:
    """A Sales/Service Person's own figures of a business-day row (what their phone may see: never the rest of the team)."""
    p = next((x for x in row.get("by_person", []) if str(x["user_id"]) == str(user_id)), None)
    if p is None:
        return None
    inc, pu, ex = _c(p.get("income")), _c(p.get("purchases")), _c(p.get("expenses"))
    return {"day": row["day"], "own": True, "income": npf.money(inc), "purchases": npf.money(pu), "expenses": npf.money(ex), "net_profit": npf.money(inc - pu - ex),
            "sales_made": int(p.get("sales_count") or 0), "purchases_count": int(p.get("purchases_count") or 0), "expenses_count": int(p.get("expenses_count") or 0),
            "by_payment_method": [], "cost_breakdown": [], "by_person": [p], "updated_at": row.get("updated_at")}


def summary_dicts(rows):
    out = []
    for r in rows:
        d = r.detail or {}
        out.append({"day": r.day.isoformat(), "income": float(r.income), "purchases": float(r.purchases), "expenses": float(r.expenses), "net_profit": float(r.net_profit),
                    "sales_made": r.sales_made, "purchases_count": r.purchases_count, "expenses_count": r.expenses_count, "by_payment_method": d.get("by_payment_method", []),
                    "cost_breakdown": d.get("cost_breakdown", []), "by_person": d.get("by_person", []), "updated_at": r.updated_at.isoformat() if r.updated_at else None})
    return out


# ------------------------------------------------------------------------------------------------ the lines of a business, and one person's summary of a day from them
class _Lines:
    """Every line of a business as the money function wants it, with the database rows kept so they can be marked and deleted."""

    def __init__(self, db: Session, business_id):
        self.db, self.bid = db, business_id
        self.users = db.query(BusinessUser).filter_by(business_id=business_id).all()
        self.recs = []                                                          # (orm, dict)
        for kind, M in ((SALE, BusinessSale), (PURCHASE, BusinessPurchase), (EXPENSE, BusinessExpense)):
            for r in db.query(M).filter(M.business_id == business_id).all():
                self.recs.append((r, {"id": r.id, "kind": kind, "user_id": r.user_id, "total": r.total, "payment_method": getattr(r, "payment_method", None), "status": r.status,
                                      "trading_at": r.trading_at, "details": getattr(r, "details", None)}))
        sale_of = {l.id: l.sale_id for l in db.query(BusinessLipaLaterRecord).filter(BusinessLipaLaterRecord.business_id == business_id).all()}
        purchase_of = {l.id: l.purchase_id for l in db.query(BusinessSupplierLipaRecord).filter(BusinessSupplierLipaRecord.business_id == business_id).all()}
        self.pays = [(p, {"record_id": sale_of.get(p.lipa_later_id), "amount": p.amount_ksh, "received_by": p.business_user_id, "trading_at": p.paid_at or p.created_at})
                     for p in db.query(BusinessLipaLaterPayment).filter(BusinessLipaLaterPayment.business_id == business_id).all()]
        self.spays = [(p, {"record_id": purchase_of.get(p.lipa_later_id), "amount": p.amount_ksh, "received_by": p.business_user_id, "trading_at": p.paid_at or p.created_at})
                      for p in db.query(BusinessSupplierLipaPayment).filter(BusinessSupplierLipaPayment.business_id == business_id).all()]
        self.lipa_open = {l.sale_id for l in db.query(BusinessLipaLaterRecord).filter(BusinessLipaLaterRecord.business_id == business_id, BusinessLipaLaterRecord.status == "pending").all()}
        self.supplier_open = {l.purchase_id for l in db.query(BusinessSupplierLipaRecord).filter(BusinessSupplierLipaRecord.business_id == business_id, BusinessSupplierLipaRecord.status == "pending").all()}

    def person_items(self, day: date, only_uncounted=True):
        """One summary row per person who has uncounted lines on `day`. Other people's and already-counted lines are only 'ghosts' (outside the day) so a payment finds its sale."""
        a, z = npf.range_bounds(day, day)
        items = []
        for u in self.users:
            def mine(orm):
                return (getattr(orm, "user_id", None) == u.id or getattr(orm, "business_user_id", None) == u.id) and (orm.summarized_at is None or not only_uncounted)
            recs = [dict(d, trading_at=d["trading_at"] if (orm.user_id == u.id and (orm.summarized_at is None or not only_uncounted)) else EPOCH) for orm, d in self.recs]
            pays = [d for orm, d in self.pays if orm.business_user_id == u.id and (orm.summarized_at is None or not only_uncounted)]
            spays = [d for orm, d in self.spays if orm.business_user_id == u.id and (orm.summarized_at is None or not only_uncounted)]
            real = [d for d in recs if d["user_id"] == u.id and a <= npf.to_dt(d["trading_at"]) < z and d["status"] != "voided"]
            if not real and not any(a <= npf.to_dt(p["trading_at"]) < z for p in pays + spays):
                continue
            t = npf.compute(recs, pays, a, z, [{"id": u.id, "full_name": u.full_name, "role": u.role}], spays)
            n = lambda k: sum(1 for d in real if d["kind"] == k)  # noqa: E731
            person = {"user_id": str(u.id), "full_name": u.full_name, "role": u.role, "income": t["income"], "sales_count": t["sales_made"], "purchases": t["purchases"], "expenses": t["expenses"],
                      "purchases_count": n(PURCHASE), "expenses_count": n(EXPENSE)}
            items.append({"day": day.isoformat(), "income": t["income"], "purchases": t["purchases"], "expenses": t["expenses"], "sales_made": t["sales_made"],
                          "purchases_count": n(PURCHASE), "expenses_count": n(EXPENSE), "by_payment_method": [{"method": m["method"], "count": m["count"], "amount": m["amount"]} for m in t["by_payment_method"]],
                          "cost_breakdown": [{"label": c["label"], "amount": c["amount"]} for c in t["cost_breakdown"]], "by_person": [person]})
        return items


def _store(db: Session, business_id, day: date, merged: dict):
    row = db.query(BusinessDailySummary).filter_by(business_id=business_id, day=day).first()
    r = _row_from_merged(day, merged)
    vals = dict(income=Decimal(_c(r["income"])) / 100, purchases=Decimal(_c(r["purchases"])) / 100, expenses=Decimal(_c(r["expenses"])) / 100,
                net_profit=Decimal(_c(r["income"]) - _c(r["purchases"]) - _c(r["expenses"])) / 100, sales_made=r["sales_made"], purchases_count=r["purchases_count"],
                expenses_count=r["expenses_count"], detail={"by_payment_method": r["by_payment_method"], "cost_breakdown": r["cost_breakdown"], "by_person": r["by_person"]})
    if row is None:
        db.add(BusinessDailySummary(business_id=business_id, day=day, **vals))
    else:
        for k, v in vals.items():
            setattr(row, k, v)


# ------------------------------------------------------------------------------------------------ the end-of-day consolidation
def consolidate_business(db: Session, business_id, now: datetime = None) -> dict:
    """Count every uncounted line of every PAST day into that day's single summary row, then delete the counted lines (except open Lipa Later records and what belongs to them).
    Returns {'days': [...], 'deleted': n}. Safe to call at any time and as often as wanted."""
    now = now or datetime.now(timezone.utc)
    today = eat_today(now)
    first = today - timedelta(days=KEEP_DAYS)
    L = _Lines(db, business_id)
    todo_recs = [(o, d) for o, d in L.recs if o.summarized_at is None and first <= _day(d["trading_at"]) < today]
    todo_pays = [(o, d) for o, d in L.pays + L.spays if o.summarized_at is None and first <= _day(d["trading_at"]) < today]
    days = sorted({_day(d["trading_at"]) for _, d in todo_recs} | {_day(d["trading_at"]) for _, d in todo_pays})
    for day in days:
        items = L.person_items(day)
        if not items:
            continue
        existing = db.query(BusinessDailySummary).filter_by(business_id=business_id, day=day).first()
        merged = merge_summaries(summary_dicts([existing]) + items if existing else items)
        _store(db, business_id, day, merged)
    for o, _ in todo_recs + todo_pays:
        o.summarized_at = now
    db.flush()
    deleted = _purge_counted(db, L, today, now)
    db.commit()
    return {"days": [d.isoformat() for d in days], "deleted": deleted}


def _purge_counted(db: Session, L: _Lines, today: date, now: datetime) -> int:
    """Delete counted lines of past days. Kept: an open (unsettled) Lipa Later sale / purchase, and one settled TODAY (today's payment belongs to today). Payments go with their record."""
    pay_today_sale = {p.lipa_later_id for p, d in L.pays if _day(d["trading_at"]) >= today}
    pay_today_purchase = {p.lipa_later_id for p, d in L.spays if _day(d["trading_at"]) >= today}
    lipa_of_sale = {l.sale_id: l.id for l in db.query(BusinessLipaLaterRecord).filter(BusinessLipaLaterRecord.business_id == L.bid).all()}
    lipa_of_purchase = {l.purchase_id: l.id for l in db.query(BusinessSupplierLipaRecord).filter(BusinessSupplierLipaRecord.business_id == L.bid).all()}
    n = 0
    for orm, d in L.recs:
        if orm.summarized_at is None or _day(d["trading_at"]) >= today:
            continue
        if d["kind"] == SALE and d["payment_method"] == "LIPA_LATER" and orm.status != "voided":
            if orm.id in L.lipa_open or lipa_of_sale.get(orm.id) in pay_today_sale:
                continue
        if d["kind"] == PURCHASE and d["payment_method"] == "LIPA_LATER" and orm.status != "voided":
            if orm.id in L.supplier_open or lipa_of_purchase.get(orm.id) in pay_today_purchase:
                continue
        db.merge(BusinessRecordTombstone(business_id=L.bid, client_id=orm.client_id, purged_at=now))
        lid = lipa_of_sale.get(orm.id) if d["kind"] == SALE else lipa_of_purchase.get(orm.id)
        for pay, _ in (L.pays if d["kind"] == SALE else L.spays):
            if pay.lipa_later_id == lid:
                db.merge(BusinessRecordTombstone(business_id=L.bid, client_id=pay.client_id, purged_at=now))
        db.delete(orm)                                                        # the Lipa Later record and its payments go with it (ON DELETE CASCADE)
        n += 1
    db.flush()
    return n


def ensure_consolidated(db: Session, business_id, now: datetime = None):
    consolidate_business(db, business_id, now)


def was_consolidated(db: Session, business_id, client_id) -> bool:
    """True when a line with this client id was already counted and deleted (a re-send after a lost reply)."""
    return db.query(BusinessRecordTombstone).filter_by(business_id=business_id, client_id=client_id).first() is not None


# ------------------------------------------------------------------------------------------------ reading
def live_items(db: Session, business_id, day: date, user_id=None, lines: _Lines = None):
    """Today's own lines as person rows (not stored; read straight from the detailed tables)."""
    L = lines or _Lines(db, business_id)
    items = L.person_items(day)
    return [i for i in items if user_id is None or i["by_person"][0]["user_id"] == str(user_id)]


def rows_in(db: Session, business_id, from_day: date, to_day: date):
    return (db.query(BusinessDailySummary).filter(BusinessDailySummary.business_id == business_id, BusinessDailySummary.day >= from_day, BusinessDailySummary.day <= to_day)
            .order_by(BusinessDailySummary.day).all())


def items_for(db: Session, business_id, from_day: date, to_day: date, user_id=None, now: datetime = None):
    """The daily rows of a period: the consolidated days, plus today's lines. user_id limits it to that person's own figures."""
    ensure_consolidated(db, business_id, now)
    today = eat_today(now)
    items = summary_dicts(rows_in(db, business_id, from_day, min(to_day, today - timedelta(days=1))))
    if user_id is not None:
        items = [v for v in (own_view(i, user_id) for i in items) if v]
    if from_day <= today <= to_day:
        items += live_items(db, business_id, today, user_id)
    return items


def totals_for(db: Session, business_id, start: datetime, end: datetime, user_id=None, now: datetime = None) -> dict:
    """Totals for [start, end) (EAT datetimes, as npf.period_bounds gives): consolidated days plus today's lines."""
    from_day = start.astimezone(EAT).date()
    to_day = (end.astimezone(EAT) - timedelta(microseconds=1)).date()
    users = [{"id": u.id, "full_name": u.full_name, "role": u.role} for u in db.query(BusinessUser).filter_by(business_id=business_id).all()]
    return merge_summaries(items_for(db, business_id, from_day, to_day, user_id, now), users)


class SummaryView:
    """All of a business's daily rows (and today's lines) loaded once, for the performance series."""

    def __init__(self, db: Session, business_id, now: datetime = None):
        ensure_consolidated(db, business_id, now)
        today = eat_today(now)
        self.users = [{"id": u.id, "full_name": u.full_name, "role": u.role} for u in db.query(BusinessUser).filter_by(business_id=business_id).all()]
        self.items = summary_dicts(db.query(BusinessDailySummary).filter_by(business_id=business_id).order_by(BusinessDailySummary.day).all()) + live_items(db, business_id, today)
        self.activity_records = [{"kind": "SALE", "status": "active", "trading_at": datetime.fromisoformat(i["day"] + "T12:00:00+03:00")} for i in self.items if i["sales_made"]]

    def totals(self, start: datetime, end: datetime) -> dict:
        a, z = start.astimezone(EAT).date(), (end.astimezone(EAT) - timedelta(microseconds=1)).date()
        return merge_summaries([i for i in self.items if a <= date.fromisoformat(i["day"]) <= z], self.users)


# ------------------------------------------------------------------------------------------------ statement tables (the same as the phone's buildStatementTables)
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def build_tables(kind: str, from_day: date, to_day: date, items, last_day: date = None) -> dict:
    by_day = {}
    for s in items:
        by_day.setdefault(s["day"], []).append(s)
    limit = min(to_day, last_day) if last_day else to_day

    def row(d: date):
        t = merge_summaries(by_day.get(d.isoformat(), []))
        return {"day": d.isoformat(), "date": d.isoformat(), "dom": d.day, "sales": t["income"], "purchases": t["purchases"], "expenses": t["expenses"], "net": t["net_profit"], "sales_made": t["sales_made"]}

    def add(rows):
        s, p, e = (sum(_c(r[k]) for r in rows) for k in ("sales", "purchases", "expenses"))
        return {"sales": npf.money(s), "purchases": npf.money(p), "expenses": npf.money(e), "net": npf.money(s - p - e)}

    months, y, m = [], from_day.year, from_day.month
    while (y, m) <= (to_day.year, to_day.month):
        first = from_day if (y, m) == (from_day.year, from_day.month) else date(y, m, 1)
        nxt = date(y + (m == 12), m % 12 + 1, 1)
        last_of_month = nxt - timedelta(days=1)
        last = min(last_of_month, limit)
        days, d = [], first
        while d <= last:
            days.append(row(d)); d += timedelta(days=1)
        months.append({"key": f"{y}-{m:02d}", "label": f"{MONTHS[m - 1]} {y}", "days": days, "totals": add(days), "partial": first != date(y, m, 1) or last != last_of_month,
                       "from": first.isoformat(), "to": last.isoformat()})
        y, m = nxt.year, nxt.month
    return {"type": kind, "months": months, "grand": add([{"sales": mo["totals"]["sales"], "purchases": mo["totals"]["purchases"], "expenses": mo["totals"]["expenses"]} for mo in months]), "multiMonth": len(months) > 1}


# ------------------------------------------------------------------------------------------------ statement fees (configurable) and settings
def months_back(day: date, today: date) -> int:
    return (today.year - day.year) * 12 + today.month - day.month


def get_fee_tiers(db: Session):
    row = db.query(AppSetting).filter_by(key=FEES_KEY).first()
    return row.value if row and isinstance(row.value, list) else DEFAULT_FEES


def validate_tiers(tiers):
    """Bands of months back, each from <= to, inside 4..12, not overlapping, fee >= 0."""
    if not isinstance(tiers, list) or not tiers:
        raise HTTPException(422, "Send at least one fee band.")
    out = []
    for t in tiers:
        try:
            f, to, fee = int(t["from"]), int(t["to"]), Decimal(str(t["fee"]))
        except (KeyError, ValueError, TypeError, ArithmeticError):
            raise HTTPException(422, "Each band needs from, to and fee.")
        if not (4 <= f <= to <= 12):
            raise HTTPException(422, "Fee bands must lie between 4 and 12 months back, with from not after to.")
        if fee < 0 or fee > 100000:
            raise HTTPException(422, "A fee must be between 0 and 100,000.")
        out.append({"from": f, "to": to, "fee": float(fee) if fee % 1 else int(fee)})
    out.sort(key=lambda t: t["from"])
    for a, b in zip(out, out[1:]):
        if b["from"] <= a["to"]:
            raise HTTPException(422, "Fee bands must not overlap.")
    return out


def one_year_ago(today: date) -> date:
    try:
        return today.replace(year=today.year - 1)
    except ValueError:                                   # 29 February
        return today.replace(year=today.year - 1, day=28)


def fee_for(db: Session, period_from: date, today: date):
    """{available, fee, months_back, on_phone}. The oldest month decides the band; 0-3 months back is on the phone (free); older than one year is not available."""
    mb = months_back(period_from, today)
    if mb <= 3:
        return {"available": True, "fee": 0, "months_back": mb, "on_phone": True}
    if mb > 12 or period_from < one_year_ago(today):
        return {"available": False, "fee": None, "months_back": mb, "on_phone": False}
    t = next((x for x in get_fee_tiers(db) if x["from"] <= mb <= x["to"]), None)
    return {"available": bool(t), "fee": t["fee"] if t else None, "months_back": mb, "on_phone": False}


def get_support_phone(db: Session) -> str:
    row = db.query(AppSetting).filter_by(key=PHONE_KEY).first()
    return row.value if row and isinstance(row.value, str) and row.value.strip() else DEFAULT_SUPPORT_PHONE


# ------------------------------------------------------------------------------------------------ retention
def purge_old(db: Session, now: datetime = None) -> int:
    """Delete summaries older than one year and tombstones older than 7 days. Returns how many summaries were deleted."""
    now = now or datetime.now(timezone.utc)
    cutoff = eat_today(now) - timedelta(days=KEEP_DAYS)
    n = db.query(BusinessDailySummary).filter(BusinessDailySummary.day < cutoff).delete(synchronize_session=False)
    db.query(BusinessRecordTombstone).filter(BusinessRecordTombstone.purged_at < now - timedelta(days=TOMBSTONE_DAYS)).delete(synchronize_session=False)
    db.commit()
    return n
