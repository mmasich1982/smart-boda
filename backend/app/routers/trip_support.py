# app/routers/trip_support.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.trip import Trip
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/admin/trip-support", tags=["trip-support"])

@router.get("/out-of-window-requests")
def list_out_of_window_requests(status: str = "pending", db: Session = Depends(get_db)):
    """List trip requests submitted outside allowed time window"""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=2)  # example SLA window
    rows = db.query(Trip).filter(Trip.created_at < cutoff, Trip.status == status).all()
    return [{"id": str(r.id), "rider_id": r.rider_id, "created_at": r.created_at, "status": r.status} for r in rows]
