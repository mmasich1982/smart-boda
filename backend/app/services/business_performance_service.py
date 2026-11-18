# backend/app/services/business_performance_service.py
# SMART BIZNA (Administrator): BUSINESS PERFORMANCE of one business over time, and the advice prompts the Administrator can use when advising the owner.
# Pure functions (no database, no clock of their own): the route reads the records, this file works out the figures. Every period is worked out by
# business_net_profit_service.compute(), the same single formula the Owner's reports and statements use, so the Administrator's figures always agree
# with the Owner's. Periods are East Africa Time (UTC+3) calendar periods. All arithmetic on money stays in whole cents inside compute().
#
#   views      daily (last 30 days) | monthly (last 12) | quarterly (last 8) | half_yearly (last 6) | yearly (last 5)
#   newest period = the one in progress ("so far", complete = False): it is shown but never used as the headline or compared as if it were whole
from datetime import date, datetime, timedelta, timezone
from app.services import business_net_profit_service as npf

VIEWS = ("daily", "monthly", "quarterly", "half_yearly", "yearly")
DEFAULT_PERIODS = {"daily": 30, "monthly": 12, "quarterly": 8, "half_yearly": 6, "yearly": 5}
MAX_PERIODS = {"daily": 90, "monthly": 36, "quarterly": 16, "half_yearly": 12, "yearly": 10}
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
FLAT_BAND = 2.0                      # a change smaller than this many percent is "flat"
MIN_RECORDS_FOR_ADVICE = 3           # fewer live records than this in the window: figures only, no percentages-based advice

# Advice thresholds (proposals; kept here so they change in one place)
EXPENSE_SHARE_AMBER = 50.0           # expenses above this % of income
PURCHASE_SHARE_AMBER = 70.0          # purchases above this % of income
FALL_AMBER = 15.0                    # income or net profit down by this % or more on the previous complete period
RECEIVABLE_SHARE_AMBER = 30.0        # Lipa Later owed to the business above this % of the period's income
OVERDUE_DAYS = 60
QUIET_DAYS = 7
ONE_PERSON_SHARE = 80.0


def _month_start(y: int, m: int) -> date:
    return date(y, m, 1)


def _add_months(d: date, n: int) -> date:
    i = d.year * 12 + (d.month - 1) + n
    return date(i // 12, i % 12 + 1, 1)


def _label(view: str, start: date, end_incl: date) -> str:
    if view == "daily":
        return f"{start.day} {MONTHS[start.month - 1]}"
    if view == "monthly":
        return f"{MONTHS[start.month - 1]} {start.year}"
    if view == "quarterly":
        return f"Q{(start.month - 1) // 3 + 1} {start.year}"
    if view == "half_yearly":
        return f"H{1 if start.month <= 6 else 2} {start.year}"
    return str(start.year)


def build_periods(view: str, now: datetime, count: int = None) -> list:
    """The periods to show, oldest first, the newest being the one in progress. Each: {label, from, to (inclusive dates), start, end (EAT datetimes, end exclusive), complete}."""
    if view not in VIEWS:
        raise ValueError("view must be one of: " + ", ".join(VIEWS))
    n = DEFAULT_PERIODS[view] if count is None else max(1, min(int(count), MAX_PERIODS[view]))
    today = now.astimezone(npf.EAT).date()
    out = []
    if view == "daily":
        spans = [(today - timedelta(days=i), today - timedelta(days=i)) for i in range(n - 1, -1, -1)]
    else:
        step = {"monthly": 1, "quarterly": 3, "half_yearly": 6, "yearly": 12}[view]
        if view == "monthly":
            cur = _month_start(today.year, today.month)
        elif view == "quarterly":
            cur = _month_start(today.year, ((today.month - 1) // 3) * 3 + 1)
        elif view == "half_yearly":
            cur = _month_start(today.year, 1 if today.month <= 6 else 7)
        else:
            cur = _month_start(today.year, 1)
        spans = []
        for i in range(n - 1, -1, -1):
            s = _add_months(cur, -step * i)
            spans.append((s, _add_months(s, step) - timedelta(days=1)))
    for s, e in spans:
        out.append({"label": _label(view, s, e), "from": s.isoformat(), "to": e.isoformat(), "start": npf.eat_day_start(s),
                    "end": npf.eat_day_start(e) + timedelta(days=1), "complete": e < today})
    return out


def change_pct(current: float, previous: float):
    """Percent change from previous to current, one decimal; None when there is nothing to compare with (previous is 0)."""
    if previous is None or abs(previous) < 0.005:
        return None
    return round((current - previous) / abs(previous) * 100.0, 1)


def trend_of(pct):
    if pct is None:
        return "none"
    return "flat" if abs(pct) < FLAT_BAND else ("up" if pct > 0 else "down")


def build_series(view: str, now: datetime, records, payments, users, supplier_payments, count: int = None) -> list:
    """One row per period with the money figures and the change in income, expenses and net profit against the period before it."""
    rows, prev = [], None
    for p in build_periods(view, now, count):
        t = npf.compute(records, payments, p["start"], p["end"], users, supplier_payments)
        row = {"label": p["label"], "from": p["from"], "to": p["to"], "complete": p["complete"], "income": t["income"], "purchases": t["purchases"],
               "expenses": t["expenses"], "net_profit": t["net_profit"], "sales_count": t["sales_made"],
               "income_change_pct": None, "expenses_change_pct": None, "net_profit_change_pct": None, "_totals": t, "_start": p["start"], "_end": p["end"]}
        if prev is not None:
            row["income_change_pct"] = change_pct(row["income"], prev["income"])
            row["expenses_change_pct"] = change_pct(row["expenses"], prev["expenses"])
            row["net_profit_change_pct"] = change_pct(row["net_profit"], prev["net_profit"])
        rows.append(row)
        prev = row
    return rows


def headline_of(series: list) -> dict:
    """The last COMPLETE period against the one before it. With a single period (or none complete) the newest is used and marked as so far."""
    complete = [r for r in series if r["complete"]]
    if complete:
        idx = series.index(complete[-1])
    else:
        idx = len(series) - 1
    cur = series[idx]
    prev = series[idx - 1] if idx > 0 else None
    pct = change_pct(cur["net_profit"], prev["net_profit"]) if prev else None
    ipct = change_pct(cur["income"], prev["income"]) if prev else None
    return {"label": cur["label"], "complete": cur["complete"], "index": idx, "income": cur["income"], "expenses": cur["expenses"], "purchases": cur["purchases"],
            "net_profit": cur["net_profit"], "previous_label": prev["label"] if prev else None, "previous_net_profit": prev["net_profit"] if prev else None,
            "net_profit_change_pct": pct, "income_change_pct": ipct, "trend": trend_of(pct)}


def lipa_exposure(rows: list, today: date) -> dict:
    """rows: {kind: 'customer'|'supplier', balance, due_date}. Amounts still owed, and how much of it is OVERDUE_DAYS+ days past due."""
    out = {"customers_owe": 0.0, "customers_overdue": 0.0, "customers_count": 0, "overdue_count": 0,
           "business_owes": 0.0, "suppliers_overdue": 0.0, "suppliers_count": 0}
    for r in rows:
        bal = float(r.get("balance") or 0)
        if bal <= 0:
            continue
        days = (today - r["due_date"]).days if r.get("due_date") else 0
        if r["kind"] == "customer":
            out["customers_owe"] += bal
            out["customers_count"] += 1
            if days > OVERDUE_DAYS:
                out["customers_overdue"] += bal
                out["overdue_count"] += 1
        else:
            out["business_owes"] += bal
            out["suppliers_count"] += 1
            if days > OVERDUE_DAYS:
                out["suppliers_overdue"] += bal
    return {k: (round(v, 2) if isinstance(v, float) else v) for k, v in out.items()}


def activity_of(records, now: datetime) -> dict:
    """Last sale and how many sales in the last 30 days (live records only)."""
    live = [r for r in records if r.get("kind") == npf.SALE and r.get("status") != "voided"]
    last = max((npf.to_dt(r["trading_at"]) for r in live), default=None)
    cut = now - timedelta(days=30)
    return {"last_sale_at": last.isoformat() if last else None,
            "days_since_last_sale": (now.astimezone(npf.EAT).date() - last.astimezone(npf.EAT).date()).days if last else None,
            "sales_last_30_days": sum(1 for r in live if npf.to_dt(r["trading_at"]) >= cut),
            "records_total": sum(1 for r in records if r.get("status") != "voided")}


def _kes(v) -> str:
    return "KSh {:,.0f}".format(v)


def advice_for(headline: dict, selected: dict, lipa: dict, activity: dict, people_count: int, window_records: int) -> list:
    """Rule-based prompts, worst first. Every prompt names its figure and the threshold it crossed. level: red | amber | info."""
    out = []
    if activity["records_total"] == 0:
        return [{"level": "info", "code": "no_records", "text": "This business has not recorded anything yet. Check that its people have set up the app."}]
    if activity["days_since_last_sale"] is not None and activity["days_since_last_sale"] >= QUIET_DAYS:
        out.append({"level": "red", "code": "quiet", "text": f"No sale recorded for {activity['days_since_last_sale']} days. Ask whether trading has stopped or records are not being kept."})
    elif activity["last_sale_at"] is None:
        out.append({"level": "amber", "code": "no_sales", "text": "No sale has been recorded yet, only purchases or expenses."})
    if lipa["customers_overdue"] > 0:
        out.append({"level": "red", "code": "lipa_overdue", "text": f"{_kes(lipa['customers_overdue'])} from {lipa['overdue_count']} Lipa Later customer(s) is more than {OVERDUE_DAYS} days overdue. Advise on following up or stopping credit."})
    if window_records < MIN_RECORDS_FOR_ADVICE:
        out.append({"level": "info", "code": "thin", "text": "Not enough records in this period to advise on percentages yet."})
        return _sorted(out)
    inc, exp, pur, net = headline["income"], headline["expenses"], headline["purchases"], headline["net_profit"]
    lab = headline["label"] + ("" if headline["complete"] else " (so far)")
    if net < 0:
        out.append({"level": "red", "code": "loss", "text": f"Net loss of {_kes(-net)} in {lab}: costs are higher than income."})
    if inc > 0:
        es, ps = exp / inc * 100.0, pur / inc * 100.0
        if es > EXPENSE_SHARE_AMBER:
            out.append({"level": "amber", "code": "expense_share", "text": f"Expenses are {es:.0f}% of income in {lab} (above {EXPENSE_SHARE_AMBER:.0f}%). Look at the largest cost lines."})
        if ps > PURCHASE_SHARE_AMBER:
            out.append({"level": "amber", "code": "purchase_share", "text": f"Purchases are {ps:.0f}% of income in {lab} (above {PURCHASE_SHARE_AMBER:.0f}%). Check pricing against what stock costs."})
        if lipa["customers_owe"] / inc * 100.0 > RECEIVABLE_SHARE_AMBER:
            out.append({"level": "amber", "code": "receivable", "text": f"Customers owe {_kes(lipa['customers_owe'])}, over {RECEIVABLE_SHARE_AMBER:.0f}% of {lab} income. Cash may be tied up in credit."})
    p = headline["net_profit_change_pct"]
    if p is not None and p <= -FALL_AMBER and headline["previous_net_profit"] is not None and headline["previous_net_profit"] > 0:
        out.append({"level": "amber", "code": "profit_fall", "text": f"Net profit fell {abs(p):.0f}% from {headline['previous_label']} to {lab}."})
    ip = headline["income_change_pct"]
    if ip is not None and ip <= -FALL_AMBER:
        out.append({"level": "amber", "code": "income_fall", "text": f"Income fell {abs(ip):.0f}% from {headline['previous_label']} to {lab}."})
    if people_count > 1:
        people = [x for x in selected.get("by_person", []) if x.get("income", 0) > 0]
        total = sum(x["income"] for x in people)
        if total > 0 and max(x["income"] for x in people) / total * 100.0 > ONE_PERSON_SHARE and len(people) >= 1:
            top = max(people, key=lambda x: x["income"])
            out.append({"level": "info", "code": "one_person", "text": f"{top.get('full_name') or 'One person'} brings over {ONE_PERSON_SHARE:.0f}% of the income. The other people record few or no sales."})
    if not out:
        out.append({"level": "info", "code": "healthy", "text": f"Nothing to flag in {lab}: costs are in proportion to income."})
    return _sorted(out)


def _sorted(items: list) -> list:
    order = {"red": 0, "amber": 1, "info": 2}
    return sorted(items, key=lambda x: order[x["level"]])


def build_performance(view, now, records, payments, users, supplier_payments, lipa_rows, count=None) -> dict:
    """Everything the Business Performance tab shows, as plain JSON-ready data."""
    series = build_series(view, now, records, payments, users, supplier_payments, count)
    head = headline_of(series)
    sel_row = series[head["index"]]
    t = sel_row["_totals"]
    selected = {"label": sel_row["label"], "complete": sel_row["complete"], "from": sel_row["from"], "to": sel_row["to"],
                "by_payment_method": t["by_payment_method"], "cost_breakdown": t["cost_breakdown"],
                "by_person": [x for x in t["by_person"] if x["income"] or x["costs"] or x["sales_count"]]}
    lipa = lipa_exposure(lipa_rows, now.astimezone(npf.EAT).date())
    act = activity_of(records, now)
    window_records = sel_row["sales_count"] + sum(1 for r in records if r.get("kind") != npf.SALE and r.get("status") != "voided"
                                                   and sel_row["_start"] <= npf.to_dt(r["trading_at"]) < sel_row["_end"])
    advice = advice_for(head, selected, lipa, act, len(users), window_records)
    clean = [{k: v for k, v in r.items() if not k.startswith("_")} for r in series]
    return {"view": view, "series": clean, "headline": head, "selected": selected, "lipa_later": lipa, "activity": act, "advice": advice}
