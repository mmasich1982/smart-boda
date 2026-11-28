# backend/app/jobs/consolidate_business_days.py
# Run nightly (and once after deploying 007):   python -m app.jobs.consolidate_business_days
# For every business: counts all lines of past days into that day's single summary row and deletes the counted lines (open Lipa Later records stay); then deletes summaries
# older than a year and tombstones older than 7 days. Reading a business (a phone syncing, a report) does the same for that business, so this job mainly clears quiet ones.
from app.database import SessionLocal
from app.models.business import Business
from app.services.business_daily_service import consolidate_business, purge_old

if __name__ == "__main__":
    db = SessionLocal()
    try:
        days = deleted = 0
        for b in db.query(Business).all():
            r = consolidate_business(db, b.id)
            days += len(r["days"]); deleted += r["deleted"]
        print(f"consolidated {days} business-days, deleted {deleted} lines, purged {purge_old(db)} summaries older than a year")
    finally:
        db.close()
