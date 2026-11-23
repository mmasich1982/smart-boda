# backend/app/jobs/purge_business_summaries.py
# Run once a day (cron / scheduler):  python -m app.jobs.purge_business_summaries
# Deletes Smart Bizna daily summaries older than one year (the retention the server keeps). Prints how many were deleted.
from app.database import SessionLocal
from app.services.business_daily_service import purge_old

if __name__ == "__main__":
    db = SessionLocal()
    try:
        print(f"deleted {purge_old(db)} summaries older than one year")
    finally:
        db.close()
