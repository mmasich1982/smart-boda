# backend/app/jobs/merge_legacy_user_summaries.py
# ONE-TIME, after 007: the per-person summaries of the earlier design (table business_daily_summary_user_level) are added into the business-level table, one row per business per
# day, so nothing recorded during that test period is lost. A legacy person row had no purchase / expense split, so its costs are shown as purchases. Safe to run again: a day
# already holding a row is left alone. When you have checked the figures you may DROP TABLE business_daily_summary_user_level.
#   python -m app.jobs.merge_legacy_user_summaries
from collections import defaultdict

from sqlalchemy import text

from app.database import SessionLocal
from app.models.business_daily import BusinessDailySummary
from app.services import business_daily_service as svc


def merge_legacy(db) -> int:
    rows = db.execute(text("SELECT business_id, business_user_id, day, income, purchases, expenses, sales_made, purchases_count, expenses_count, detail FROM business_daily_summary_user_level ORDER BY day")).fetchall()
    groups = defaultdict(list)
    for r in rows:
        d = r.detail or {}
        by_person = []
        for p in d.get("by_person", []):
            q = dict(p)
            if "purchases" not in q:
                q["purchases"], q["expenses"] = q.get("costs", 0), 0
            by_person.append(q)
        groups[(r.business_id, r.day)].append({"day": r.day.isoformat(), "income": float(r.income), "purchases": float(r.purchases), "expenses": float(r.expenses), "sales_made": r.sales_made,
                                               "purchases_count": r.purchases_count, "expenses_count": r.expenses_count, "by_payment_method": d.get("by_payment_method", []),
                                               "cost_breakdown": d.get("cost_breakdown", []), "by_person": by_person})
    n = 0
    for (bid, day), items in groups.items():
        if db.query(BusinessDailySummary).filter_by(business_id=bid, day=day).first():
            continue
        svc._store(db, bid, day, svc.merge_summaries(items))
        n += 1
    db.commit()
    return n


if __name__ == "__main__":
    db = SessionLocal()
    try:
        print(f"merged {merge_legacy(db)} business-days from the per-person table")
    finally:
        db.close()
