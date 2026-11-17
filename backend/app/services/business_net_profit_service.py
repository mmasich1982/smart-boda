# backend/app/services/business_net_profit_service.py
# SMART BIZNA: the ONE place the business money rules live (beside the rider net_profit_service). Every report, the audit view, the
# Admin's statement preparation and "Check a statement code" call these pure functions, so the figures can never disagree.
#
#   Net Profit = Sales/Services Income - (Purchases + Expenses)
#   * Income = CASH, M-PESA and CARD sales on the day they were made, plus Lipa Later money ONLY on the day each payment is received.
#     A Lipa Later sale is a receivable, not income (but it is still a sale made).
#   * The same rule for PURCHASES (v48): a Lipa Later purchase is owed, not a cost, until the supplier is paid. It still counts as a purchase made, but
#     only the PAYMENTS MADE count as a purchase cost, on the day each is paid. Cash, M-Pesa and Card purchases count on the day recorded.
#   * Voided records are left out of EVERY figure. Corrected records count with their corrected values.
#   * A day runs midnight to midnight in East Africa Time (UTC+3).
# The phone has the same rules in rider-app/src/offline/businessReportUtils.js; tests feed both the same data and compare.
# All arithmetic is in whole cents so the two sides agree to the last digit.
import hashlib
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal, ROUND_HALF_UP

EAT = timezone(timedelta(hours=3))
SALE, PURCHASE, EXPENSE = "SALE", "PURCHASE", "EXPENSE"
METHODS = ("CASH", "MPESA", "CARD", "LIPA_LATER")
METHOD_LABEL = {"CASH": "Cash", "MPESA": "M-Pesa", "CARD": "Card", "LIPA_LATER": "Lipa Later"}
CORRECTION_WINDOW_HOURS = 24


def cents(v) -> int:
    return int((Decimal(str(v or 0)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def money(c: int) -> float:
    return c / 100.0


def to_dt(v):
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(v).replace("Z", "+00:00"))


def eat_day_start(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=EAT)


def period_bounds(period: str, now: datetime = None):
    """(start, end) of today | week (Monday to now) | month (1st to now) in EAT. End is exclusive (start of tomorrow)."""
    now = (now or datetime.now(timezone.utc)).astimezone(EAT)
    today = eat_day_start(now.date())
    end = today + timedelta(days=1)
    if period == "today":
        return today, end
    if period == "week":
        return today - timedelta(days=today.weekday()), end
    if period == "month":
        return today.replace(day=1), end
    raise ValueError("period must be today, week or month")


def range_bounds(date_from: date, date_to: date):
    return eat_day_start(date_from), eat_day_start(date_to) + timedelta(days=1)


def _largest_remainder(values, total):
    """Whole-number percentages that add up to exactly 100 (or all 0 when total is 0)."""
    if total <= 0:
        return [0] * len(values)
    raw = [v * 100 / total for v in values]
    out = [int(r) for r in raw]
    order = sorted(range(len(values)), key=lambda i: (-(raw[i] - out[i]), i))
    for i in order[: 100 - sum(out)]:
        out[i] += 1
    return out


def _live(r):
    return r.get("status") != "voided"


def compute(records, payments, start, end, users=(), supplier_payments=()):
    """records: dicts with kind, user_id, total, payment_method, status, trading_at, details.  payments: customer payments (record_id, amount,
    received_by, trading_at).  supplier_payments: what the business paid suppliers (record_id = the purchase, amount, received_by = who paid,
    trading_at).  users: dicts with id, full_name, role (every user is listed even with no activity)."""
    live_ids = {str(r["id"]) for r in records if _live(r)}
    in_rng = lambda t: start <= to_dt(t) < end  # noqa: E731
    by_method = {m: {"count": 0, "cents": 0} for m in METHODS}
    purchases = expenses = sales_made = 0
    person = {str(u["id"]): {"user_id": str(u["id"]), "full_name": u.get("full_name"), "role": u.get("role"),
                             "income": 0, "sales_count": 0, "costs": 0} for u in users}

    def P(uid):
        return person.setdefault(str(uid), {"user_id": str(uid), "full_name": None, "role": None, "income": 0, "sales_count": 0, "costs": 0})

    exp_groups = {}
    for r in records:
        if not _live(r) or not in_rng(r["trading_at"]):
            continue
        c = cents(r["total"])
        if r["kind"] == SALE:
            sales_made += 1
            P(r["user_id"])["sales_count"] += 1
            m = r.get("payment_method")
            if m in ("CASH", "MPESA", "CARD"):
                by_method[m]["count"] += 1
                by_method[m]["cents"] += c
                P(r["user_id"])["income"] += c
        elif r["kind"] == PURCHASE:
            if r.get("payment_method") != "LIPA_LATER":              # a Lipa Later purchase is owed, not a cost, until it is paid
                purchases += c
                P(r["user_id"])["costs"] += c
        elif r["kind"] == EXPENSE:
            expenses += c
            P(r["user_id"])["costs"] += c
            key = " ".join((r.get("details") or "").lower().split()) or "other"          # case and spaces ignored
            g = exp_groups.setdefault(key, {"label": " ".join((r.get("details") or "Other").split()) or "Other", "cents": 0})
            g["cents"] += c
    for p in payments:
        if str(p["record_id"]) in live_ids and in_rng(p["trading_at"]):
            c = cents(p["amount"])
            by_method["LIPA_LATER"]["count"] += 1
            by_method["LIPA_LATER"]["cents"] += c
            P(p["received_by"])["income"] += c
    for p in supplier_payments:                                       # money actually paid out to suppliers: counts on the day it is paid
        if str(p["record_id"]) in live_ids and in_rng(p["trading_at"]):
            c = cents(p["amount"])
            purchases += c
            P(p["received_by"])["costs"] += c
    income = sum(v["cents"] for v in by_method.values())
    net = income - (purchases + expenses)
    pcts = _largest_remainder([by_method[m]["cents"] for m in METHODS], income)
    pay_rows = [{"method": m, "label": METHOD_LABEL[m], "count": by_method[m]["count"], "amount": money(by_method[m]["cents"]), "percent": pcts[i]}
                for i, m in enumerate(METHODS)]
    cost_lines = ([{"label": "Purchases", "cents": purchases}] if purchases else []) + sorted(exp_groups.values(), key=lambda g: (-g["cents"], g["label"]))
    cpct = _largest_remainder([g["cents"] for g in cost_lines], purchases + expenses)
    return {
        "income": money(income), "purchases": money(purchases), "expenses": money(expenses), "net_profit": money(net),
        "sales_made": sales_made,
        "by_payment_method": pay_rows, "total_received": money(income),
        "cost_breakdown": [{"label": g["label"], "amount": money(g["cents"]), "percent": cpct[i]} for i, g in enumerate(cost_lines)],
        "by_person": [{**v, "income": money(v["income"]), "costs": money(v["costs"])} for v in person.values()],
    }


def statement_code(business_id, date_from, date_to, totals) -> str:
    """Verification code printed on a statement. Worked out on the phone with the same recipe (businessReportUtils.js):
    SHA-256 over business, period and the four totals in whole cents; first 12 hex digits as XXXX-XXXX-XXXX."""
    s = "|".join(["SBZ1", str(business_id), str(date_from), str(date_to), str(cents(totals["income"])), str(cents(totals["purchases"])),
                  str(cents(totals["expenses"])), str(cents(totals["net_profit"]))])
    h = hashlib.sha256(s.encode("utf-8")).hexdigest()[:12].upper()
    return f"{h[0:4]}-{h[4:8]}-{h[8:12]}"


def lipa_balance(sale_total, payments_for_sale) -> float:
    return money(max(0, cents(sale_total) - sum(cents(p["amount"]) for p in payments_for_sale)))


def within_correction_window(made_at, acted_at, hours=CORRECTION_WINDOW_HOURS) -> bool:
    return (to_dt(acted_at) - to_dt(made_at)) < timedelta(hours=hours)
