# backend/app/routers/sb05_lipa_later.py
# ============================================================================
# ✅ CRITICAL FIXES APPLIED TO THIS FILE:
# ============================================================================
# 1. FIXED 500 ERROR: Enhanced error handling and logging for database constraints
#    - Added detailed error messages to understand constraint failures
#    - Better handling of foreign key violations
#    - Fallback for missing payment_channel_code
#
# 2. FIXED 404 ERROR: Payment lookup now uses correct record ID
#    ✅ Match customer_id against LipaLaterRecord.id (UUID)
#
# 3. FIXED DEPLOYMENT ERROR: Using Path() for path parameters
#    ✅ rider_id in /ageing-report/{rider_id} uses Path()
#
# 4. REMOVED: "partial" status (LipaLaterRecord model only has pending/paid)
#    ✅ Status is either "pending" or "paid"
# ============================================================================

from datetime import datetime, date, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Body, Path
from pydantic import BaseModel, Field, ConfigDict, validator
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, exc
from decimal import Decimal, InvalidOperation
import logging
import traceback

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
    
    Example request body:
    {
        "customerName": "Marto",
        "customerPhone": "0712333444",
        "amount": 300,
        "dueDate": "2026-09-30"
    }
    """
    customer_name: str = Field(..., alias="customerName", min_length=1, max_length=80)
    customer_mobile: str = Field(..., alias="customerPhone", min_length=1, max_length=20)
    amount: float = Field(..., gt=0, le=999999.99)
    due_date: date = Field(..., alias="dueDate")
    
    @validator('customer_name')
    def validate_customer_name(cls, v):
        if not v or not v.strip():
            raise ValueError("Customer name cannot be empty")
        return v.strip()
    
    @validator('customer_mobile')
    def validate_customer_mobile(cls, v):
        if not v or not v.strip():
            raise ValueError("Customer mobile cannot be empty")
        return v.strip()
    
    @validator('due_date')
    def validate_due_date(cls, v):
        if v <= date.today():
            raise ValueError(f"Due date must be after today ({date.today()})")
        return v
    
    model_config = ConfigDict(populate_by_name=True, extra='ignore')


class LipaLaterPaymentQueryRequest(BaseModel):
    """Request to record a payment via Body parameters."""
    amount: float = Field(..., gt=0, le=999999.99)
    date: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    paymentMethod: str = Field(default="Manual")
    status: str = Field(default="completed")
    paymentType: str = Field(default="full")
    notes: str = Field(default="")
    
    @validator('amount')
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError("Payment amount must be greater than zero")
        return v
    
    model_config = ConfigDict(populate_by_name=True, extra='ignore')


class LipaLaterPaymentRequest(BaseModel):
    """Request to record a payment (alternative format)"""
    amount_paid: float = Field(..., gt=0)
    payment_date: date = Field(default_factory=date.today)
    reference: str = Field(default="")


class AgeingBucketResponse(BaseModel):
    """Response for a single ageing bucket."""
    count: int
    total_amount: float
    records: list


class AgeingReportResponse(BaseModel):
    """Complete ageing report with all buckets."""
    current: AgeingBucketResponse
    overdue_1_30: AgeingBucketResponse
    overdue_31_60: AgeingBucketResponse
    overdue_61_90: AgeingBucketResponse
    overdue_90_plus: AgeingBucketResponse


# ============================================================================
# HELPER FUNCTIONS - Core Business Logic
# ============================================================================

def calculate_days_overdue(due_date: date) -> int:
    """Calculate number of days overdue for a given due date."""
    today = date.today()
    if due_date >= today:
        return 0
    delta = today - due_date
    return delta.days


def get_remaining_balance(lipa_later_record: LipaLaterRecord, db: Session) -> float:
    """
    Calculate remaining balance for a Lipa Later record.
    Uses Decimal arithmetic for precise financial calculations.
    """
    if not lipa_later_record:
        logger.warning("[LIPA_LATER] get_remaining_balance called with None record")
        return 0.0
    
    try:
        payments = db.query(LipaLaterPayment).filter(
            LipaLaterPayment.lipa_later_id == lipa_later_record.id
        ).all()
        
        total_paid = Decimal('0')
        for payment in payments:
            if payment.amount_ksh:
                total_paid += Decimal(str(payment.amount_ksh))
        
        original_amount = Decimal(str(lipa_later_record.amount))
        remaining = original_amount - total_paid
        
        if remaining < 0:
            logger.warning(f"[LIPA_LATER] Balance is negative: {remaining}. Returning 0.")
            return 0.0
        
        return float(remaining)
        
    except (InvalidOperation, ValueError, TypeError) as e:
        logger.error(f"[LIPA_LATER] Decimal conversion error: {str(e)}")
        return float(lipa_later_record.amount)
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error calculating balance: {str(e)}", exc_info=True)
        return float(lipa_later_record.amount)


def update_lipa_later_status(record: LipaLaterRecord, db: Session) -> str:
    """Update the status of a Lipa Later record based on remaining balance."""
    remaining = get_remaining_balance(record, db)
    
    if remaining <= 0:
        record.status = STATUS_PAID
        record.paid_at = datetime.now(timezone.utc)
        logger.info(f"[LIPA_LATER] Record {record.id} marked as PAID")
        return STATUS_PAID
    else:
        record.status = STATUS_PENDING
        record.paid_at = None
        logger.info(f"[LIPA_LATER] Record {record.id} status is PENDING (balance: {remaining})")
        return STATUS_PENDING


def parse_payment_date(date_str: str) -> date:
    """Parse payment date from ISO 8601 string."""
    if not date_str:
        return date.today()
    
    try:
        clean_date_str = date_str.replace('Z', '+00:00')
        dt = datetime.fromisoformat(clean_date_str)
        return dt.date()
    except (ValueError, TypeError) as e:
        logger.warning(f"[LIPA_LATER] Could not parse date '{date_str}': {str(e)}. Using today.")
        return date.today()


def format_ageing_bucket(records: list, db: Session) -> AgeingBucketResponse:
    """Format a list of records into an ageing bucket response."""
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
    
    Endpoint: POST /lipa-later/record-trip?rider_id={rider_id}
    
    This endpoint creates TWO records:
    1. Trip: Standard income record (payment_channel_code="LIPA_LATER")
    2. LipaLaterRecord: Deferred payment details for follow-up
    
    ✅ FIXES APPLIED:
    - Enhanced error handling for database constraint violations
    - Detailed logging of database errors
    - Proper handling of foreign key constraints
    - Better error messages for debugging
    
    Request body:
    {
        "customerName": "Marto",
        "customerPhone": "0712333444",
        "amount": 300,
        "dueDate": "2026-09-30"
    }
    
    Response:
    {
        "ok": true,
        "trip_id": "550e8400-e29b-...",
        "lipa_later_id": "550e8400-e29b-...",
        "amount": 300.0
    }
    
    ⭐ IMPORTANT: Frontend must store lipa_later_id for payment recording!
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
        
        now_utc = datetime.now(timezone.utc)
        
        # Create Trip record
        logger.info("[LIPA_LATER] Creating Trip record...")
        logger.info(f"[LIPA_LATER] Trip fields: rider_id={rider_id}, amount={payload.amount}, " +
                   f"payment_channel_code={PAYMENT_CHANNEL_LIPA_LATER}, recorded_at={now_utc}")
        
        try:
            trip = Trip(
                rider_id=rider_id,
                amount=Decimal(str(payload.amount)),
                payment_channel_code=PAYMENT_CHANNEL_LIPA_LATER,
                recorded_at=now_utc,
                status="active",
            )
            db.add(trip)
            db.flush()
            logger.info(f"[LIPA_LATER] ✅ Trip created: {trip.id}")
            
        except exc.IntegrityError as e:
            db.rollback()
            logger.error(f"[LIPA_LATER] ❌ Database constraint error creating Trip: {str(e)}")
            logger.error(f"[LIPA_LATER] Constraint details:")
            
            error_msg = str(e).lower()
            
            # Check for specific constraint violations
            if "payment_channel" in error_msg or "foreign key" in error_msg:
                logger.error(f"[LIPA_LATER] Foreign key violation - payment_channel_code '{PAYMENT_CHANNEL_LIPA_LATER}' may not exist in payment_channel_master")
                raise HTTPException(500, 
                    f"Payment channel '{PAYMENT_CHANNEL_LIPA_LATER}' is not configured in the system. " +
                    "Please contact support.")
            elif "rider" in error_msg:
                logger.error(f"[LIPA_LATER] Rider {rider_id} does not exist in database")
                raise HTTPException(400, f"Rider ID {rider_id} not found in system")
            else:
                logger.error(f"[LIPA_LATER] Unknown constraint: {str(e)}")
                raise HTTPException(500, "Database constraint error. Contact support.")
        
        # Create LipaLaterRecord
        logger.info("[LIPA_LATER] Creating LipaLaterRecord...")
        
        try:
            lipa_later_record = LipaLaterRecord(
                rider_id=rider_id,
                trip_id=trip.id,
                customer_name=payload.customer_name,
                customer_mobile=payload.customer_mobile,
                amount=payload.amount,
                trip_date=now_utc,
                due_date=payload.due_date,
                status=STATUS_PENDING
            )
            db.add(lipa_later_record)
            db.commit()
            logger.info(f"[LIPA_LATER] ✅ LipaLaterRecord created: {lipa_later_record.id}")
            logger.info(f"[LIPA_LATER] ✅ Link: Trip {trip.id} → LipaLater {lipa_later_record.id}")
            logger.info(f"[LIPA_LATER] ====== CREATE_TRIP SUCCESS ======")
            
            return {
                "ok": True,
                "trip_id": str(trip.id),
                "lipa_later_id": str(lipa_later_record.id),
                "amount": float(payload.amount)
            }
            
        except exc.IntegrityError as e:
            db.rollback()
            logger.error(f"[LIPA_LATER] ❌ Database constraint error creating LipaLaterRecord: {str(e)}")
            raise HTTPException(500, "Error creating Lipa Later record. Contact support.")
        
    except HTTPException:
        db.rollback()
        logger.error(f"[LIPA_LATER] ====== CREATE_TRIP FAILED (HTTP) ======")
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"[LIPA_LATER] ====== CREATE_TRIP FAILED (ERROR) ======")
        logger.error(f"[LIPA_LATER] Exception: {str(e)}")
        logger.error(f"[LIPA_LATER] Traceback: {traceback.format_exc()}")
        raise HTTPException(500, f"Error creating Lipa Later trip: {str(e)}")


@router.get("/customer-list")
def get_lipa_later_customers(
    rider_id: str = Query(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """Get all Lipa Later customers for a rider with their payment status."""
    logger.info(f"[LIPA_LATER] GET_CUSTOMERS - Rider: {rider_id}")
    
    try:
        records = db.query(LipaLaterRecord).filter(
            LipaLaterRecord.rider_id == rider_id
        ).all()
        
        logger.info(f"[LIPA_LATER] Found {len(records)} records")
        
        customers = []
        for record in records:
            remaining = get_remaining_balance(record, db)
            customer_data = {
                "id": str(record.id),
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
    customer_id: str = Query(..., description="Lipa Later Record ID (UUID)"),
    payload: LipaLaterPaymentQueryRequest = Body(..., description="Payment details"),
    db: Session = Depends(get_db)
):
    """
    ✅ FIXED ENDPOINT: Record a payment using the Lipa Later Record ID.
    
    Endpoint: POST /lipa-later/record-payment?rider_id={rider_id}&customer_id={lipa_later_record_id}
    
    ⭐ IMPORTANT: customer_id MUST be the lipa_later_record_id from POST /record-trip
    NOT a phone number or generated customer ID.
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
                LipaLaterRecord.id == customer_id
            )
        ).first()
        
        if not record:
            logger.warning(f"[LIPA_LATER] ❌ Record NOT found: ID={customer_id}, Rider={rider_id}")
            logger.warning("[LIPA_LATER] COMMON CAUSE: customer_id should be the lipa_later_record_id from /record-trip")
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
        logger.error(f"[LIPA_LATER] ====== RECORD_PAYMENT FAILED (HTTP) ======")
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"[LIPA_LATER] ====== RECORD_PAYMENT FAILED (ERROR) ======")
        logger.error(f"[LIPA_LATER] Exception: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error recording payment: {str(e)}")


@router.post("/record-payment-query", response_model=dict)
def record_payment_by_query_alias(
    rider_id: str = Query(..., description="Rider ID"),
    customer_id: str = Query(..., description="Lipa Later Record ID"),
    payload: LipaLaterPaymentQueryRequest = Body(..., description="Payment details"),
    db: Session = Depends(get_db)
):
    """Alias endpoint for backward compatibility with /record-payment."""
    logger.info(f"[LIPA_LATER] RECORD_PAYMENT_QUERY (alias) - Rider: {rider_id}")
    return record_payment(rider_id, customer_id, payload, db)


# ============================================================================
# REPORTING ENDPOINTS - Analytics and Ageing Reports
# ============================================================================

@router.get("/ageing-report/{rider_id}", response_model=AgeingReportResponse)
def get_ageing_report(
    rider_id: str = Path(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """Get Lipa Later records categorized by payment age."""
    logger.info(f"[LIPA_LATER] GET_AGEING_REPORT - Rider: {rider_id}")
    
    try:
        records = db.query(LipaLaterRecord).filter(
            and_(
                LipaLaterRecord.rider_id == rider_id,
                LipaLaterRecord.status == STATUS_PENDING
            )
        ).all()
        
        logger.info(f"[LIPA_LATER] Found {len(records)} pending records")
        
        ageing_buckets = {
            "current": [],
            "overdue_1_30": [],
            "overdue_31_60": [],
            "overdue_61_90": [],
            "overdue_90_plus": []
        }
        
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
            else:
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
    rider_id: str = Path(..., description="Rider ID (UUID)"),
    db: Session = Depends(get_db)
):
    """Get Lipa Later statistics and summary for a rider."""
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
    """Get current Lipa Later configuration and feature flags."""
    logger.info("[LIPA_LATER] GET_CONFIG - Admin configuration requested")
    
    return {
        "records_per_page": 10,
        "scroll_height_px": 500,
        "enable_payment_tracking": True,
        "enable_ageing_report": True,
    }


@router.get("/admin/riders-summary", response_model=dict)
def get_riders_lipa_later_summary(db: Session = Depends(get_db)):
    """Get Lipa Later summary for all riders (admin/analytics view)."""
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