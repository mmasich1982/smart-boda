# backend/app/routers/sb05_lipa_later.py
# ✅ ROOT CAUSE FIXED: Using correct LipaLaterPayment model (not generic Payment)
# ✅ FIXED: Router prefix is /lipa-later (not /trips/lipa-later)
# ✅ FIXED: Endpoint paths are /record-trip and /customer-list
# ✅ FIXED: Trip model field names (payment_channel_code, recorded_at, status="active")
# ✅ FIXED: Field aliasing for camelCase from frontend
# ✅ FIXED: Using LipaLaterPayment model with correct schema
# ✅ FIXED: Added new /record-payment endpoint accepting query parameters (rider_id, customer_id)
# ✅ FIXED: Frontend can now sync payments correctly with POST /lipa-later/record-payment?rider_id=X&customer_id=Y

from datetime import datetime, date, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session
from sqlalchemy import and_
from decimal import Decimal
import logging

from app.database import get_db
from app.models.trip import Trip
from app.models.lipa_later_record import LipaLaterRecord
from app.models.lipa_later_payment import LipaLaterPayment

# Setup logging for debugging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lipa-later", tags=["sb-05-lipa-later"])


# ============= Request/Response Schemas =============

class LipaLaterCreateRequest(BaseModel):
    """
    Request to create a Lipa Later trip and record.
    
    Accepts both camelCase (from frontend) and snake_case field names.
    Frontend sends: customerName, customerPhone, amount, dueDate
    Backend automatically converts to: customer_name, customer_mobile, amount, due_date
    
    Example request body:
    {
        "customerName": "Marto",
        "customerPhone": "0712333444",
        "amount": 300,
        "dueDate": "2026-09-30",
        "paymentMethod": "LipaLater"  // Extra field, will be ignored
    }
    """
    customer_name: str = Field(..., alias="customerName")
    customer_mobile: str = Field(..., alias="customerPhone")
    amount: float = Field(..., gt=0)
    due_date: date = Field(..., alias="dueDate")
    
    model_config = ConfigDict(
        populate_by_name=True,
        extra='ignore'  # Ignore extra fields like paymentMethod
    )


class LipaLaterPaymentRequest(BaseModel):
    """Request to record a payment against a Lipa Later record"""
    amount: float = Field(..., gt=0)
    date: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    paymentMethod: str = Field(default="Manual")
    status: str = Field(default="completed")
    paymentType: str = Field(default="full")  # full or partial
    notes: str = Field(default="")
    
    model_config = ConfigDict(populate_by_name=True, extra='ignore')


class LipaLaterPaymentResponse(BaseModel):
    """Response after recording a payment"""
    ok: bool
    payment_id: str
    amount_paid: float
    remaining_balance: float
    record_status: str


class AgeingBucketResponse(BaseModel):
    """Response for ageing bucket with records"""
    count: int
    total_amount: float
    records: list


class AgeingReportResponse(BaseModel):
    """Complete ageing report response"""
    current: AgeingBucketResponse
    overdue_1_30: AgeingBucketResponse
    overdue_31_60: AgeingBucketResponse
    overdue_61_90: AgeingBucketResponse
    overdue_90_plus: AgeingBucketResponse


# ============= Helper Functions =============

def calculate_days_overdue(due_date: date) -> int:
    """Calculate days overdue without external dependencies"""
    today = date.today()
    if due_date >= today:
        return 0
    delta = today - due_date
    return delta.days


def get_remaining_balance(lipa_later_record: LipaLaterRecord, db: Session) -> float:
    """Calculate remaining balance for a Lipa Later record"""
    if not lipa_later_record:
        return 0.0
    
    try:
        # Query LipaLaterPayment (not Payment!)
        total_paid = db.query(LipaLaterPayment).filter(
            LipaLaterPayment.lipa_later_id == lipa_later_record.id
        ).with_entities(LipaLaterPayment.amount_ksh).all()
        
        paid_sum = sum(Decimal(str(p[0])) for p in total_paid if p[0]) if total_paid else Decimal('0')
        original_amount = Decimal(str(lipa_later_record.amount))
        
        return float(max(Decimal('0'), original_amount - paid_sum))
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error calculating balance: {str(e)}", exc_info=True)
        return float(lipa_later_record.amount)


def update_lipa_later_status(record: LipaLaterRecord, db: Session) -> str:
    """Update and return the current status of a Lipa Later record"""
    remaining = get_remaining_balance(record, db)
    
    if remaining <= 0:
        record.status = "paid"
        record.paid_at = datetime.now(timezone.utc)
        return "paid"
    elif remaining < float(record.amount):
        return "partial"
    else:
        return "pending"


# ============= Core Endpoints =============

@router.post("/record-trip", response_model=dict)
def create_lipa_later_trip(
    payload: LipaLaterCreateRequest, 
    rider_id: str, 
    db: Session = Depends(get_db)
):
    """
    Create a Lipa Later trip entry with both Trip and LipaLaterRecord.
    
    Endpoint: POST /lipa-later/record-trip?rider_id={rider_id}
    
    This endpoint:
    1. Validates customer details and amount
    2. Creates a Trip record for income tracking
    3. Creates a LipaLaterRecord for payment follow-up
    
    Frontend sends (camelCase - automatically converted):
    {
        "customerName": "Marto",
        "customerPhone": "0712333444",
        "amount": 300,
        "dueDate": "2026-09-30",
        "paymentMethod": "LipaLater"
    }
    
    Returns: trip_id and lipa_later_record_id
    """
    logger.info(f"[LIPA_LATER] CREATE_TRIP - Rider: {rider_id}, Customer: {payload.customer_name}")
    
    try:
        # Validation
        if not payload.customer_name or not payload.customer_name.strip():
            logger.warning("[LIPA_LATER] Validation failed: empty customer name")
            raise HTTPException(422, "Enter the customer's name.")
        
        if not payload.customer_mobile or not payload.customer_mobile.strip():
            logger.warning("[LIPA_LATER] Validation failed: empty customer phone")
            raise HTTPException(422, "Enter the customer's mobile number.")
        
        if payload.amount <= 0:
            logger.warning(f"[LIPA_LATER] Validation failed: invalid amount {payload.amount}")
            raise HTTPException(422, "Enter an amount greater than zero.")
        
        today = date.today()
        if payload.due_date <= today:
            logger.warning(f"[LIPA_LATER] Validation failed: due_date {payload.due_date} not after {today}")
            raise HTTPException(422, "Due date must be after today.")
        
        now = datetime.now(timezone.utc)
        
        # ✅ CRITICAL FIX: Use correct Trip model field names!
        logger.info("[LIPA_LATER] Creating Trip record...")
        trip = Trip(
            rider_id=rider_id,
            amount=Decimal(str(payload.amount)),
            payment_channel_code="LipaLater",  # ✅ CORRECT: matches payment_channel_master codes
            status="active",  # ✅ CORRECT: Trip model uses "active" or "voided"
            recorded_at=now,  # ✅ CORRECT: Trip model uses recorded_at, not trip_date
            sync_status="synced"
        )
        db.add(trip)
        db.flush()  # Get trip.id without committing yet
        logger.info(f"[LIPA_LATER] ✅ Trip created: {trip.id}")
        
        # Create LipaLaterRecord
        logger.info("[LIPA_LATER] Creating LipaLaterRecord...")
        record = LipaLaterRecord(
            rider_id=rider_id,
            trip_id=trip.id,
            customer_name=payload.customer_name.strip(),
            customer_mobile=payload.customer_mobile.strip(),
            amount=Decimal(str(payload.amount)),
            due_date=payload.due_date,
            status="pending",
            recorded_at=now,
            sync_status="synced"
        )
        db.add(record)
        db.flush()
        logger.info(f"[LIPA_LATER] ✅ LipaLaterRecord created: {record.id}")
        
        db.commit()
        
        return {
            "ok": True,
            "trip_id": str(trip.id),
            "lipa_later_record_id": str(record.id),
            "customer_name": payload.customer_name,
            "amount": float(payload.amount),
            "due_date": str(payload.due_date)
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"[LIPA_LATER] Error creating trip: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error creating trip: {str(e)}")


@router.post("/record-payment", response_model=LipaLaterPaymentResponse)
def record_lipa_later_payment_by_query(
    rider_id: str = Query(..., description="Rider ID"),
    customer_id: str = Query(..., description="Customer ID"),
    payload: LipaLaterPaymentRequest = None,
    db: Session = Depends(get_db)
):
    """
    ✅ FIXED: Record a payment against a Lipa Later customer (query parameter version).
    
    Endpoint: POST /lipa-later/record-payment?rider_id={rider_id}&customer_id={customer_id}
    
    This endpoint is designed for frontend offline sync that sends query parameters.
    Frontend sends the payment in the request body:
    {
        "amount": 500,
        "date": "2026-09-03T12:00:00Z",
        "paymentMethod": "Manual",
        "status": "completed",
        "paymentType": "full",
        "notes": "Payment received via M-Pesa"
    }
    
    Returns: payment details and remaining balance
    """
    logger.info(f"[LIPA_LATER] RECORD_PAYMENT - Rider: {rider_id}, Customer: {customer_id}")
    
    try:
        if not payload:
            raise HTTPException(400, "Request body is required")
        
        # Find the Lipa Later record by customer_id (customer mobile)
        record = db.query(LipaLaterRecord).filter(
            and_(
                LipaLaterRecord.rider_id == rider_id,
                LipaLaterRecord.customer_mobile == customer_id
            )
        ).first()
        
        if not record:
            logger.warning(f"[LIPA_LATER] No record found for customer {customer_id}")
            raise HTTPException(404, f"No Lipa Later record found for customer {customer_id}")
        
        # Validate payment amount
        remaining_before = get_remaining_balance(record, db)
        if payload.amount > remaining_before:
            raise HTTPException(400, f"Payment amount exceeds remaining balance of {remaining_before}.")
        
        # ✅ Use LipaLaterPayment model!
        payment = LipaLaterPayment(
            rider_id=record.rider_id,
            lipa_later_id=record.id,
            amount_ksh=Decimal(str(payload.amount)),
            payment_date=datetime.fromisoformat(payload.date.replace('Z', '+00:00')).date() if payload.date else date.today(),
            reference=payload.notes if payload.notes else "",
            sync_status="synced",
        )
        db.add(payment)
        db.flush()
        
        new_status = update_lipa_later_status(record, db)
        db.commit()
        
        remaining_after = get_remaining_balance(record, db)
        
        logger.info(f"[LIPA_LATER] ✅ Payment recorded: {payment.id}")
        
        return LipaLaterPaymentResponse(
            ok=True,
            payment_id=str(payment.id),
            amount_paid=float(payload.amount),
            remaining_balance=max(0, remaining_after),
            record_status=new_status,
        )
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"[LIPA_LATER] Error recording payment: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error recording payment: {str(e)}")


@router.post("/record-payment/{lipa_later_id}", response_model=LipaLaterPaymentResponse)
def record_lipa_later_payment(
    lipa_later_id: str,
    payload: LipaLaterPaymentRequest,
    db: Session = Depends(get_db)
):
    """
    Record a payment against a Lipa Later record (path parameter version).
    
    Endpoint: POST /lipa-later/record-payment/{lipa_later_id}
    
    This endpoint uses the Lipa Later record ID directly.
    """
    logger.info(f"[LIPA_LATER] RECORD_PAYMENT - Record ID: {lipa_later_id}")
    
    try:
        record = db.query(LipaLaterRecord).filter_by(id=lipa_later_id).first()
        
        if not record:
            logger.warning(f"[LIPA_LATER] No record found: {lipa_later_id}")
            raise HTTPException(404, f"Lipa Later record not found: {lipa_later_id}")
        
        remaining_before = get_remaining_balance(record, db)
        if payload.amount > remaining_before:
            raise HTTPException(400, f"Payment amount exceeds remaining balance of {remaining_before}.")
        
        # ✅ Use LipaLaterPayment model!
        payment = LipaLaterPayment(
            rider_id=record.rider_id,
            lipa_later_id=record.id,
            amount_ksh=Decimal(str(payload.amount)),
            payment_date=datetime.fromisoformat(payload.date.replace('Z', '+00:00')).date() if payload.date else date.today(),
            reference=payload.notes if payload.notes else "",
            sync_status="synced",
        )
        db.add(payment)
        db.flush()
        
        new_status = update_lipa_later_status(record, db)
        db.commit()
        
        remaining_after = get_remaining_balance(record, db)
        
        logger.info(f"[LIPA_LATER] ✅ Payment recorded: {payment.id}")
        
        return LipaLaterPaymentResponse(
            ok=True,
            payment_id=str(payment.id),
            amount_paid=float(payload.amount),
            remaining_balance=max(0, remaining_after),
            record_status=new_status,
        )
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"[LIPA_LATER] Error recording payment: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error recording payment: {str(e)}")


@router.get("/customer-list/{rider_id}", response_model=dict)
def get_lipa_later_customers(rider_id: str, db: Session = Depends(get_db)):
    """
    Get all Lipa Later customers for a rider with payment status.
    
    Endpoint: GET /lipa-later/customer-list/{rider_id}
    """
    try:
        records = db.query(LipaLaterRecord).filter_by(
            rider_id=rider_id,
            status="pending"
        ).all()
        
        customers = []
        for record in records:
            remaining = get_remaining_balance(record, db)
            customers.append({
                "id": str(record.id),
                "name": record.customer_name,
                "mobile": record.customer_mobile,
                "amount": float(record.amount),
                "remaining": max(0, remaining),
                "due_date": str(record.due_date),
                "days_overdue": calculate_days_overdue(record.due_date),
                "status": record.status
            })
        
        return {
            "ok": True,
            "count": len(customers),
            "customers": customers
        }
        
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error fetching customers: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error fetching customers: {str(e)}")


@router.get("/ageing-report/{rider_id}", response_model=AgeingReportResponse)
def get_ageing_report(rider_id: str, db: Session = Depends(get_db)):
    """Get Lipa Later records categorized by payment age"""
    try:
        records = db.query(LipaLaterRecord).filter_by(
            rider_id=rider_id,
            status="pending"
        ).all()
        
        ageing_buckets = {
            "current": [],
            "overdue_1_30": [],
            "overdue_31_60": [],
            "overdue_61_90": [],
            "overdue_90_plus": []
        }
        
        for r in records:
            days_overdue = calculate_days_overdue(r.due_date)
            
            if days_overdue <= 0:
                ageing_buckets["current"].append(r)
            elif 1 <= days_overdue <= 30:
                ageing_buckets["overdue_1_30"].append(r)
            elif 31 <= days_overdue <= 60:
                ageing_buckets["overdue_31_60"].append(r)
            elif 61 <= days_overdue <= 90:
                ageing_buckets["overdue_61_90"].append(r)
            else:
                ageing_buckets["overdue_90_plus"].append(r)
        
        def format_bucket(bucket_records: list) -> AgeingBucketResponse:
            return AgeingBucketResponse(
                count=len(bucket_records),
                total_amount=sum(float(r.amount) for r in bucket_records),
                records=[
                    {
                        "id": str(r.id),
                        "customer_name": r.customer_name,
                        "customer_mobile": r.customer_mobile,
                        "amount": float(r.amount),
                        "due_date": str(r.due_date),
                        "days_overdue": calculate_days_overdue(r.due_date),
                        "remaining_balance": max(0, get_remaining_balance(r, db)),
                    }
                    for r in sorted(bucket_records, key=lambda x: x.due_date)
                ]
            )
        
        return AgeingReportResponse(
            current=format_bucket(ageing_buckets["current"]),
            overdue_1_30=format_bucket(ageing_buckets["overdue_1_30"]),
            overdue_31_60=format_bucket(ageing_buckets["overdue_31_60"]),
            overdue_61_90=format_bucket(ageing_buckets["overdue_61_90"]),
            overdue_90_plus=format_bucket(ageing_buckets["overdue_90_plus"]),
        )
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error generating ageing report: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error generating ageing report: {str(e)}")


@router.get("/statistics/{rider_id}", response_model=dict)
def get_lipa_later_statistics(rider_id: str, db: Session = Depends(get_db)):
    """Get Lipa Later statistics and summary for a rider"""
    try:
        all_records = db.query(LipaLaterRecord).filter_by(rider_id=rider_id).all()
        pending = [r for r in all_records if r.status == "pending"]
        paid = [r for r in all_records if r.status == "paid"]
        partial = [r for r in all_records if r.status == "partial"]
        
        today = date.today()
        overdue = [r for r in pending if r.due_date < today]
        due_today = [r for r in pending if r.due_date == today]
        
        return {
            "total_records": len(all_records),
            "pending_count": len(pending),
            "paid_count": len(paid),
            "partial_count": len(partial),
            "overdue_count": len(overdue),
            "due_today_count": len(due_today),
            "pending_amount": sum(float(r.amount) for r in pending),
            "paid_amount": sum(float(r.amount) for r in paid),
            "partial_amount": sum(float(r.amount) for r in partial),
            "overdue_amount": sum(float(r.amount) for r in overdue),
            "remaining_balance": sum(get_remaining_balance(r, db) for r in pending),
        }
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error generating statistics: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error generating statistics: {str(e)}")


@router.get("/admin/config", response_model=dict)
def get_lipa_later_config():
    """Get current Lipa Later configuration"""
    return {
        "records_per_page": 10,
        "scroll_height_px": 500,
        "enable_payment_tracking": True,
        "enable_ageing_report": True,
    }


@router.get("/admin/riders-summary", response_model=dict)
def get_riders_lipa_later_summary(db: Session = Depends(get_db)):
    """Get Lipa Later summary for all riders"""
    try:
        records = db.query(LipaLaterRecord).all()
        
        riders_data = {}
        for r in records:
            rider_id_str = str(r.rider_id)
            if rider_id_str not in riders_data:
                riders_data[rider_id_str] = {
                    "total": 0,
                    "pending": 0,
                    "paid": 0,
                    "partial": 0,
                    "total_amount": 0.0,
                    "pending_amount": 0.0,
                    "paid_amount": 0.0,
                    "remaining_balance": 0.0,
                }
            
            riders_data[rider_id_str]["total"] += 1
            riders_data[rider_id_str]["total_amount"] += float(r.amount)
            
            remaining = get_remaining_balance(r, db)
            
            if r.status == "pending":
                riders_data[rider_id_str]["pending"] += 1
                riders_data[rider_id_str]["pending_amount"] += float(r.amount)
                riders_data[rider_id_str]["remaining_balance"] += remaining
            elif r.status == "paid":
                riders_data[rider_id_str]["paid"] += 1
                riders_data[rider_id_str]["paid_amount"] += float(r.amount)
            elif r.status == "partial":
                riders_data[rider_id_str]["partial"] += 1
                riders_data[rider_id_str]["pending_amount"] += remaining
                riders_data[rider_id_str]["remaining_balance"] += remaining
        
        total_stats = {
            "total_records": len(records),
            "pending_records": sum(1 for r in records if r.status == "pending"),
            "paid_records": sum(1 for r in records if r.status == "paid"),
            "partial_records": sum(1 for r in records if r.status == "partial"),
            "total_amount": sum(float(r.amount) for r in records),
            "pending_amount": sum(float(r.amount) for r in records if r.status == "pending"),
            "paid_amount": sum(float(r.amount) for r in records if r.status == "paid"),
        }
        
        return {
            "summary": total_stats,
            "riders": riders_data
        }
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error generating riders summary: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error generating riders summary: {str(e)}")