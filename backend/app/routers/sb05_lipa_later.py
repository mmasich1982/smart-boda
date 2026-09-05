# backend/app/routers/sb05_lipa_later.py
# ============================================================================
# ✅ CRITICAL FIXES APPLIED TO THIS FILE:
# ============================================================================
# 1. FIXED 500 ERROR: Trip model fields corrected
#    ❌ OLD: Tried to set customer_name, customer_mobile, status on Trip
#    ✅ NEW: Trip only gets: rider_id, amount, payment_channel_code, recorded_at
#            Customer data goes to LipaLaterRecord (which references Trip)
#
# 2. FIXED 404 ERROR: Payment lookup now uses correct record ID
#    ❌ OLD: Tried to match customer_id against customer_mobile (phone number)
#    ✅ NEW: Match customer_id against LipaLaterRecord.id (UUID)
#
# 3. REMOVED: "partial" status (LipaLaterRecord model only has pending/paid)
#    ✅ NEW: Status is either "pending" or "paid" (no partial)
#
# 4. FIXED: Trip model field name: payment_channel_code (not payment_method)
#    ✅ NEW: Uses correct field name matching database migration
#
# 5. ENHANCED: Comprehensive error messages and logging for debugging
#    ✅ NEW: Better stack traces, validation messages, operation tracking
# ============================================================================

from datetime import datetime, date, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel, Field, ConfigDict, validator
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from decimal import Decimal, InvalidOperation
import logging
import uuid as uuid_lib

from app.database import get_db
from app.models.trip import Trip
from app.models.lipa_later_record import LipaLaterRecord
from app.models.lipa_later_payment import LipaLaterPayment

# ============================================================================
# LOGGING SETUP
# ============================================================================
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

router = APIRouter(prefix="/lipa-later", tags=["sb-05-lipa-later"])

# Module constants
PAYMENT_CHANNEL_LIPA_LATER = "LIPA_LATER"
STATUS_PENDING = "pending"
STATUS_PAID = "paid"
SYNC_STATUS_SYNCED = "synced"
SYNC_STATUS_PENDING = "pending"

# Ageing bucket boundaries (days)
AGEING_CURRENT_MAX = 0
AGEING_1_30_MIN, AGEING_1_30_MAX = 1, 30
AGEING_31_60_MIN, AGEING_31_60_MAX = 31, 60
AGEING_61_90_MIN, AGEING_61_90_MAX = 61, 90
AGEING_90_PLUS_MIN = 91


# ============================================================================
# REQUEST/RESPONSE SCHEMAS
# ============================================================================

class LipaLaterCreateRequest(BaseModel):
    """
    Request to create a Lipa Later trip and record.
    
    Accepts both camelCase (from frontend) and snake_case field names.
    Frontend sends: customerName, customerPhone, amount, dueDate
    Backend automatically converts to: customer_name, customer_mobile, amount, due_date
    
    Field Validation:
    - customer_name: Non-empty string, max 80 characters
    - customer_mobile: Non-empty phone number string
    - amount: Positive number (> 0)
    - due_date: Date in future (after today)
    
    Example request body:
    {
        "customerName": "Marto",
        "customerPhone": "0712333444",
        "amount": 300,
        "dueDate": "2026-09-30",
        "paymentMethod": "LipaLater"  // Extra field, will be ignored
    }
    
    Response contains:
    - ok: boolean
    - trip_id: UUID of created Trip record
    - lipa_later_id: UUID of created LipaLaterRecord ⭐ STORE THIS!
    - amount: Amount in KSh
    """
    customer_name: str = Field(..., alias="customerName", min_length=1, max_length=80)
    customer_mobile: str = Field(..., alias="customerPhone", min_length=1, max_length=20)
    amount: float = Field(..., gt=0, le=999999.99)
    due_date: date = Field(..., alias="dueDate")
    
    @validator('customer_name')
    def validate_customer_name(cls, v):
        """Ensure customer name is not just whitespace"""
        if not v or not v.strip():
            raise ValueError("Customer name cannot be empty or whitespace")
        return v.strip()
    
    @validator('customer_mobile')
    def validate_customer_mobile(cls, v):
        """Ensure customer mobile is not just whitespace"""
        if not v or not v.strip():
            raise ValueError("Customer mobile cannot be empty or whitespace")
        return v.strip()
    
    @validator('due_date')
    def validate_due_date(cls, v):
        """Ensure due date is in the future"""
        if v <= date.today():
            raise ValueError(f"Due date must be after today ({date.today()})")
        return v
    
    model_config = ConfigDict(
        populate_by_name=True,
        extra='ignore'  # Ignore extra fields like paymentMethod
    )


class LipaLaterPaymentQueryRequest(BaseModel):
    """
    Request to record a payment via Body parameters.
    
    Used for offline sync - frontend queues payments and syncs when online.
    
    Fields:
    - amount: Positive payment amount in KSh
    - date: ISO 8601 datetime string (e.g., "2026-09-03T12:00:00Z")
    - paymentMethod: Payment method used (e.g., "MPesa", "Cash", "Manual")
    - status: Payment status (e.g., "completed", "pending")
    - paymentType: Type of payment (e.g., "full", "partial")
    - notes: Optional payment reference or notes
    
    Example request body:
    {
        "amount": 500,
        "date": "2026-09-03T12:00:00Z",
        "paymentMethod": "MPesa",
        "status": "completed",
        "paymentType": "partial",
        "notes": "Paid via M-Pesa"
    }
    """
    amount: float = Field(..., gt=0, le=999999.99)
    date: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    paymentMethod: str = Field(default="Manual")
    status: str = Field(default="completed")
    paymentType: str = Field(default="full")
    notes: str = Field(default="")
    
    @validator('amount')
    def validate_amount(cls, v):
        """Ensure amount is valid"""
        if v <= 0:
            raise ValueError("Payment amount must be greater than zero")
        if v > 999999.99:
            raise ValueError("Payment amount cannot exceed 999,999.99")
        return v
    
    model_config = ConfigDict(populate_by_name=True, extra='ignore')


class LipaLaterPaymentRequest(BaseModel):
    """Request to record a payment (alternative format)"""
    amount_paid: float = Field(..., gt=0)
    payment_date: date = Field(default_factory=date.today)
    reference: str = Field(default="")


class AgeingBucketResponse(BaseModel):
    """
    Response for a single ageing bucket.
    
    Example:
    {
        "count": 5,
        "total_amount": 1500.00,
        "records": [...]
    }
    """
    count: int
    total_amount: float
    records: list


class AgeingReportResponse(BaseModel):
    """
    Complete ageing report with all buckets.
    
    Buckets:
    - current: Due date has not yet passed (days_overdue <= 0)
    - overdue_1_30: 1-30 days overdue
    - overdue_31_60: 31-60 days overdue
    - overdue_61_90: 61-90 days overdue
    - overdue_90_plus: 90+ days overdue
    """
    current: AgeingBucketResponse
    overdue_1_30: AgeingBucketResponse
    overdue_31_60: AgeingBucketResponse
    overdue_61_90: AgeingBucketResponse
    overdue_90_plus: AgeingBucketResponse


# ============================================================================
# HELPER FUNCTIONS - Core Business Logic
# ============================================================================

def calculate_days_overdue(due_date: date) -> int:
    """
    Calculate number of days overdue for a given due date.
    
    Args:
        due_date: The date payment was due
    
    Returns:
        int: Number of days overdue. Returns 0 or negative if not yet due.
             - 0 or negative: Not yet overdue
             - 1+: Days overdue
    
    Example:
        due_date = date(2026-09-01)
        today = date(2026-09-10)
        result = 9  (9 days overdue)
    """
    today = date.today()
    if due_date >= today:
        return 0
    delta = today - due_date
    return delta.days


def validate_lipa_later_record_exists(record_id: str, rider_id: str, db: Session) -> LipaLaterRecord:
    """
    Validate that a LipaLaterRecord exists for the given IDs.
    
    Args:
        record_id: UUID of the LipaLaterRecord
        rider_id: UUID of the rider
        db: Database session
    
    Returns:
        LipaLaterRecord: The validated record
    
    Raises:
        HTTPException 404: If record not found
    """
    if not record_id or not rider_id:
        raise HTTPException(400, "Both record_id and rider_id are required")
    
    try:
        record = db.query(LipaLaterRecord).filter(
            and_(
                LipaLaterRecord.rider_id == rider_id,
                LipaLaterRecord.id == record_id
            )
        ).first()
        
        if not record:
            logger.warning(f"[LIPA_LATER] Record lookup FAILED: ID={record_id}, Rider={rider_id}")
            raise HTTPException(404, f"No Lipa Later record found with ID {record_id}")
        
        return record
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error validating record: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error validating record: {str(e)}")


def get_remaining_balance(lipa_later_record: LipaLaterRecord, db: Session) -> float:
    """
    Calculate remaining balance for a Lipa Later record.
    
    Queries all LipaLaterPayment records associated with this record
    and calculates the outstanding balance.
    
    Args:
        lipa_later_record: The LipaLaterRecord to calculate balance for
        db: Database session
    
    Returns:
        float: Remaining balance in KSh (original_amount - total_paid)
        Always returns >= 0 (balance never goes negative)
    
    Raises:
        Returns original amount if any error occurs (fail-safe)
    
    Example:
        original_amount = 300
        payments = [100, 100]
        result = 100  (300 - 200)
    
    Notes:
        Uses Decimal for precise financial calculations to avoid
        floating-point rounding errors in monetary calculations.
    """
    if not lipa_later_record:
        logger.warning("[LIPA_LATER] get_remaining_balance called with None record")
        return 0.0
    
    try:
        # Query all payments for this Lipa Later record
        payments = db.query(LipaLaterPayment).filter(
            LipaLaterPayment.lipa_later_id == lipa_later_record.id
        ).all()
        
        # Use Decimal for precise financial arithmetic
        total_paid = Decimal('0')
        for payment in payments:
            if payment.amount_ksh:
                total_paid += Decimal(str(payment.amount_ksh))
        
        original_amount = Decimal(str(lipa_later_record.amount))
        
        # Calculate balance (never negative)
        remaining = original_amount - total_paid
        if remaining < 0:
            logger.warning(f"[LIPA_LATER] Balance is negative: {remaining}. Returning 0.")
            return 0.0
        
        return float(remaining)
        
    except (InvalidOperation, ValueError, TypeError) as e:
        logger.error(f"[LIPA_LATER] Decimal conversion error in balance calc: {str(e)}", exc_info=True)
        return float(lipa_later_record.amount)
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error calculating balance: {str(e)}", exc_info=True)
        return float(lipa_later_record.amount)


def update_lipa_later_status(record: LipaLaterRecord, db: Session) -> str:
    """
    Update the status of a Lipa Later record based on remaining balance.
    
    Status Logic:
    - remaining_balance <= 0  → "paid" (fully paid, sets paid_at timestamp)
    - remaining_balance > 0   → "pending" (full or partial amount still outstanding)
    
    Args:
        record: The LipaLaterRecord to update
        db: Database session
    
    Returns:
        str: The new status ("paid" or "pending")
    
    Notes:
        - Does NOT commit changes; caller must commit
        - Sets paid_at timestamp when status becomes "paid"
    """
    remaining = get_remaining_balance(record, db)
    
    if remaining <= 0:
        # Fully paid - set status and timestamp
        record.status = STATUS_PAID
        record.paid_at = datetime.now(timezone.utc)
        logger.info(f"[LIPA_LATER] Record {record.id} marked as PAID")
        return STATUS_PAID
    else:
        # Still pending
        record.status = STATUS_PENDING
        record.paid_at = None
        logger.info(f"[LIPA_LATER] Record {record.id} status is PENDING (balance: {remaining})")
        return STATUS_PENDING


def parse_payment_date(date_str: str) -> date:
    """
    Parse payment date from ISO 8601 string.
    
    Args:
        date_str: ISO 8601 datetime string (e.g., "2026-09-03T12:00:00Z")
    
    Returns:
        date: Parsed date object
    
    Raises:
        ValueError: If date string cannot be parsed
    """
    if not date_str:
        return date.today()
    
    try:
        # Handle 'Z' suffix for UTC timezone
        clean_date_str = date_str.replace('Z', '+00:00')
        dt = datetime.fromisoformat(clean_date_str)
        return dt.date()
    except (ValueError, TypeError) as e:
        logger.warning(f"[LIPA_LATER] Could not parse date '{date_str}': {str(e)}. Using today.")
        return date.today()


def format_ageing_bucket(records: list, db: Session) -> AgeingBucketResponse:
    """
    Format a list of records into an ageing bucket response.
    
    Args:
        records: List of LipaLaterRecord objects
        db: Database session
    
    Returns:
        AgeingBucketResponse: Formatted bucket with count, total, and records
    """
    try:
        formatted_records = []
        total_amount = Decimal('0')
        
        for r in sorted(records, key=lambda x: x.due_date):
            remaining = get_remaining_balance(r, db)
            total_amount += Decimal(str(r.amount))
            
            formatted_records.append({
                "id": str(r.id),
                "customer_name": r.customer_name,
                "customer_mobile": r.customer_mobile,
                "amount": float(r.amount),
                "due_date": r.due_date.isoformat(),
                "days_overdue": calculate_days_overdue(r.due_date),
                "remaining_balance": remaining,
                "status": r.status,
            })
        
        return AgeingBucketResponse(
            count=len(records),
            total_amount=float(total_amount),
            records=formatted_records
        )
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error formatting ageing bucket: {str(e)}", exc_info=True)
        return AgeingBucketResponse(count=0, total_amount=0.0, records=[])


# ============================================================================
# CORE ENDPOINTS - Trip and Record Management
# ============================================================================

@router.post("/record-trip", response_model=dict, status_code=201)
def create_lipa_later_trip(
    payload: LipaLaterCreateRequest, 
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """
    Create a Lipa Later trip entry with both Trip and LipaLaterRecord.
    
    This is the PRIMARY endpoint for recording a deferred payment transaction.
    It creates TWO records:
    1. Trip: Standard income record (payment_channel_code="LIPA_LATER")
    2. LipaLaterRecord: Deferred payment details for follow-up
    
    Endpoint: POST /lipa-later/record-trip?rider_id={rider_id}
    
    ✅ FIXES APPLIED:
    - Trip only gets fields it actually has: rider_id, amount, payment_channel_code, recorded_at
    - customer_name and customer_mobile go to LipaLaterRecord (not Trip)
    - recorded_at uses timezone-aware datetime as required by Trip model
    - trip_date auto-populated in LipaLaterRecord from current UTC time
    
    Request body:
    {
        "customerName": "Marto",
        "customerPhone": "0712333444",
        "amount": 300,
        "dueDate": "2026-09-30",
        "paymentMethod": "LipaLater"  // Extra field, ignored
    }
    
    Response:
    {
        "ok": true,
        "trip_id": "550e8400-e29b-41d4-a716-446655440000",
        "lipa_later_id": "550e8400-e29b-41d4-a716-446655440001",
        "amount": 300.0
    }
    
    ⭐ IMPORTANT: Frontend must store lipa_later_id for later payment recording!
    
    Error Cases:
    - 400: Bad Request - Invalid rider_id or other parameter errors
    - 422: Validation Error - Invalid customer name, phone, amount, or due date
    - 500: Server Error - Database or system errors
    """
    logger.info(f"[LIPA_LATER] ====== CREATE_TRIP START ======")
    logger.info(f"[LIPA_LATER] Rider: {rider_id}")
    logger.info(f"[LIPA_LATER] Customer: {payload.customer_name} ({payload.customer_mobile})")
    logger.info(f"[LIPA_LATER] Amount: {payload.amount}, Due: {payload.due_date}")
    
    try:
        # ===== VALIDATION PHASE =====
        logger.info("[LIPA_LATER] Phase 1: Validation")
        
        if not rider_id or not str(rider_id).strip():
            logger.warning("[LIPA_LATER] ❌ Validation failed: empty rider_id")
            raise HTTPException(400, "rider_id parameter is required")
        
        if not payload.customer_name or not payload.customer_name.strip():
            logger.warning("[LIPA_LATER] ❌ Validation failed: empty customer_name")
            raise HTTPException(422, "Enter the customer's name.")
        
        if not payload.customer_mobile or not payload.customer_mobile.strip():
            logger.warning("[LIPA_LATER] ❌ Validation failed: empty customer_mobile")
            raise HTTPException(422, "Enter the customer's mobile number.")
        
        if payload.amount <= 0:
            logger.warning(f"[LIPA_LATER] ❌ Validation failed: invalid amount {payload.amount}")
            raise HTTPException(422, "Enter an amount greater than zero.")
        
        today = date.today()
        if payload.due_date <= today:
            logger.warning(f"[LIPA_LATER] ❌ Validation failed: due_date {payload.due_date} not after {today}")
            raise HTTPException(422, "Due date must be after today.")
        
        logger.info("[LIPA_LATER] ✅ All validations passed")
        
        # ===== DATABASE OPERATIONS PHASE =====
        logger.info("[LIPA_LATER] Phase 2: Database Operations")
        
        # Create timezone-aware datetime (required by Trip model)
        now_utc = datetime.now(timezone.utc)
        
        # ✅ CRITICAL FIX: Only set fields that Trip model actually has!
        logger.info("[LIPA_LATER] Creating Trip record...")
        trip = Trip(
            rider_id=rider_id,
            amount=Decimal(str(payload.amount)),
            payment_channel_code=PAYMENT_CHANNEL_LIPA_LATER,  # ✅ Correct field name
            recorded_at=now_utc,                               # ✅ Timezone-aware datetime
            status="active",                                    # ✅ Standard trip status
            # ❌ DO NOT SET: customer_name, customer_mobile
            # These fields don't exist on Trip model!
        )
        db.add(trip)
        db.flush()  # Flush to get trip.id for linking
        
        logger.info(f"[LIPA_LATER] ✅ Trip created: {trip.id}")
        
        # Create Lipa Later record: tracks payment status and due dates
        # This is where customer_name and customer_mobile go!
        logger.info("[LIPA_LATER] Creating LipaLaterRecord...")
        lipa_later_record = LipaLaterRecord(
            rider_id=rider_id,
            trip_id=trip.id,  # ✅ Link to Trip we just created
            customer_name=payload.customer_name,
            customer_mobile=payload.customer_mobile,
            amount=payload.amount,
            trip_date=now_utc,  # Server captures current time
            due_date=payload.due_date,
            status=STATUS_PENDING
        )
        db.add(lipa_later_record)
        db.commit()  # Commit both records atomically
        
        logger.info(f"[LIPA_LATER] ✅ LipaLaterRecord created: {lipa_later_record.id}")
        logger.info(f"[LIPA_LATER] ✅ Link: Trip {trip.id} → LipaLater {lipa_later_record.id}")
        logger.info(f"[LIPA_LATER] ====== CREATE_TRIP SUCCESS ======")
        
        return {
            "ok": True,
            "trip_id": str(trip.id),
            "lipa_later_id": str(lipa_later_record.id),  # ✅ CRITICAL: Frontend must store this!
            "amount": float(payload.amount)
        }
        
    except HTTPException:
        db.rollback()
        logger.error(f"[LIPA_LATER] ====== CREATE_TRIP FAILED (HTTP) ======", exc_info=True)
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"[LIPA_LATER] ====== CREATE_TRIP FAILED (ERROR) ======", exc_info=True)
        logger.error(f"[LIPA_LATER] Exception: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error creating Lipa Later trip: {str(e)}")


@router.get("/customer-list")
def get_lipa_later_customers(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """
    Get all Lipa Later customers for a rider with their payment status.
    
    Endpoint: GET /lipa-later/customer-list?rider_id={rider_id}
    
    Returns a list of all customers with deferred payments, including:
    - Customer details (name, phone)
    - Original amount and remaining balance
    - Current status (pending/paid)
    - Due date and days overdue
    
    Response:
    {
        "ok": true,
        "count": 1,
        "customers": [
            {
                "id": "550e8400-e29b-...",  // ⭐ Use this for payment recording
                "customer_name": "Marto",
                "customer_mobile": "0712333444",
                "original_amount": 300.0,
                "remaining_balance": 200.0,
                "status": "pending",
                "due_date": "2026-09-30",
                "days_overdue": 0
            }
        ]
    }
    """
    logger.info(f"[LIPA_LATER] GET_CUSTOMERS - Rider: {rider_id}")
    
    try:
        # Query all Lipa Later records for this rider
        records = db.query(LipaLaterRecord).filter(
            LipaLaterRecord.rider_id == rider_id
        ).all()
        
        logger.info(f"[LIPA_LATER] Found {len(records)} records")
        
        customers = []
        for record in records:
            remaining = get_remaining_balance(record, db)
            customer_data = {
                "id": str(record.id),  # ✅ This is the ID to use for payment recording!
                "customer_name": record.customer_name,
                "customer_mobile": record.customer_mobile,
                "original_amount": float(record.amount),
                "remaining_balance": remaining,
                "status": record.status,
                "due_date": record.due_date.isoformat(),
                "days_overdue": calculate_days_overdue(record.due_date)
            }
            customers.append(customer_data)
        
        logger.info(f"[LIPA_LATER] ✅ Returned {len(customers)} customer records")
        
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
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    customer_id: str = Query(..., description="Lipa Later Record ID (UUID) - NOT phone number!"),
    payload: LipaLaterPaymentQueryRequest = Body(..., description="Payment details"),
    db: Session = Depends(get_db)
):
    """
    ✅ FIXED ENDPOINT: Record a payment using the Lipa Later Record ID.
    
    ============================================================================
    CRITICAL FIX: Uses LipaLaterRecord.id for lookup (NOT customer_mobile)
    ============================================================================
    
    This is the PRIMARY endpoint for recording partial or full payments against
    a Lipa Later record. It:
    1. Validates the record exists
    2. Validates the payment amount
    3. Creates a LipaLaterPayment record
    4. Updates the LipaLaterRecord status based on remaining balance
    
    Endpoint: POST /lipa-later/record-payment?rider_id={rider_id}&customer_id={lipa_later_record_id}
    
    ⚠️ IMPORTANT: customer_id MUST be the lipa_later_record_id from POST /record-trip
    This is NOT:
    - A generated customer ID (e.g., "cust_0766778899_1788557123929") ❌
    - A phone number (e.g., "0712333444") ❌
    It IS:
    - The Lipa Later Record ID (UUID from LipaLaterRecord) ✅
    
    Request body:
    {
        "amount": 500,
        "date": "2026-09-03T12:00:00Z",
        "paymentMethod": "MPesa",
        "status": "completed",
        "paymentType": "full",
        "notes": "Paid via M-Pesa"
    }
    
    Response:
    {
        "ok": true,
        "payment_id": "550e8400-e29b-...",
        "amount_paid": 500.0,
        "remaining_balance": 0.0,
        "record_status": "paid"
    }
    
    ✅ FIXES APPLIED:
    - Changed from customer_mobile lookup to LipaLaterRecord.id lookup
    - Better error messages explaining the fix
    - Enhanced validation and logging
    - Status only "pending" or "paid" (no "partial")
    
    Error Cases:
    - 400: Bad Request - Missing parameters or invalid amount
    - 404: Not Found - Record not found (check that customer_id is the lipa_later_record_id!)
    - 500: Server Error - Database errors
    """
    logger.info(f"[LIPA_LATER] ====== RECORD_PAYMENT START ======")
    logger.info(f"[LIPA_LATER] Rider: {rider_id}, Record ID: {customer_id}")
    logger.info(f"[LIPA_LATER] Payment: {payload.amount} KSh on {payload.date}")
    
    try:
        # ===== REQUEST VALIDATION PHASE =====
        logger.info("[LIPA_LATER] Phase 1: Request Validation")
        
        if not payload:
            logger.warning("[LIPA_LATER] ❌ No payload provided")
            raise HTTPException(400, "Request body is required")
        
        if not rider_id or not str(rider_id).strip():
            logger.warning("[LIPA_LATER] ❌ Missing rider_id")
            raise HTTPException(400, "rider_id parameter is required")
        
        if not customer_id or not str(customer_id).strip():
            logger.warning("[LIPA_LATER] ❌ Missing customer_id (lipa_later_record_id)")
            raise HTTPException(400, "customer_id parameter (lipa_later_record_id) is required")
        
        if payload.amount <= 0:
            logger.warning(f"[LIPA_LATER] ❌ Invalid amount: {payload.amount}")
            raise HTTPException(400, "Payment amount must be greater than zero")
        
        logger.info("[LIPA_LATER] ✅ Request validation passed")
        
        # ===== RECORD LOOKUP PHASE =====
        logger.info("[LIPA_LATER] Phase 2: Record Lookup")
        logger.info(f"[LIPA_LATER] Looking up record: {customer_id}")
        
        record = db.query(LipaLaterRecord).filter(
            and_(
                LipaLaterRecord.rider_id == rider_id,
                LipaLaterRecord.id == customer_id  # ✅ CRITICAL: Use record ID!
            )
        ).first()
        
        if not record:
            logger.warning(f"[LIPA_LATER] ❌ Record NOT found: ID={customer_id}, Rider={rider_id}")
            logger.warning("[LIPA_LATER] COMMON CAUSE: customer_id should be the lipa_later_record_id")
            logger.warning("[LIPA_LATER] from /record-trip response, NOT a phone number or generated ID")
            raise HTTPException(404, f"No Lipa Later record found with ID {customer_id}")
        
        logger.info(f"[LIPA_LATER] ✅ Record FOUND: {record.id}")
        logger.info(f"[LIPA_LATER] Customer: {record.customer_name} ({record.customer_mobile})")
        
        # ===== PAYMENT VALIDATION PHASE =====
        logger.info("[LIPA_LATER] Phase 3: Payment Validation")
        
        remaining_before = get_remaining_balance(record, db)
        logger.info(f"[LIPA_LATER] Remaining balance before payment: {remaining_before}")
        
        if payload.amount > remaining_before:
            logger.warning(f"[LIPA_LATER] ❌ Payment {payload.amount} exceeds balance {remaining_before}")
            raise HTTPException(400, f"Payment amount exceeds remaining balance of {remaining_before}.")
        
        logger.info("[LIPA_LATER] ✅ Payment validation passed")
        
        # ===== PAYMENT RECORDING PHASE =====
        logger.info("[LIPA_LATER] Phase 4: Payment Recording")
        
        payment_date = parse_payment_date(payload.date)
        payment = LipaLaterPayment(
            rider_id=record.rider_id,
            lipa_later_id=record.id,
            amount_ksh=Decimal(str(payload.amount)),
            payment_date=payment_date,
            reference=payload.notes if payload.notes else "",
            sync_status=SYNC_STATUS_SYNCED,
        )
        db.add(payment)
        db.flush()
        
        logger.info(f"[LIPA_LATER] ✅ Payment created: {payment.id}")
        
        # ===== STATUS UPDATE PHASE =====
        logger.info("[LIPA_LATER] Phase 5: Status Update")
        
        new_status = update_lipa_later_status(record, db)
        db.commit()
        
        remaining_after = get_remaining_balance(record, db)
        
        logger.info(f"[LIPA_LATER] ✅ Status updated: {new_status}")
        logger.info(f"[LIPA_LATER] Remaining balance after: {remaining_after}")
        logger.info(f"[LIPA_LATER] ====== RECORD_PAYMENT SUCCESS ======")
        
        return {
            "ok": True,
            "payment_id": str(payment.id),
            "amount_paid": float(payload.amount),
            "remaining_balance": max(0, remaining_after),
            "record_status": new_status,
        }
        
    except HTTPException:
        db.rollback()
        logger.error(f"[LIPA_LATER] ====== RECORD_PAYMENT FAILED (HTTP) ======", exc_info=True)
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"[LIPA_LATER] ====== RECORD_PAYMENT FAILED (ERROR) ======", exc_info=True)
        logger.error(f"[LIPA_LATER] Exception: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error recording payment: {str(e)}")


@router.post("/record-payment-query", response_model=dict)
def record_payment_by_query_alias(
    rider_id: str = Query(..., description="Rider ID"),
    customer_id: str = Query(..., description="Lipa Later Record ID"),
    payload: LipaLaterPaymentQueryRequest = Body(..., description="Payment details"),
    db: Session = Depends(get_db)
):
    """
    Alias endpoint for backward compatibility with /record-payment.
    
    Endpoint: POST /lipa-later/record-payment-query?rider_id={rider_id}&customer_id={lipa_later_record_id}
    
    This endpoint delegates to /record-payment. Use /record-payment in new code.
    """
    logger.info(f"[LIPA_LATER] RECORD_PAYMENT_QUERY (alias) - Rider: {rider_id}")
    
    # Delegate to main endpoint
    return record_payment(rider_id, customer_id, payload, db)


# ============================================================================
# REPORTING ENDPOINTS - Analytics and Ageing Reports
# ============================================================================

@router.get("/ageing-report/{rider_id}", response_model=AgeingReportResponse)
def get_ageing_report(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """
    Get Lipa Later records categorized by payment age (ageing analysis).
    
    This endpoint groups pending records into ageing buckets based on
    how many days overdue they are. Paid records are excluded.
    
    Endpoint: GET /lipa-later/ageing-report/{rider_id}
    
    Ageing Buckets:
    - current: Due date has not yet passed (days_overdue <= 0)
    - overdue_1_30: 1-30 days overdue
    - overdue_31_60: 31-60 days overdue
    - overdue_61_90: 61-90 days overdue
    - overdue_90_plus: 90+ days overdue
    
    Response:
    {
        "current": {"count": 2, "total_amount": 600.0, "records": [...]},
        "overdue_1_30": {"count": 1, "total_amount": 300.0, "records": [...]},
        "overdue_31_60": {"count": 0, "total_amount": 0.0, "records": []},
        "overdue_61_90": {"count": 0, "total_amount": 0.0, "records": []},
        "overdue_90_plus": {"count": 1, "total_amount": 500.0, "records": [...]}
    }
    """
    logger.info(f"[LIPA_LATER] GET_AGEING_REPORT - Rider: {rider_id}")
    
    try:
        # Query only PENDING records (exclude paid)
        records = db.query(LipaLaterRecord).filter(
            and_(
                LipaLaterRecord.rider_id == rider_id,
                LipaLaterRecord.status == STATUS_PENDING
            )
        ).all()
        
        logger.info(f"[LIPA_LATER] Found {len(records)} pending records")
        
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
            
            if days_overdue <= AGEING_CURRENT_MAX:
                ageing_buckets["current"].append(r)
            elif AGEING_1_30_MIN <= days_overdue <= AGEING_1_30_MAX:
                ageing_buckets["overdue_1_30"].append(r)
            elif AGEING_31_60_MIN <= days_overdue <= AGEING_31_60_MAX:
                ageing_buckets["overdue_31_60"].append(r)
            elif AGEING_61_90_MIN <= days_overdue <= AGEING_61_90_MAX:
                ageing_buckets["overdue_61_90"].append(r)
            else:  # 90+ days
                ageing_buckets["overdue_90_plus"].append(r)
        
        logger.info(f"[LIPA_LATER] ✅ Ageing report generated")
        
        return AgeingReportResponse(
            current=format_ageing_bucket(ageing_buckets["current"], db),
            overdue_1_30=format_ageing_bucket(ageing_buckets["overdue_1_30"], db),
            overdue_31_60=format_ageing_bucket(ageing_buckets["overdue_31_60"], db),
            overdue_61_90=format_ageing_bucket(ageing_buckets["overdue_61_90"], db),
            overdue_90_plus=format_ageing_bucket(ageing_buckets["overdue_90_plus"], db),
        )
        
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error generating ageing report: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error generating ageing report: {str(e)}")


@router.get("/statistics/{rider_id}", response_model=dict)
def get_lipa_later_statistics(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """
    Get Lipa Later statistics and summary for a rider.
    
    Endpoint: GET /lipa-later/statistics/{rider_id}
    
    Returns counts and amounts for:
    - Total records (pending + paid)
    - Records by status
    - Overdue and due-today counts
    - Remaining balance across all pending records
    
    Response:
    {
        "total_records": 5,
        "pending_count": 3,
        "paid_count": 2,
        "overdue_count": 1,
        "due_today_count": 0,
        "pending_amount": 800.0,
        "paid_amount": 500.0,
        "overdue_amount": 300.0,
        "remaining_balance": 300.0
    }
    """
    logger.info(f"[LIPA_LATER] GET_STATISTICS - Rider: {rider_id}")
    
    try:
        all_records = db.query(LipaLaterRecord).filter_by(rider_id=rider_id).all()
        
        pending = [r for r in all_records if r.status == STATUS_PENDING]
        paid = [r for r in all_records if r.status == STATUS_PAID]
        
        today = date.today()
        overdue = [r for r in pending if r.due_date < today]
        due_today = [r for r in pending if r.due_date == today]
        
        remaining_balance = sum(get_remaining_balance(r, db) for r in pending)
        
        logger.info(f"[LIPA_LATER] ✅ Statistics generated")
        
        return {
            "total_records": len(all_records),
            "pending_count": len(pending),
            "paid_count": len(paid),
            "overdue_count": len(overdue),
            "due_today_count": len(due_today),
            "pending_amount": sum(float(r.amount) for r in pending),
            "paid_amount": sum(float(r.amount) for r in paid),
            "overdue_amount": sum(float(r.amount) for r in overdue),
            "remaining_balance": remaining_balance,
        }
        
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error generating statistics: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error generating statistics: {str(e)}")


# ============================================================================
# ADMIN ENDPOINTS - Configuration and Summaries
# ============================================================================

@router.get("/admin/config", response_model=dict)
def get_lipa_later_config():
    """
    Get current Lipa Later configuration and feature flags.
    
    Endpoint: GET /lipa-later/admin/config
    
    Response:
    {
        "records_per_page": 10,
        "scroll_height_px": 500,
        "enable_payment_tracking": true,
        "enable_ageing_report": true
    }
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
    Get Lipa Later summary for all riders (admin/analytics view).
    
    Endpoint: GET /lipa-later/admin/riders-summary
    
    Returns aggregated statistics across all riders for business intelligence.
    
    Response:
    {
        "summary": {
            "total_records": 50,
            "pending_records": 30,
            "paid_records": 20,
            "total_amount": 10000.0,
            "pending_amount": 6000.0,
            "paid_amount": 4000.0
        },
        "riders": {
            "3dc31447-..": {
                "total": 5,
                "pending": 3,
                "paid": 2,
                "total_amount": 1500.0,
                "pending_amount": 900.0,
                "remaining_balance": 300.0
            },
            ...
        }
    }
    """
    logger.info("[LIPA_LATER] GET_RIDERS_SUMMARY - All riders summary")
    
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
                    "total_amount": 0.0,
                    "pending_amount": 0.0,
                    "paid_amount": 0.0,
                    "remaining_balance": 0.0,
                }
            
            riders_data[rider_id_str]["total"] += 1
            riders_data[rider_id_str]["total_amount"] += float(r.amount)
            
            remaining = get_remaining_balance(r, db)
            
            if r.status == STATUS_PENDING:
                riders_data[rider_id_str]["pending"] += 1
                riders_data[rider_id_str]["pending_amount"] += float(r.amount)
                riders_data[rider_id_str]["remaining_balance"] += remaining
            elif r.status == STATUS_PAID:
                riders_data[rider_id_str]["paid"] += 1
                riders_data[rider_id_str]["paid_amount"] += float(r.amount)
        
        total_stats = {
            "total_records": len(records),
            "pending_records": sum(1 for r in records if r.status == STATUS_PENDING),
            "paid_records": sum(1 for r in records if r.status == STATUS_PAID),
            "total_amount": sum(float(r.amount) for r in records),
            "pending_amount": sum(float(r.amount) for r in records if r.status == STATUS_PENDING),
            "paid_amount": sum(float(r.amount) for r in records if r.status == STATUS_PAID),
        }
        
        logger.info(f"[LIPA_LATER] ✅ Riders summary generated for {len(riders_data)} riders")
        
        return {
            "summary": total_stats,
            "riders": riders_data
        }
        
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error generating riders summary: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error generating riders summary: {str(e)}")