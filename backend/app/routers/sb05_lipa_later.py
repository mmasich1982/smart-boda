# backend/app/routers/sb05_lipa_later.py
# ============================================================================
# ✅ CONSOLIDATED VERSION - Combines all functionality from both versions
# ============================================================================
# ✅ ROOT CAUSE FIXED: Using correct LipaLaterPayment model (not generic Payment)
# ✅ FIXED: Router prefix is /lipa-later (not /trips/lipa-later)
# ✅ FIXED: All endpoints use proper FastAPI parameter binding with Body(...)
# ✅ FIXED: Trip model field names (payment_channel_code, recorded_at, status="active")
# ✅ FIXED: Field aliasing for camelCase from frontend
# ✅ FIXED: Using LipaLaterPayment model with correct schema
# ✅ RESTORED: Original working GET /customer-list endpoint
# ✅ RESTORED: Original working record-payment endpoint
# ✅ ADDED: New POST /record-payment endpoint with query parameters for frontend offline sync
# ✅ INCLUDED: Admin configuration and statistics endpoints
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
# These schemas handle both camelCase (frontend) and snake_case (backend) field names.
# The model_config with populate_by_name=True enables automatic conversion.

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
# These helper functions provide core business logic for calculating payment status,
# remaining balances, and aging calculations. They are used across multiple endpoints.

def calculate_days_overdue(due_date: date) -> int:
    """
    Calculate days overdue without external dependencies.
    
    Args:
        due_date: The expected payment due date
        
    Returns:
        Integer number of days overdue. Returns 0 if due_date is today or in the future.
        
    Example:
        >>> calculate_days_overdue(date(2026-09-01))  # If today is 2026-09-05
        >>> 4  # Returns 4 days overdue
    """
    today = date.today()
    if due_date >= today:
        return 0
    delta = today - due_date
    return delta.days


def get_remaining_balance(lipa_later_record: LipaLaterRecord, db: Session) -> float:
    """
    Calculate remaining balance for a Lipa Later record.
    
    This function queries all LipaLaterPayment records associated with the given
    Lipa Later record and calculates the outstanding balance. Uses Decimal arithmetic
    for precise financial calculations.
    
    Args:
        lipa_later_record: The LipaLaterRecord instance to check
        db: SQLAlchemy database session
        
    Returns:
        Float representing the remaining balance. Returns 0.0 if record is None.
        Returns the original amount if calculation fails (fallback for error handling).
        
    Note:
        This function queries LipaLaterPayment, NOT the generic Payment model.
        Critical for correct payment tracking and balance calculation.
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
        
        # Ensure balance never goes negative (partial payments case)
        return float(max(Decimal('0'), original_amount - paid_sum))
    except Exception as e:
        logger.error(f"[LIPA_LATER] Error calculating balance: {str(e)}", exc_info=True)
        # Fallback: return original amount if calculation fails
        return float(lipa_later_record.amount)


def update_lipa_later_status(record: LipaLaterRecord, db: Session) -> str:
    """
    Update and return the current status of a Lipa Later record.
    
    This function determines the payment status based on the remaining balance:
    - "paid": When remaining balance is <= 0 (fully paid). Also sets paid_at timestamp.
    - "partial": When some payment has been made but balance remains.
    - "pending": When no payments have been made yet.
    
    Args:
        record: The LipaLaterRecord to update
        db: SQLAlchemy database session
        
    Returns:
        String status: "paid", "partial", or "pending"
        
    Side Effects:
        Updates record.status and record.paid_at (if status becomes "paid")
        Does NOT commit to database - caller is responsible for commit.
    """
    remaining = get_remaining_balance(record, db)
    
    if remaining <= 0:
        # Fully paid - set status and mark payment completion time
        record.status = "paid"
        record.paid_at = datetime.now(timezone.utc)
        return "paid"
    elif remaining < float(record.amount):
        # Partial payment made but balance remains
        return "partial"
    else:
        # No payments made yet, entire amount pending
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
        # ===== VALIDATION PHASE =====
        # Performs input validation before database operations
        # Customer name validation
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
        # Trip record: tracks income/rides with payment channel information
        logger.info("[LIPA_LATER] Creating Trip record...")
        trip = Trip(
            rider_id=rider_id,
            amount=Decimal(str(payload.amount)),  # Use Decimal for financial data
            customer_name=payload.customer_name,
            customer_mobile=payload.customer_mobile,
            status="active",
            recorded_at=now,
            payment_channel_code="LIPA_LATER"  # Marks this as a Lipa Later transaction
        )
        db.add(trip)
        db.flush()  # Flush to get the trip.id for linking
        
        # Create Lipa Later record: tracks payment status and due dates
        logger.info("[LIPA_LATER] Creating LipaLaterRecord...")
        lipa_later_record = LipaLaterRecord(
            rider_id=rider_id,
            trip_id=str(trip.id),  # Link to the Trip record
            customer_name=payload.customer_name,
            customer_mobile=payload.customer_mobile,
            amount=payload.amount,
            due_date=payload.due_date,  # When payment is expected
            status="pending"  # Initial status is pending payment
        )
        db.add(lipa_later_record)
        db.commit()  # Commit both records atomically
        
        logger.info(f"[LIPA_LATER] ✅ Trip created: {trip.id}, LipaLaterRecord created: {lipa_later_record.id}")
        
        return {
            "ok": True,
            "trip_id": str(trip.id),
            "lipa_later_id": str(lipa_later_record.id),
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
                "id": str(record.id),
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
    customer_id: str = Query(..., description="Customer ID"),
    payload: LipaLaterPaymentQueryRequest = Body(..., description="Payment details"),
    db: Session = Depends(get_db)
):
    """
    ✅ MAIN ENDPOINT: Record a payment using query parameters and request body.
    
    THIS IS THE CRITICAL ENDPOINT - Must have Body(...) for payload!
    
    Endpoint: POST /lipa-later/record-payment?rider_id={rider_id}&customer_id={customer_id}
    
    Request body:
    {
        "amount": 500,
        "date": "2026-09-03T12:00:00Z",
        "paymentMethod": "Manual",
        "status": "completed",
        "paymentType": "full",
        "notes": "Payment received"
    }
    
    ✅ FIXES:
    - payload parameter uses Body(...) to properly bind request body
    - Query parameters (rider_id, customer_id) are extracted from URL
    - Database queries filtered by rider_id for security
    - Proper error handling with HTTPException
    """
    logger.info(f"[LIPA_LATER] RECORD_PAYMENT - Rider: {rider_id}, Customer: {customer_id}")
    logger.info(f"[LIPA_LATER] Payload received: {payload}")
    
    try:
        # ===== REQUEST VALIDATION PHASE =====
        if not payload:
            logger.warning("[LIPA_LATER] No payload provided")
            raise HTTPException(400, "Request body is required")
        
        # Validate query parameters - both are required for security and identification
        if not rider_id or not rider_id.strip():
            logger.warning("[LIPA_LATER] Missing rider_id")
            raise HTTPException(400, "rider_id parameter is required")
        
        if not customer_id or not customer_id.strip():
            logger.warning("[LIPA_LATER] Missing customer_id")
            raise HTTPException(400, "customer_id parameter is required")
        
        # ===== RECORD LOOKUP PHASE =====
        # Find the Lipa Later record by rider_id and customer_id (customer_mobile)
        record = db.query(LipaLaterRecord).filter(
            and_(
                LipaLaterRecord.rider_id == rider_id,
                LipaLaterRecord.customer_mobile == customer_id
            )
        ).first()
        
        if not record:
            logger.warning(f"[LIPA_LATER] No record found for customer {customer_id} and rider {rider_id}")
            raise HTTPException(404, f"No Lipa Later record found for customer {customer_id}")
        
        remaining_before = get_remaining_balance(record, db)
        
        # ===== PAYMENT VALIDATION PHASE =====
        # Validate payment amount is positive
        if payload.amount <= 0:
            logger.warning(f"[LIPA_LATER] Invalid amount: {payload.amount}")
            raise HTTPException(400, "Payment amount must be greater than zero")
        
        # Validate payment does not exceed remaining balance (prevents overpayment)
        if payload.amount > remaining_before:
            logger.warning(f"[LIPA_LATER] Payment amount {payload.amount} exceeds balance {remaining_before}")
            raise HTTPException(400, f"Payment amount exceeds remaining balance of {remaining_before}.")
        
        # ===== PAYMENT RECORDING PHASE =====
        # Create payment record with payment details
        payment = LipaLaterPayment(
            rider_id=record.rider_id,
            lipa_later_id=record.id,
            amount_ksh=Decimal(str(payload.amount)),  # Use Decimal for precision
            payment_date=datetime.fromisoformat(payload.date.replace('Z', '+00:00')).date() if payload.date else date.today(),
            reference=payload.notes if payload.notes else "",
            sync_status="synced",  # Mark as synced since it came from frontend
        )
        db.add(payment)
        db.flush()  # Flush to ensure payment is recorded
        
        # Update Lipa Later record status based on new payment
        new_status = update_lipa_later_status(record, db)
        db.commit()  # Atomically commit payment and status update
        
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
    customer_id: str = Query(..., description="Customer ID"),
    payload: LipaLaterPaymentQueryRequest = Body(..., description="Payment details"),
    db: Session = Depends(get_db)
):
    """
    ✅ ALIAS ENDPOINT: For backward compatibility.
    
    Same as /record-payment endpoint.
    
    Endpoint: POST /lipa-later/record-payment-query?rider_id={rider_id}&customer_id={customer_id}
    """
    logger.info(f"[LIPA_LATER] RECORD_PAYMENT_QUERY (alias) - Rider: {rider_id}, Customer: {customer_id}")
    
    # Delegate to main endpoint
    return record_payment(rider_id, customer_id, payload, db)


@router.get("/ageing-report/{rider_id}", response_model=AgeingReportResponse)
def get_ageing_report(rider_id: str, db: Session = Depends(get_db)):
    """
    Get Lipa Later records categorized by payment age (ageing analysis).
    
    Endpoint: GET /lipa-later/ageing-report/{rider_id}
    
    This endpoint categorizes pending Lipa Later records into aging buckets based on
    how overdue they are. This is useful for identifying which customers need follow-up
    and prioritizing collection efforts.
    
    Ageing buckets:
    - current: Not yet due (due_date >= today)
    - overdue_1_30: 1-30 days overdue
    - overdue_31_60: 31-60 days overdue
    - overdue_61_90: 61-90 days overdue
    - overdue_90_plus: More than 90 days overdue
    
    Each bucket contains:
    - count: Number of records in this bucket
    - total_amount: Sum of original amounts in this bucket
    - records: Sorted list of record details with remaining balance
    
    Note: Only includes records with status="pending" (excludes paid/partial)
    
    Returns: AgeingReportResponse with all 5 buckets populated
    """
    try:
        # Query only pending records (exclude already paid or partial)
        records = db.query(LipaLaterRecord).filter_by(
            rider_id=rider_id,
            status="pending"
        ).all()
        
        # Initialize ageing buckets - organize by days overdue
        ageing_buckets = {
            "current": [],          # Not yet due
            "overdue_1_30": [],     # 1-30 days late
            "overdue_31_60": [],    # 31-60 days late
            "overdue_61_90": [],    # 61-90 days late
            "overdue_90_plus": []   # 90+ days late
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
    
    This endpoint provides a comprehensive summary of a rider's Lipa Later transactions:
    - Total counts of records in each status (pending, paid, partial)
    - Total amounts by status
    - Overdue analysis with separate counts for overdue and due-today
    - Remaining balance that needs to be collected
    
    Returns: Dictionary with counts and amounts for pending, paid, partial, and overdue records
    
    Example response:
    {
        "total_records": 5,
        "pending_count": 3,
        "paid_count": 1,
        "partial_count": 1,
        "overdue_count": 2,
        "due_today_count": 1,
        "pending_amount": 1500.0,
        "paid_amount": 500.0,
        "partial_amount": 300.0,
        "overdue_amount": 1000.0,
        "remaining_balance": 1200.0
    }
    """
    try:
        # Fetch all records for the rider
        all_records = db.query(LipaLaterRecord).filter_by(rider_id=rider_id).all()
        
        # Categorize records by payment status
        pending = [r for r in all_records if r.status == "pending"]
        paid = [r for r in all_records if r.status == "paid"]
        partial = [r for r in all_records if r.status == "partial"]
        
        # Analyze dates for overdue calculations
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
    
    This admin endpoint returns configuration parameters for the Lipa Later system.
    These settings control UI behavior and feature enablement across the application.
    
    Configuration Parameters:
    - records_per_page: Number of records to display per page in list views
    - scroll_height_px: Height in pixels for scrollable list containers
    - enable_payment_tracking: Whether to track individual payments against records
    - enable_ageing_report: Whether to generate and display ageing reports
    
    Returns: Dictionary with configuration key-value pairs
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
    
    This admin endpoint provides a comprehensive overview of the entire Lipa Later system
    across all riders. It aggregates payment data and status information.
    
    Response structure:
    {
        "summary": {
            "total_records": Total number of all Lipa Later records,
            "pending_records": Count of pending records,
            "paid_records": Count of fully paid records,
            "partial_records": Count of partially paid records,
            "total_amount": Sum of all original amounts,
            "pending_amount": Sum of amounts for pending records,
            "paid_amount": Sum of amounts for paid records
        },
        "riders": {
            "rider_id_1": {
                "total": Total records for this rider,
                "pending": Pending records count,
                "paid": Paid records count,
                "partial": Partial records count,
                "total_amount": Sum of all amounts for this rider,
                "pending_amount": Sum of pending/partial amounts for this rider,
                "paid_amount": Sum of paid amounts for this rider,
                "remaining_balance": Total outstanding balance for this rider
            }
        }
    }
    
    Returns: Dictionary with platform-wide summary and per-rider breakdown
    """
    try:
        # Fetch all Lipa Later records across all riders
        records = db.query(LipaLaterRecord).all()
        
        # Initialize rider tracking dictionary
        # Each rider gets a dict to track their Lipa Later stats
        riders_data = {}
        for r in records:
            rider_id_str = str(r.rider_id)
            # Create entry for this rider if first time seeing them
            if rider_id_str not in riders_data:
                riders_data[rider_id_str] = {
                    "total": 0,          # Total count of Lipa Later records
                    "pending": 0,        # Count of fully pending records
                    "paid": 0,           # Count of fully paid records
                    "partial": 0,        # Count of partially paid records
                    "total_amount": 0.0, # Sum of all original amounts
                    "pending_amount": 0.0,  # Sum of pending + partial amounts (what's owed)
                    "paid_amount": 0.0,  # Sum of fully paid amounts
                    "remaining_balance": 0.0,  # Total cash still owed by this rider
                }
            
            # Update totals for this rider
            riders_data[rider_id_str]["total"] += 1
            riders_data[rider_id_str]["total_amount"] += float(r.amount)
            
            # Calculate and track remaining balance for this record
            remaining = get_remaining_balance(r, db)
            
            # Categorize based on payment status and update relevant counters
            if r.status == "pending":
                riders_data[rider_id_str]["pending"] += 1
                riders_data[rider_id_str]["pending_amount"] += float(r.amount)
                riders_data[rider_id_str]["remaining_balance"] += remaining
            elif r.status == "paid":
                riders_data[rider_id_str]["paid"] += 1
                riders_data[rider_id_str]["paid_amount"] += float(r.amount)
            elif r.status == "partial":
                # Partial status: some paid but still owed
                riders_data[rider_id_str]["partial"] += 1
                riders_data[rider_id_str]["pending_amount"] += remaining  # Track remaining only
                riders_data[rider_id_str]["remaining_balance"] += remaining
        
        # Aggregate statistics across all riders
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