# backend/app/jobs/backfill_business_summaries.py
# ONE-TIME BACKFILL. Before daily summaries, the server held every sale, purchase and expense line. This turns the history already there (last year) into daily summaries,
# one per business, person and EAT day, using the SAME money function as every report, so the figures are identical. Days before today are final; today stays running.
# Safe to run again (a summary of a day is replaced by the recomputed one; a final one is never replaced by a running one).
#   python -m app.jobs.backfill_business_summaries
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from app.database import SessionLocal
from app.models.business import Business, BusinessUser
from app.routers.business_ops import record_dicts
from app.services import business_net_profit_service as npf
from app.services import business_daily_service as daily


def backfill_business(db, b: Business, today=None) -> int:
    today = today or daily.eat_today()
    recs, pays, users, spays = record_dicts(db, b.id)
    first = today - timedelta(days=daily.KEEP_DAYS)
    ids = {r["id"] for r in recs}
    bu_by_id = {u.id: u for u in db.query(BusinessUser).filter_by(business_id=b.id).all()}
    days = defaultdict(set)                                                  # day -> {user_id}
    for r in recs:
        days[npf.to_dt(r["trading_at"]).astimezone(npf.EAT).date()].add(r["user_id"])
    for p in list(pays) + list(spays):
        days[npf.to_dt(p["trading_at"]).astimezone(npf.EAT).date()].add(p["received_by"])
    n = 0
    for day, who in sorted(days.items()):
        if day < first or day > today:
            continue
        a, z = npf.range_bounds(day, day)
        for uid in who:
            u = bu_by_id.get(uid)
            if u is None:
                continue
            mine_recs = [r for r in recs if r["user_id"] == uid]
            ghost = [dict(r, trading_at=datetime(1970, 1, 1, tzinfo=timezone.utc)) for r in recs if r["user_id"] != uid]            # other people's records only so a payment finds its sale; never counted here
            mine_pays = [p for p in pays if p["received_by"] == uid]
            mine_spays = [p for p in spays if p["received_by"] == uid]
            t = npf.compute(mine_recs + ghost, mine_pays, a, z, [{"id": uid, "full_name": u.full_name, "role": u.role}], mine_spays)
            live = lambda r, k: r["kind"] == k and r["status"] != "voided" and a <= npf.to_dt(r["trading_at"]) < z  # noqa: E731
            summary = {"income": t["income"], "purchases": t["purchases"], "expenses": t["expenses"], "sales_made": t["sales_made"],
                       "purchases_count": sum(1 for r in mine_recs if live(r, npf.PURCHASE)), "expenses_count": sum(1 for r in mine_recs if live(r, npf.EXPENSE)),
                       "by_payment_method": [{"method": m["method"], "count": m["count"], "amount": m["amount"]} for m in t["by_payment_method"]],
                       "cost_breakdown": [{"label": c["label"], "amount": c["amount"]} for c in t["cost_breakdown"]],
                       "by_person": [{k: p[k] for k in ("user_id", "full_name", "role", "income", "sales_count", "costs")} for p in t["by_person"] if p["income"] or p["costs"] or p["sales_count"]]}
            daily.upsert_summary(db, b.id, u, day, day < today, summary)
            n += 1
    return n


if __name__ == "__main__":
    db = SessionLocal()
    try:
        total = sum(backfill_business(db, b) for b in db.query(Business).all())
        print(f"backfilled {total} daily summaries")
    finally:
        db.close()
