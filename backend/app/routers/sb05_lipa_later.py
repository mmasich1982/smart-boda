# backend/app/routers/sb05_lipa_later.py
# ============================================================================
# ✅ CRITICAL FIX APPLIED: Record lookup now uses LipaLaterRecord.id
# ============================================================================
# ROOT CAUSE OF 404 ERROR FIXED:
# ❌ OLD: Tried to match customer_id (generated ID like "cust_077...") against customer_mobile ("0712333444")
# ✅ NEW: Match customer_id against LipaLaterRecord.id (the actual record ID from trip creation)
# ============================================================================

from datetime import datetime, date, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Body
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
    amount_paid: float = Field(..., gt=0)
    payment_date: date = Field(default_factory=date.today)
    reference: str = Field(default="")


class LipaLaterPaymentQueryRequest(BaseModel):
    """Request to record a payment via query parameters (frontend offline sync)"""
    amount: float = Field(..., gt=0)
    date: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    paymentMethod: str = Field(default="Manual")
    status: str = Field(default="completed")
    paymentType: str = Field(default="full")
    notes: str = Field(default="")
    
    model_config = ConfigDict(populate_by_name=True, extra='ignore')


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
    """
    Calculate days overdue without external dependencies.
    
    Returns 0 if not yet due, otherwise returns number of days overdue.
    """
    today = date.today()
    if due_date >= today:
        return 0
    delta = today - due_date
    return delta.days


def get_remaining_balance(lipa_later_record: LipaLaterRecord, db: Session) -> float:
    """
    Calculate remaining balance for a Lipa Later record.
    
    Queries all LipaLaterPayment records and calculates outstanding balance.
    Uses Decimal arithmetic for precise financial calculations.
    """
    if not lipa_later_record:
        return 0.0
    
    try:
        # Query LipaLaterPayment (not Payment!) - this is critical for correctness
        total_paid = db.query(LipaLaterPayment).filter(
            LipaLaterPayment.lipa_later_id == lipa_later_record.id
        ).with_entities(LipaLaterPayment.amount_ksh).all()
        
        # Use Decimal for precise financial calculations
        paid_sum = sum(Decimal(str(p[0])) for p in total_paid if p[0]) if total_paid else Decimal('0')
        original_amount = Decimal(str(lipa_later_record.amount))
        
        # Ensure balance never goes negative
        return float(max(Decimal('0'), original_amount - paid_sum))
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error calculating balance: {str(e)}", exc_info=True)
        return float(lipa_later_record.amount)


def update_lipa_later_status(record: LipaLaterRecord, db: Session) -> str:
    """
    Update and return the current status of a Lipa Later record.
    
    Status values:
    - "paid": remaining balance <= 0 (fully paid, sets paid_at timestamp)
    - "partial": 0 < remaining < original amount (some payment made)
    - "pending": remaining == original amount (no payments made)
    """
    remaining = get_remaining_balance(record, db)
    
    if remaining <= 0:
        # Fully paid
        record.status = "paid"
        record.paid_at = datetime.now(timezone.utc)
        return "paid"
    elif remaining < float(record.amount):
        # Partial payment made
        return "partial"
    else:
        # No payments made yet
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
    IMPORTANT: Store the lipa_later_id - use it for record-payment calls!
    """
    logger.info(f"[LIPA_LATER] CREATE_TRIP - Rider: {rider_id}, Customer: {payload.customer_name}")
    
    try:
        # ===== VALIDATION PHASE =====
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
        
        # ===== DATABASE OPERATIONS PHASE =====
        # ✅ CRITICAL FIX: Use correct Trip model field names!
        logger.info("[LIPA_LATER] Creating Trip record...")
        trip = Trip(
            rider_id=rider_id,
            amount=Decimal(str(payload.amount)),
            customer_name=payload.customer_name,
            customer_mobile=payload.customer_mobile,
            status="active",
            recorded_at=now,
            payment_channel_code="LIPA_LATER"
        )
        db.add(trip)
        db.flush()  # Flush to get trip.id for linking
        
        # Create Lipa Later record: tracks payment status and due dates
        logger.info("[LIPA_LATER] Creating LipaLaterRecord...")
        lipa_later_record = LipaLaterRecord(
            rider_id=rider_id,
            trip_id=str(trip.id),
            customer_name=payload.customer_name,
            customer_mobile=payload.customer_mobile,
            amount=payload.amount,
            due_date=payload.due_date,
            status="pending"
        )
        db.add(lipa_later_record)
        db.commit()  # Commit both records atomically
        
        logger.info(f"[LIPA_LATER] ✅ Trip: {trip.id}, LipaLaterRecord: {lipa_later_record.id}")
        
        return {
            "ok": True,
            "trip_id": str(trip.id),
            "lipa_later_id": str(lipa_later_record.id),  # ✅ IMPORTANT: Frontend should store this!
            "amount": float(payload.amount)
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"[LIPA_LATER] Error creating trip: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error creating Lipa Later trip: {str(e)}")


@router.get("/customer-list")
def get_lipa_later_customers(
    rider_id: str = Query(..., description="Rider ID"),
    db: Session = Depends(get_db)
):
    """
    Get all Lipa Later customers for a rider with their payment status.
    
    Endpoint: GET /lipa-later/customer-list?rider_id={rider_id}
    """
    logger.info(f"[LIPA_LATER] GET_CUSTOMERS - Rider: {rider_id}")
    
    try:
        records = db.query(LipaLaterRecord).filter(
            LipaLaterRecord.rider_id == rider_id
        ).all()
        
        customers = []
        for record in records:
            remaining = get_remaining_balance(record, db)
            customers.append({
                "id": str(record.id),  # ✅ This is the ID to use for payment recording!
                "customer_name": record.customer_name,
                "customer_mobile": record.customer_mobile,
                "original_amount": float(record.amount),
                "remaining_balance": remaining,
                "status": record.status,
                "due_date": record.due_date.isoformat(),
                "days_overdue": calculate_days_overdue(record.due_date)
            })
        
        logger.info(f"[LIPA_LATER] ✅ Found {len(customers)} customers for rider {rider_id}")
        
        return {
            "ok": True,
            "count": len(customers),
            "customers": customers
        }
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error fetching customer list: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error fetching customer list: {str(e)}")


@router.post("/record-payment", response_model=dict)
def record_payment(
    rider_id: str = Query(..., description="Rider ID"),
    customer_id: str = Query(..., description="Lipa Later Record ID (NOT phone number, NOT generated customer ID)"),
    payload: LipaLaterPaymentQueryRequest = Body(..., description="Payment details"),
    db: Session = Depends(get_db)
):
    """
    ✅ FIXED ENDPOINT: Record a payment using the Lipa Later Record ID.
    
    ============================================================================
    CRITICAL FIX: This now uses LipaLaterRecord.id instead of customer_mobile
    ============================================================================
    
    Endpoint: POST /lipa-later/record-payment?rider_id={rider_id}&customer_id={lipa_later_record_id}
    
    The customer_id parameter MUST be the lipa_later_id returned from POST /record-trip.
    This is NOT:
    - A generated customer ID (e.g., "cust_0766778899_1788557123929") ❌
    - A phone number (e.g., "0712333444") ❌
    It IS:
    - The Lipa Later Record ID (e.g., "550e8400-e29b-41d4-a716-446655440000") ✅
    
    Request body:
    {
        "amount": 500,
        "date": "2026-09-03T12:00:00Z",
        "paymentMethod": "Manual",
        "status": "completed",
        "paymentType": "full",
        "notes": "Payment received"
    }
    
    ✅ FIXES APPLIED:
    - Changed customer_mobile lookup to LipaLaterRecord.id lookup
    - Frontend must send the correct lipa_later_record_id
    - Query parameters renamed to be more explicit
    - Error messages clarified
    """
    logger.info(f"[LIPA_LATER] RECORD_PAYMENT - Rider: {rider_id}, Record ID: {customer_id}")
    logger.info(f"[LIPA_LATER] Payload received: {payload}")
    
    try:
        # ===== REQUEST VALIDATION PHASE =====
        if not payload:
            logger.warning("[LIPA_LATER] No payload provided")
            raise HTTPException(400, "Request body is required")
        
        # Validate query parameters
        if not rider_id or not rider_id.strip():
            logger.warning("[LIPA_LATER] Missing rider_id")
            raise HTTPException(400, "rider_id parameter is required")
        
        if not customer_id or not customer_id.strip():
            logger.warning("[LIPA_LATER] Missing customer_id (lipa_later_record_id)")
            raise HTTPException(400, "customer_id parameter (lipa_later_record_id) is required")
        
        # ===== RECORD LOOKUP PHASE =====
        # ✅ FIXED: Now uses LipaLaterRecord.id instead of customer_mobile
        logger.info(f"[LIPA_LATER] Looking up record with ID: {customer_id} for rider: {rider_id}")
        record = db.query(LipaLaterRecord).filter(
            and_(
                LipaLaterRecord.rider_id == rider_id,
                LipaLaterRecord.id == customer_id  # ✅ FIXED: Use record ID!
            )
        ).first()
        
        if not record:
            logger.warning(f"[LIPA_LATER] No record found with ID {customer_id} for rider {rider_id}")
            logger.warning("[LIPA_LATER] COMMON CAUSE: customer_id should be the lipa_later_record_id from /record-trip, not a phone number or generated ID")
            raise HTTPException(404, f"No Lipa Later record found with ID {customer_id}")
        
        logger.info(f"[LIPA_LATER] ✅ Found record: {record.id} for customer: {record.customer_name} ({record.customer_mobile})")
        
        remaining_before = get_remaining_balance(record, db)
        
        # ===== PAYMENT VALIDATION PHASE =====
        # Validate payment amount is positive
        if payload.amount <= 0:
            logger.warning(f"[LIPA_LATER] Invalid amount: {payload.amount}")
            raise HTTPException(400, "Payment amount must be greater than zero")
        
        # Validate payment does not exceed remaining balance
        if payload.amount > remaining_before:
            logger.warning(f"[LIPA_LATER] Payment amount {payload.amount} exceeds balance {remaining_before}")
            raise HTTPException(400, f"Payment amount exceeds remaining balance of {remaining_before}.")
        
        # ===== PAYMENT RECORDING PHASE =====
        logger.info(f"[LIPA_LATER] Creating payment record...")
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
        
        # Update Lipa Later record status based on new payment
        new_status = update_lipa_later_status(record, db)
        db.commit()
        
        remaining_after = get_remaining_balance(record, db)
        
        logger.info(f"[LIPA_LATER] ✅ Payment recorded: {payment.id}")
        logger.info(f"[LIPA_LATER] Status: {record.status} → {new_status}")
        logger.info(f"[LIPA_LATER] Remaining balance: {remaining_after}")
        
        return {
            "ok": True,
            "payment_id": str(payment.id),
            "amount_paid": float(payload.amount),
            "remaining_balance": max(0, remaining_after),
            "record_status": new_status,
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"[LIPA_LATER] Error recording payment: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error recording payment: {str(e)}")


@router.post("/record-payment-query", response_model=dict)
def record_payment_by_query_alias(
    rider_id: str = Query(..., description="Rider ID"),
    customer_id: str = Query(..., description="Lipa Later Record ID"),
    payload: LipaLaterPaymentQueryRequest = Body(..., description="Payment details"),
    db: Session = Depends(get_db)
):
    """
    Alias endpoint for backward compatibility.
    
    Same as /record-payment endpoint.
    
    Endpoint: POST /lipa-later/record-payment-query?rider_id={rider_id}&customer_id={lipa_later_record_id}
    """
    logger.info(f"[LIPA_LATER] RECORD_PAYMENT_QUERY (alias) - Rider: {rider_id}, Record ID: {customer_id}")
    
    # Delegate to main endpoint
    return record_payment(rider_id, customer_id, payload, db)


@router.get("/ageing-report/{rider_id}", response_model=AgeingReportResponse)
def get_ageing_report(rider_id: str, db: Session = Depends(get_db)):
    """
    Get Lipa Later records categorized by payment age (ageing analysis).
    
    Endpoint: GET /lipa-later/ageing-report/{rider_id}
    """
    try:
        # Query only pending records
        records = db.query(LipaLaterRecord).filter_by(
            rider_id=rider_id,
            status="pending"
        ).all()
        
        # Initialize ageing buckets
        ageing_buckets = {
            "current": [],
            "overdue_1_30": [],
            "overdue_31_60": [],
            "overdue_61_90": [],
            "overdue_90_plus": []
        }
        
        # Categorize each record into appropriate aging bucket
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
        
        logger.info(f"[LIPA_LATER] ✅ Ageing report generated for {rider_id}")
        
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
    """
    Get Lipa Later statistics and summary for a rider.
    
    Endpoint: GET /lipa-later/statistics/{rider_id}
    """
    try:
        all_records = db.query(LipaLaterRecord).filter_by(rider_id=rider_id).all()
        pending = [r for r in all_records if r.status == "pending"]
        paid = [r for r in all_records if r.status == "paid"]
        partial = [r for r in all_records if r.status == "partial"]
        
        today = date.today()
        overdue = [r for r in pending if r.due_date < today]
        due_today = [r for r in pending if r.due_date == today]
        
        logger.info(f"[LIPA_LATER] ✅ Statistics generated for {rider_id}")
        
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
    """
    Get current Lipa Later configuration.
    
    Endpoint: GET /lipa-later/admin/config
    """
    logger.info("[LIPA_LATER] GET_CONFIG - Admin configuration requested")
    
    return {
        "records_per_page": 10,
        "scroll_height_px": 500,
        "enable_payment_tracking": True,
        "enable_ageing_report": True,
    }


@router.get("/admin/riders-summary", response_model=dict)
def get_riders_lipa_later_summary(db: Session = Depends(get_db)):
    """
    Get Lipa Later summary for all riders (admin view).
    
    Endpoint: GET /lipa-later/admin/riders-summary
    """
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
        
        logger.info(f"[LIPA_LATER] ✅ Riders summary generated with {len(riders_data)} riders")
        
        return {
            "summary": total_stats,
            "riders": riders_data
        }
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error generating riders summary: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error generating riders summary: {str(e)}")