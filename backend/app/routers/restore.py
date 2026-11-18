# backend/app/routers/restore.py
# SMART APPS: "set up my account on this phone". After a login on a NEW phone the app asks the server for the records that live on the server.
# Smart Bizna business records and group membership already have their own pull routes (/business/snapshot, /chama/me/...); this adds the Smart Boda records:
#   GET /restore/rider/trips           Cash and M-Pesa trips
#   GET /restore/rider/fuel            fuel entries           (table fuel_entry)
#   GET /restore/rider/maintenance     maintenance entries    (table maintenance_entry)
#   GET /restore/rider/other-expenses  other expenses         (table other_expenses: amount_ksh, notes, created_at, integer id)
#   GET /restore/rider/profile         the rider's bike profile (fuel type, plate) so a new phone shows the right Fuel / Charge Battery tile
#   GET /restore/rider/lipa-later      Lipa Later records and their payments (tables lipa_later_record, lipa_later_payment, trip)
# Every route: the signed-in rider's own rows of the last RESTORE_DAYS days, oldest first, in pages (?after=<cursor>&limit=500).
# Smart Bizna Lipa Later (customers and suppliers) is NOT here: it comes with the business bundle (/business/snapshot, /business/mine), payments included.
# fuel_entry, maintenance_entry and other_expenses are read with plain SQL against the columns of the live tables, so a second, older model
# of the same table in the code base cannot change the answer.
import os
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text, tuple_
from sqlalchemy.orm import Session

from app.auth import get_current_rider
from app.database import get_db
from app.models.rider import Rider
from app.models.trip import Trip

router = APIRouter(prefix="/restore", tags=["restore"])
RESTORE_DAYS = int(os.getenv("RESTORE_DAYS", "183"))          # about six months, the same window the phone keeps
RESTORE_METHODS = ("Cash", "MPesa")


def _cursor_parts(after: Optional[str]):
    if not after:
        return None
    try:
        ts, _, rid = after.partition("|")
        return datetime.fromisoformat(ts), uuid.UUID(rid)
    except ValueError:
        raise HTTPException(422, "Bad cursor.")


def _int_cursor_parts(after: Optional[str]):
    """Cursor for a table with an integer id (other_expenses): '<timestamp>|<id>'."""
    if not after:
        return None
    try:
        ts, _, rid = after.partition("|")
        return datetime.fromisoformat(ts), int(rid)
    except ValueError:
        raise HTTPException(422, "Bad cursor.")


def _as_utc_ms(v) -> Optional[int]:
    """Milliseconds since 1970 for an aware OR naive (taken as UTC) datetime."""
    if not v:
        return None
    return int((v if v.tzinfo else v.replace(tzinfo=timezone.utc)).timestamp() * 1000)


def _cutoff() -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=RESTORE_DAYS)


def _jsonable(v):
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, datetime):
        return v.isoformat()
    return v


# ---------------------------------------------------------------- trips (ORM: the trip table is one clean model)
def _trip_row(t: Trip) -> dict:
    ts = int(t.recorded_at.timestamp() * 1000)
    return {"id": str(t.id), "rider_id": str(t.rider_id), "amount": float(t.amount), "method": t.payment_channel_code, "status": t.status,
            "note": t.note or "", "ts": ts, "created_at": t.recorded_at.isoformat(), "date": t.recorded_at.date().isoformat()}


@router.get("/rider/trips")
def restore_trips(after: Optional[str] = None, limit: int = Query(500, ge=1, le=1000), db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    q = db.query(Trip).filter(Trip.rider_id == rider.id, Trip.recorded_at >= _cutoff(), Trip.payment_channel_code.in_(RESTORE_METHODS))
    cur = _cursor_parts(after)
    if cur:
        q = q.filter(tuple_(Trip.recorded_at, Trip.id) > (cur[0], cur[1]))
    rows = q.order_by(Trip.recorded_at, Trip.id).limit(limit + 1).all()
    more = len(rows) > limit
    rows = rows[:limit]
    nxt = f"{rows[-1].recorded_at.isoformat()}|{rows[-1].id}" if rows and more else None
    return {"items": [_trip_row(t) for t in rows], "next_cursor": nxt, "count": len(rows)}


# ---------------------------------------------------------------- fuel, maintenance, other expenses (plain SQL on the live tables)
def _page(db: Session, rider: Rider, table: str, columns: str, order_col: str, after: Optional[str], limit: int, int_id: bool = False) -> dict:
    """table / columns / order_col are constants written below, never taken from the request. int_id: the table's id is an integer, and its time column has no time zone."""
    sql = f"SELECT id, rider_id, {columns} FROM {table} WHERE rider_id = CAST(:rid AS uuid) AND {order_col} >= :cutoff"
    params = {"rid": str(rider.id), "cutoff": _cutoff().replace(tzinfo=None) if int_id else _cutoff(), "lim": limit + 1}
    cur = _int_cursor_parts(after) if int_id else _cursor_parts(after)
    if cur:
        sql += f" AND ({order_col}, id) > (:ats, :aid)" if int_id else f" AND ({order_col}, id) > (:ats, CAST(:aid AS uuid))"
        params.update(ats=cur[0], aid=cur[1] if int_id else str(cur[1]))
    sql += f" ORDER BY {order_col}, id LIMIT :lim"
    rows = [dict(r) for r in db.execute(text(sql), params).mappings().all()]
    more = len(rows) > limit
    rows = rows[:limit]
    nxt = f"{_jsonable(rows[-1][order_col])}|{rows[-1]['id']}" if rows and more else None
    items = []
    for r in rows:
        d = {k: _jsonable(v) for k, v in r.items()}
        d["ts"] = _as_utc_ms(r.get(order_col))
        items.append(d)
    return {"items": items, "next_cursor": nxt, "count": len(items)}


@router.get("/rider/fuel")
def restore_fuel(after: Optional[str] = None, limit: int = Query(500, ge=1, le=1000), db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    return _page(db, rider, "fuel_entry", "mode, litres, cost, swap_partner_id, odometer_reading, submitted_at", "submitted_at", after, limit)


@router.get("/rider/maintenance")
def restore_maintenance(after: Optional[str] = None, limit: int = Query(500, ge=1, le=1000), db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    return _page(db, rider, "maintenance_entry",
                 "service_type_code, cost, description, maintenance_date, service_provider, odometer_reading, oil_type_code, next_service_odometer, submitted_at",
                 "submitted_at", after, limit)


@router.get("/rider/other-expenses")
def restore_other_expenses(after: Optional[str] = None, limit: int = Query(500, ge=1, le=1000), db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    # the live table has amount_ksh, notes and created_at (no time zone) and an INTEGER id: the older query named columns that do not exist and failed
    return _page(db, rider, "other_expenses", "category, amount_ksh, notes, created_at", "created_at", after, limit, int_id=True)


@router.get("/rider/profile")
def restore_profile(db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    """The rider's newest ACTIVE bike profile. A new phone needs it for the Fuel Motorcycle/Car or Charge Battery tile."""
    row = db.execute(text("SELECT id, fuel_type_code, submitted_at FROM bike_profile WHERE rider_id = CAST(:rid AS uuid) AND COALESCE(is_active, true) "
                          "ORDER BY submitted_at DESC LIMIT 1"), {"rid": str(rider.id)}).mappings().first()
    if not row:
        return {"profile": None}
    return {"profile": {"id": str(row["id"]), "fuel_type_code": row["fuel_type_code"], "submitted_at": _jsonable(row["submitted_at"])}}


# ---------------------------------------------------------------- Lipa Later (a rider's customers and what they have paid)
# One lipa_later_record per Lipa Later trip (its status column may be empty: an empty status means NOT yet paid). Records NOT yet fully paid are always sent, however old (they are money owed to the rider);
# paid ones only for the last RESTORE_DAYS days. Each page carries the payments of its records.
@router.get("/rider/lipa-later")
def restore_lipa_later(after: Optional[str] = None, limit: int = Query(200, ge=1, le=500), db: Session = Depends(get_db), rider: Rider = Depends(get_current_rider)):
    sql = ("SELECT r.id, r.trip_id, r.customer_name, r.customer_mobile, r.amount, r.trip_date, r.due_date, r.status, r.paid_at, t.status AS trip_status "
           "FROM lipa_later_record r LEFT JOIN trip t ON t.id = r.trip_id "
           "WHERE r.rider_id = CAST(:rid AS uuid) AND (COALESCE(r.status, 'pending') <> 'paid' OR r.trip_date >= :cutoff)")
    params = {"rid": str(rider.id), "cutoff": _cutoff(), "lim": limit + 1}
    cur = _cursor_parts(after)
    if cur:
        sql += " AND (r.trip_date, r.id) > (:ats, CAST(:aid AS uuid))"
        params.update(ats=cur[0], aid=str(cur[1]))
    sql += " ORDER BY r.trip_date, r.id LIMIT :lim"
    rows = [dict(r) for r in db.execute(text(sql), params).mappings().all()]
    more = len(rows) > limit
    rows = rows[:limit]
    pays = {}
    if rows:
        ids = [str(r["id"]) for r in rows]
        prow = db.execute(text("SELECT id, lipa_later_id, amount_ksh, payment_date, reference FROM lipa_later_payment "
                               "WHERE rider_id = CAST(:rid AS uuid) AND lipa_later_id = ANY(CAST(:ids AS uuid[])) ORDER BY payment_date, id"),
                          {"rid": str(rider.id), "ids": ids}).mappings().all()
        for p in prow:
            pays.setdefault(str(p["lipa_later_id"]), []).append({"id": str(p["id"]), "amount": float(p["amount_ksh"]), "date": p["payment_date"].isoformat(), "reference": p["reference"] or ""})
    items = []
    for r in rows:
        td = r["trip_date"]
        items.append({"id": str(r["id"]), "trip_id": str(r["trip_id"]), "customer_name": r["customer_name"], "customer_mobile": r["customer_mobile"], "amount": float(r["amount"]),
                      "trip_date": td.isoformat(), "ts": int(td.timestamp() * 1000), "due_date": r["due_date"].isoformat(), "status": r["status"],
                      "paid_at": _jsonable(r["paid_at"]), "trip_status": r["trip_status"], "payments": pays.get(str(r["id"]), [])})
    nxt = f"{rows[-1]['trip_date'].isoformat()}|{rows[-1]['id']}" if rows and more else None
    return {"items": items, "next_cursor": nxt, "count": len(items)}
