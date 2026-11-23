# backend/app/services/business_daily_service.py
# SMART BIZNA DAILY SUMMARIES on the server: save a person's day, add days and people into any period (the SAME shape as businessReportUtils.compute / the phone's
# businessDaily.mergeSummaries, so a report here equals the phone's), build the statement tables, keep the statement fees, and purge what is older than a year.
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.business import BusinessUser
from app.models.business_daily import BusinessDailySummary, AppSetting
from app.services import business_net_profit_service as npf

EAT = npf.EAT
METHODS = ("CASH", "MPESA", "CARD", "LIPA_LATER")
METHOD_LABEL = {"CASH": "Cash", "MPESA": "M-Pesa", "CARD": "Card", "LIPA_LATER": "Lipa Later"}
KEEP_DAYS = 366                      # the server keeps summaries for one year
DEFAULT_FEES = [{"from": 4, "to": 6, "fee": 250}, {"from": 7, "to": 9, "fee": 500}, {"from": 10, "to": 12, "fee": 1000}]
FEES_KEY = "statement_fee_tiers"
MAX_MONEY = 10_000_000_000


def _c(v) -> int:
    return npf.cents(v or 0)


def eat_today(now: datetime = None) -> date:
    return (now or datetime.now(timezone.utc)).astimezone(EAT).date()


# ------------------------------------------------------------------------------------------------ saving a day
def upsert_summary(db: Session, business_id, bu: BusinessUser, day: date, final: bool, s: dict, now: datetime = None) -> str:
    """Save one person's summary of one day. Returns 'saved', 'kept' (a final summary is never replaced by a running one) or 'unchanged'."""
    today = eat_today(now)
    if day > today + timedelta(days=1):
        raise HTTPException(422, "A summary cannot be for a future day.")
    if day < today - timedelta(days=KEEP_DAYS):
        raise HTTPException(422, "That day is older than the one year Smart Bizna keeps.")
    income, purchases, expenses = (_c(s.get(k)) for k in ("income", "purchases", "expenses"))
    if min(income, purchases, expenses) < 0 or max(income, purchases, expenses) > MAX_MONEY * 100:
        raise HTTPException(422, "The summary amounts are not valid.")
    by_pm = [{"method": m["method"], "count": int(m.get("count") or 0), "amount": npf.money(_c(m.get("amount")))} for m in (s.get("by_payment_method") or []) if m.get("method") in METHODS]
    if sum(_c(m["amount"]) for m in by_pm) != income:
        raise HTTPException(422, "The payment methods do not add up to the sales total.")
    detail = {"by_payment_method": by_pm,
              "cost_breakdown": [{"label": str(c.get("label") or "Other")[:60], "amount": npf.money(_c(c.get("amount")))} for c in (s.get("cost_breakdown") or [])][:60],
              "by_person": [{"user_id": str(p.get("user_id")), "full_name": p.get("full_name"), "role": p.get("role"), "income": npf.money(_c(p.get("income"))),
                             "sales_count": int(p.get("sales_count") or 0), "costs": npf.money(_c(p.get("costs")))} for p in (s.get("by_person") or [])][:40]}
    row = db.query(BusinessDailySummary).filter_by(business_id=business_id, business_user_id=bu.id, day=day).first()
    if row and row.final and not final:
        return "kept"
    vals = dict(final=bool(final), income=Decimal(income) / 100, purchases=Decimal(purchases) / 100, expenses=Decimal(expenses) / 100,
                net_profit=Decimal(income - purchases - expenses) / 100, sales_made=int(s.get("sales_made") or 0),
                purchases_count=int(s.get("purchases_count") or 0), expenses_count=int(s.get("expenses_count") or 0), detail=detail)
    if row is None:
        db.add(BusinessDailySummary(business_id=business_id, business_user_id=bu.id, day=day, **vals))
    else:
        if (row.final == vals["final"] and row.income == vals["income"] and row.purchases == vals["purchases"] and row.expenses == vals["expenses"] and row.sales_made == vals["sales_made"]
                and row.detail == detail):
            return "unchanged"
        for k, v in vals.items():
            setattr(row, k, v)
    db.commit()
    return "saved"


# ------------------------------------------------------------------------------------------------ reading
def summary_dicts(rows):
    out = []
    for r in rows:
        d = r.detail or {}
        out.append({"day": r.day.isoformat(), "user_id": str(r.business_user_id), "final": bool(r.final), "income": float(r.income), "purchases": float(r.purchases), "expenses": float(r.expenses),
                    "net_profit": float(r.net_profit), "sales_made": r.sales_made, "purchases_count": r.purchases_count, "expenses_count": r.expenses_count,
                    "by_payment_method": d.get("by_payment_method", []), "cost_breakdown": d.get("cost_breakdown", []), "by_person": d.get("by_person", []),
                    "updated_at": r.updated_at.isoformat() if r.updated_at else None, "provisional": not r.final})
    return out


def rows_in(db: Session, business_id, from_day: date, to_day: date, user_id=None):
    """Summaries with from_day <= day <= to_day (inclusive)."""
    q = db.query(BusinessDailySummary).filter(BusinessDailySummary.business_id == business_id, BusinessDailySummary.day >= from_day, BusinessDailySummary.day <= to_day)
    if user_id is not None:
        q = q.filter(BusinessDailySummary.business_user_id == user_id)
    return q.order_by(BusinessDailySummary.day).all()


def merge_summaries(items, users=()) -> dict:
    """Add summaries (dicts from summary_dicts) into the totals shape of npf.compute. Money in whole cents."""
    by = {m: {"count": 0, "c": 0} for m in METHODS}
    purchases = expenses = sales_made = pcount = ecount = 0
    groups, person = {}, {}
    for u in users:
        person[str(u["id"])] = {"user_id": str(u["id"]), "full_name": u.get("full_name"), "role": u.get("role"), "income": 0, "sales_count": 0, "costs": 0}
    for s in items:
        purchases += _c(s["purchases"]); expenses += _c(s["expenses"]); sales_made += int(s.get("sales_made") or 0)
        pcount += int(s.get("purchases_count") or 0); ecount += int(s.get("expenses_count") or 0)
        for m in s.get("by_payment_method", []):
            if m["method"] in by:
                by[m["method"]]["count"] += int(m.get("count") or 0); by[m["method"]]["c"] += _c(m.get("amount"))
        for c in s.get("cost_breakdown", []):
            if c["label"] == "Purchases":
                continue
            key = " ".join(str(c["label"]).split()).lower() or "other"
            g = groups.setdefault(key, {"label": " ".join(str(c["label"]).split()) or "Other", "c": 0}); g["c"] += _c(c["amount"])
        for p in s.get("by_person", []):
            row = person.setdefault(str(p["user_id"]), {"user_id": str(p["user_id"]), "full_name": p.get("full_name"), "role": p.get("role"), "income": 0, "sales_count": 0, "costs": 0})
            if not row["full_name"] and p.get("full_name"):
                row["full_name"], row["role"] = p["full_name"], p.get("role")
            row["income"] += _c(p.get("income")); row["sales_count"] += int(p.get("sales_count") or 0); row["costs"] += _c(p.get("costs"))
    income = sum(by[m]["c"] for m in METHODS)
    net = income - (purchases + expenses)
    pcts = npf._largest_remainder([by[m]["c"] for m in METHODS], income)
    lines = ([{"label": "Purchases", "c": purchases}] if purchases else []) + sorted(groups.values(), key=lambda g: (-g["c"], g["label"]))
    cp = npf._largest_remainder([l["c"] for l in lines], purchases + expenses)
    return {"income": npf.money(income), "purchases": npf.money(purchases), "expenses": npf.money(expenses), "net_profit": npf.money(net), "sales_made": sales_made,
            "purchases_count": pcount, "expenses_count": ecount,
            "by_payment_method": [{"method": m, "label": METHOD_LABEL[m], "count": by[m]["count"], "amount": npf.money(by[m]["c"]), "percent": pcts[i]} for i, m in enumerate(METHODS)],
            "total_received": npf.money(income),
            "cost_breakdown": [{"label": l["label"], "amount": npf.money(l["c"]), "percent": cp[i]} for i, l in enumerate(lines)],
            "by_person": [dict(v, income=npf.money(v["income"]), costs=npf.money(v["costs"])) for v in person.values()]}


def totals_for(db: Session, business_id, start: datetime, end: datetime, user_id=None) -> dict:
    """Totals for the period [start, end) (EAT datetimes, as npf.period_bounds gives): the summaries of the days inside it."""
    from_day = start.astimezone(EAT).date()
    to_day = (end.astimezone(EAT) - timedelta(microseconds=1)).date()
    users = [{"id": u.id, "full_name": u.full_name, "role": u.role} for u in db.query(BusinessUser).filter_by(business_id=business_id).all()]
    items = summary_dicts(rows_in(db, business_id, from_day, to_day, user_id))
    return merge_summaries(items, users)


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


# ------------------------------------------------------------------------------------------------ statement fees (configurable)
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


def fee_for(db: Session, period_from: date, today: date):
    """{available, fee, months_back}. The oldest month decides the band; over 12 months back is not available; 0-3 months back is on the phone (free)."""
    mb = months_back(period_from, today)
    if mb <= 3:
        return {"available": True, "fee": 0, "months_back": mb, "on_phone": True}
    if mb > 12:
        return {"available": False, "fee": None, "months_back": mb, "on_phone": False}
    t = next((x for x in get_fee_tiers(db) if x["from"] <= mb <= x["to"]), None)
    return {"available": bool(t), "fee": t["fee"] if t else None, "months_back": mb, "on_phone": False}


# ------------------------------------------------------------------------------------------------ one year retention
def purge_old(db: Session, now: datetime = None) -> int:
    """Delete summaries older than one year. Run daily (python -m app.jobs.purge_business_summaries). Returns how many were deleted."""
    cutoff = eat_today(now) - timedelta(days=KEEP_DAYS)
    n = db.query(BusinessDailySummary).filter(BusinessDailySummary.day < cutoff).delete(synchronize_session=False)
    db.commit()
    return n


# ------------------------------------------------------------------------------------------------ a business's summaries loaded once (for the performance tab)
class SummaryView:
    """All of a business's daily summaries, loaded once, so the performance series (many periods) does not query again for each period."""

    def __init__(self, db: Session, business_id):
        self.users = [{"id": u.id, "full_name": u.full_name, "role": u.role} for u in db.query(BusinessUser).filter_by(business_id=business_id).all()]
        self.items = summary_dicts(db.query(BusinessDailySummary).filter_by(business_id=business_id).order_by(BusinessDailySummary.day).all())
        self.activity_records = [{"kind": "SALE", "status": "active", "user_id": i["user_id"], "trading_at": datetime.fromisoformat(i["day"] + "T12:00:00+03:00")} for i in self.items if i["sales_made"] or i["income"]]

    def totals(self, start: datetime, end: datetime) -> dict:
        a, z = start.astimezone(EAT).date(), (end.astimezone(EAT) - timedelta(microseconds=1)).date()
        return merge_summaries([i for i in self.items if a <= date.fromisoformat(i["day"]) <= z], self.users)
