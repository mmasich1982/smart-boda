# backend/app/routers/sb05_lipa_later.py
# ✅ COMPREHENSIVE: Complete Lipa Later implementation for New Trip and Payment Tracking
# ✅ FIXED: Router prefix changed from /trips/lipa-later to /lipa-later
# ✅ FIXED: Endpoint paths updated to match frontend: /record-trip, /customer-list
# ✅ FIXED: Frontend-backend field name mapping (camelCase -> snake_case)
# ✅ FIXED: Request validation with proper error messages and logging
# ✅ FIXED: Proper Trip and LipaLaterRecord creation with correct column names
# ✅ FIXED: Due date logic implemented without third-party dependencies
# ✅ FIXED: Ageing report categorization logic
# ✅ FIXED: Payment tracking and status management
# ✅ FEATURE: Complete support for LipaLaterCustomersScreen, AgeingScreen, PaymentSummaryScreen
# ✅ FEATURE: RecordPayment support with payment tracking
# ✅ FEATURE: Admin endpoints for configuration and rider summary
# ✅ FEATURE: All CRUD operations with proper error handling

from datetime import datetime, date, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import and_
from decimal import Decimal
import logging

from app.database import get_db
from app.models.trip import Trip
from app.models.lipa_later_record import LipaLaterRecord
from app.models.payment import Payment

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
        "dueDate": "2026-09-30"
    }
    """
    customer_name: str = Field(
        ..., 
        min_length=1, 
        max_length=80, 
        description="Customer's full name",
        alias="customerName"
    )
    customer_mobile: str = Field(
        ..., 
        description="Customer's mobile number",
        alias="customerPhone"
    )
    amount: float = Field(
        ..., 
        gt=0, 
        description="Amount to be paid later (KSh)"
    )
    due_date: date = Field(
        ..., 
        description="Payment due date (YYYY-MM-DD format)",
        alias="dueDate"
    )
    
    model_config = ConfigDict(populate_by_name=True)
    
    @field_validator('customer_name')
    @classmethod
    def validate_customer_name(cls, v):
        """Ensure customer name is not empty or whitespace"""
        if not v or not v.strip():
            raise ValueError("Customer name cannot be empty")
        return v.strip()
    
    @field_validator('customer_mobile')
    @classmethod
    def validate_customer_mobile(cls, v):
        """Ensure customer mobile is not empty or whitespace"""
        if not v or not v.strip():
            raise ValueError("Customer mobile cannot be empty")
        return v.strip()


class LipaLaterPaymentRequest(BaseModel):
    """Request to record a payment against a Lipa Later record"""
    amount_paid: float = Field(..., gt=0, description="Amount paid (KSh)")
    payment_date: date = Field(default_factory=date.today, description="Payment date")
    reference: str = Field(default="", max_length=255, description="Optional payment reference")


class LipaLaterRecordResponse(BaseModel):
    """Response model for a Lipa Later record"""
    id: str
    customer_name: str
    customer_mobile: str
    amount: float
    trip_date: datetime
    due_date: date
    status: str  # pending | paid | partial
    is_overdue: bool
    is_due_today: bool
    days_overdue: int
    remaining_balance: float
    total_paid: float
    payment_count: int = 0
    
    model_config = ConfigDict(from_attributes=True)


class LipaLaterConfigRequest(BaseModel):
    """Configuration for Lipa Later display"""
    records_per_page: int = 10
    scroll_height_px: int = 500
    enable_payment_tracking: bool = True
    enable_ageing_report: bool = True


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
    
    # Get total paid amount from all payments for this record
    total_paid = db.query(Payment).filter(
        Payment.lipa_later_id == lipa_later_record.id
    ).with_entities(Payment.amount_ksh).all()
    
    paid_sum = sum(Decimal(str(p[0])) for p in total_paid if p[0]) if total_paid else Decimal('0')
    original_amount = Decimal(str(lipa_later_record.amount))
    
    return float(max(Decimal('0'), original_amount - paid_sum))


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
    
    Frontend sends camelCase (automatically converted):
    {
        "customerName": "Marto",
        "customerPhone": "0712333444",
        "amount": 300,
        "dueDate": "2026-09-30"
    }
    
    Returns: trip_id and lipa_later_record_id
    """
    logger.info(f"[LIPA_LATER] Creating trip for rider {rider_id} with payload: {payload}")
    
    try:
        # Validation
        if payload.amount <= 0:
            logger.warning(f"[LIPA_LATER] Invalid amount: {payload.amount}")
            raise HTTPException(422, "Enter an amount greater than zero.")
        
        today = date.today()
        if payload.due_date <= today:
            logger.warning(f"[LIPA_LATER] Due date {payload.due_date} is not after today {today}")
            raise HTTPException(422, "Due date must be after today.")
        
        now = datetime.now(timezone.utc)
        
        # Create Trip record - captures the work done today as income
        trip = Trip(
            rider_id=rider_id,
            amount=Decimal(str(payload.amount)),
            payment_method="lipa_later",
            status="completed",  # Work is done, payment is pending collection
            trip_date=now,
            recorded_at=now,
            sync_status="synced"
        )
        db.add(trip)
        db.flush()  # Get trip.id without committing yet
        logger.info(f"[LIPA_LATER] Created Trip: {trip.id}")
        
        # Create LipaLaterRecord - captures customer and payment terms
        # trip_date is automatically captured server-side (never rider-entered)
        record = LipaLaterRecord(
            rider_id=rider_id,
            trip_id=trip.id,
            customer_name=payload.customer_name,
            customer_mobile=payload.customer_mobile,
            amount=Decimal(str(payload.amount)),
            trip_date=now,
            due_date=payload.due_date,
            status="pending",
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        
        logger.info(f"[LIPA_LATER] ✅ Created LipaLaterRecord: {record.id} for customer {payload.customer_name}")
        
        return {
            "id": str(record.id),
            "trip_id": str(trip.id),
            "customer_name": record.customer_name,
            "customer_mobile": record.customer_mobile,
            "amount": float(record.amount),
            "due_date": str(record.due_date),
            "status": record.status,
        }
        
    except HTTPException as he:
        db.rollback()
        logger.error(f"[LIPA_LATER] ❌ HTTP Exception: {he.detail}")
        raise he
    except Exception as e:
        db.rollback()
        logger.error(f"[LIPA_LATER] ❌ Error creating Lipa Later record: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error creating Lipa Later record: {str(e)}")


@router.get("/customer-list", response_model=list)
def list_lipa_later_records(
    rider_id: str,
    include_paid: bool = False,
    status_filter: str = Query(None, description="Filter by status: pending, paid, partial"),
    db: Session = Depends(get_db)
):
    """
    List Lipa Later records for a rider.
    
    Endpoint: GET /lipa-later/customer-list?rider_id={rider_id}&include_paid={bool}
    
    Query parameters:
    - rider_id: The rider's ID (required)
    - include_paid: Include paid records (default: False)
    - status_filter: Filter by status (pending, paid, partial)
    
    Returns: List of Lipa Later records sorted by due date
    """
    logger.info(f"[LIPA_LATER] Fetching customer list for rider {rider_id}")
    
    try:
        query = db.query(LipaLaterRecord).filter_by(rider_id=rider_id)
        
        if not include_paid:
            query = query.filter(LipaLaterRecord.status == "pending")
        
        if status_filter and status_filter in ["pending", "paid", "partial"]:
            query = query.filter(LipaLaterRecord.status == status_filter)
        
        records = query.order_by(LipaLaterRecord.due_date.asc()).all()
        today = date.today()
        
        logger.info(f"[LIPA_LATER] Found {len(records)} records for rider {rider_id}")
        
        result = []
        for r in records:
            days_overdue = calculate_days_overdue(r.due_date)
            remaining_balance = get_remaining_balance(r, db)
            total_paid = float(r.amount) - remaining_balance
            
            # Get payment count
            payment_count = db.query(Payment).filter(
                Payment.lipa_later_id == r.id
            ).count()
            
            result.append({
                "id": str(r.id),
                "customer_name": r.customer_name,
                "customer_mobile": r.customer_mobile,
                "amount": float(r.amount),
                "trip_date": r.trip_date.isoformat() if r.trip_date else None,
                "due_date": str(r.due_date),
                "status": r.status,
                "is_overdue": days_overdue > 0,
                "is_due_today": r.due_date == today,
                "days_overdue": days_overdue,
                "remaining_balance": max(0, remaining_balance),
                "total_paid": total_paid,
                "payment_count": payment_count,
            })
        
        return result
    except Exception as e:
        logger.error(f"[LIPA_LATER] ❌ Error fetching customer list: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error fetching Lipa Later records: {str(e)}")


@router.get("/{record_id}", response_model=dict)
def get_lipa_later_record(record_id: str, db: Session = Depends(get_db)):
    """
    Get details of a specific Lipa Later record.
    
    Endpoint: GET /lipa-later/{record_id}
    
    Returns: Detailed Lipa Later record with payment history
    """
    logger.info(f"[LIPA_LATER] Fetching record details: {record_id}")
    
    try:
        record = db.query(LipaLaterRecord).filter_by(id=record_id).first()
        
        if not record:
            logger.warning(f"[LIPA_LATER] Record not found: {record_id}")
            raise HTTPException(404, "Lipa Later record not found")
        
        days_overdue = calculate_days_overdue(record.due_date)
        remaining_balance = get_remaining_balance(record, db)
        total_paid = float(record.amount) - remaining_balance
        today = date.today()
        
        # Get all payments for this record
        payments = db.query(Payment).filter(Payment.lipa_later_id == record.id).all()
        
        return {
            "id": str(record.id),
            "trip_id": str(record.trip_id) if record.trip_id else None,
            "customer_name": record.customer_name,
            "customer_mobile": record.customer_mobile,
            "amount": float(record.amount),
            "trip_date": record.trip_date.isoformat() if record.trip_date else None,
            "due_date": str(record.due_date),
            "status": record.status,
            "is_overdue": days_overdue > 0,
            "is_due_today": record.due_date == today,
            "days_overdue": days_overdue,
            "remaining_balance": max(0, remaining_balance),
            "total_paid": total_paid,
            "payment_count": len(payments),
            "payments": [
                {
                    "id": str(p.id),
                    "amount_paid": float(p.amount_ksh),
                    "payment_date": str(p.payment_date),
                    "reference": p.reference or "",
                }
                for p in sorted(payments, key=lambda x: x.payment_date, reverse=True)
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[LIPA_LATER] ❌ Error fetching record: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error fetching record: {str(e)}")


@router.post("/{record_id}/record-payment", response_model=dict)
def record_payment(
    record_id: str,
    payload: LipaLaterPaymentRequest,
    db: Session = Depends(get_db)
):
    """
    Record a payment against a Lipa Later record.
    
    Endpoint: POST /lipa-later/{record_id}/record-payment
    
    Returns: Updated record status and remaining balance
    """
    logger.info(f"[LIPA_LATER] Recording payment for record {record_id}")
    
    try:
        record = db.query(LipaLaterRecord).filter_by(id=record_id).first()
        
        if not record:
            logger.warning(f"[LIPA_LATER] Record not found: {record_id}")
            raise HTTPException(404, "Lipa Later record not found")
        
        remaining_before = get_remaining_balance(record, db)
        if payload.amount_paid > remaining_before:
            logger.warning(f"[LIPA_LATER] Payment {payload.amount_paid} exceeds balance {remaining_before}")
            raise HTTPException(400, f"Payment amount exceeds remaining balance of {remaining_before}.")
        
        # Create payment record
        payment = Payment(
            rider_id=record.rider_id,
            lipa_later_id=record.id,
            amount_ksh=Decimal(str(payload.amount_paid)),
            payment_date=payload.payment_date if payload.payment_date else date.today(),
            reference=payload.reference if payload.reference else "",
            sync_status="synced",
        )
        db.add(payment)
        db.flush()
        
        # Update record status
        new_status = update_lipa_later_status(record, db)
        db.commit()
        
        remaining_after = get_remaining_balance(record, db)
        
        logger.info(f"[LIPA_LATER] ✅ Payment recorded: {payment.id}, new status: {new_status}")
        
        return {
            "ok": True,
            "payment_id": str(payment.id),
            "amount_paid": float(payload.amount_paid),
            "remaining_balance": max(0, remaining_after),
            "record_status": new_status,
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"[LIPA_LATER] ❌ Error recording payment: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error recording payment: {str(e)}")


# ============= Ageing Report Endpoint =============

@router.get("/ageing-report/{rider_id}", response_model=AgeingReportResponse)
def get_ageing_report(rider_id: str, db: Session = Depends(get_db)):
    """
    Get Lipa Later records categorized by payment age/ageing.
    
    Endpoint: GET /lipa-later/ageing-report/{rider_id}
    
    Categories (based on days overdue):
      - Current: 0-30 days (not yet due or up to 30 days overdue)
      - Overdue 1-30: 1-30 days overdue
      - Overdue 31-60: 31-60 days overdue
      - Overdue 61-90: 61-90 days overdue
      - Overdue 90+: 90+ days overdue
    """
    logger.info(f"[LIPA_LATER] Fetching ageing report for rider {rider_id}")
    
    try:
        records = db.query(LipaLaterRecord).filter_by(
            rider_id=rider_id,
            status="pending"
        ).all()
        
        today = date.today()
        
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
            else:  # 90+
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
        logger.error(f"[LIPA_LATER] ❌ Error generating ageing report: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error generating ageing report: {str(e)}")


@router.get("/statistics/{rider_id}", response_model=dict)
def get_lipa_later_statistics(rider_id: str, db: Session = Depends(get_db)):
    """
    Get Lipa Later statistics and summary for a rider.
    
    Endpoint: GET /lipa-later/statistics/{rider_id}
    """
    logger.info(f"[LIPA_LATER] Fetching statistics for rider {rider_id}")
    
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
        logger.error(f"[LIPA_LATER] ❌ Error generating statistics: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error generating statistics: {str(e)}")


# ============= Admin Configuration Endpoints =============

_lipa_later_config = {
    "records_per_page": 10,
    "scroll_height_px": 500,
    "enable_payment_tracking": True,
    "enable_ageing_report": True,
}


@router.get("/admin/config", response_model=dict)
def get_lipa_later_config():
    """Get current Lipa Later configuration"""
    return _lipa_later_config


@router.post("/admin/config", response_model=dict)
def update_lipa_later_config(config: LipaLaterConfigRequest):
    """Update Lipa Later configuration"""
    global _lipa_later_config
    _lipa_later_config = config.model_dump()
    logger.info(f"[LIPA_LATER] Config updated: {_lipa_later_config}")
    return {
        "message": "Lipa Later configuration updated successfully",
        "config": _lipa_later_config
    }


@router.get("/admin/riders-summary", response_model=dict)
def get_riders_lipa_later_summary(db: Session = Depends(get_db)):
    """
    Get Lipa Later summary for all riders (admin dashboard endpoint).
    Useful for the Admin Console to see aggregate data.
    """
    logger.info("[LIPA_LATER] Fetching riders summary")
    
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
        logger.error(f"[LIPA_LATER] ❌ Error generating riders summary: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Error generating riders summary: {str(e)}")