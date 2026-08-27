# backend/app/routers/subscriptions_payment.py
# ============================================================================
# PAYMENT SYNC ENDPOINT: Receives payment syncs from mobile app
# CORRECTED: All column names match actual database schema
# ============================================================================

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone, timedelta
from uuid import UUID
import json
import logging

from app.database import get_db
from app.models.payment import Payment
from app.models.rider import Rider
from app.models.subscription import RiderSubscription

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/subscriptions", tags=["payments"])


# ============================================================================
# PAYMENT SYNC ENDPOINT
# ============================================================================

@router.post("/payment")
async def receive_payment_sync(
    request: Request,
    rider_id: str,
    db: Session = Depends(get_db),
    x_sync_id: str = Header(None),
    x_client_timestamp: str = Header(None)
):
    """
    ✅ POST /subscriptions/payment
    
    Receives payment sync from mobile app
    Saves payment to database with idempotency protection
    
    HEADERS (sent by mobile app):
        X-Sync-ID: payment_6fa42197-e13c-4020-9934-c9b4a73cfd8c_1787805185038
        X-Client-Timestamp: 2024-12-20T10:30:00Z
    
    QUERY PARAMS:
        rider_id: 6fa42197-e13c-4020-9934-c9b4a73cfd8c
    
    BODY:
        {
            "id": "payment_xxx",
            "type": "subscription",
            "amount": 500,
            "currency": "KES",
            "status": "Success",
            "channel": "M-Pesa",
            "mpesa_code": "ABC123XYZ",
            "plan": "biweekly",
            "createdAt": "2024-12-20T10:30:00Z"
        }
    """
    
    try:
        # ====================================================================
        # 1. VALIDATE REQUIRED HEADERS & PARAMS
        # ====================================================================
        
        if not rider_id:
            logger.error("❌ Missing rider_id in query params")
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Missing rider_id",
                    "message": "rider_id must be in query params"
                }
            )
        
        if not x_sync_id:
            logger.error("❌ Missing X-Sync-ID header")
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Missing X-Sync-ID",
                    "message": "X-Sync-ID must be in request headers"
                }
            )
        
        logger.info(f"📥 [Payment] Receiving payment sync from mobile app")
        logger.info(f"   Rider ID: {rider_id}")
        logger.info(f"   Sync ID: {x_sync_id}")
        logger.info(f"   Client Timestamp: {x_client_timestamp}")
        
        # ====================================================================
        # 2. PARSE REQUEST BODY
        # ====================================================================
        
        body = await request.json()
        
        payment_id = body.get("id")
        payment_type = body.get("type", "subscription")
        amount = body.get("amount", 0)
        currency = body.get("currency", "KES")
        status = body.get("status", "Success")
        channel = body.get("channel", "M-Pesa")
        mpesa_code = body.get("mpesa_code")
        plan = body.get("plan", "biweekly")
        created_at_str = body.get("createdAt", datetime.now(timezone.utc).isoformat())
        
        logger.info(f"📝 [Payment] Parsed payment data:")
        logger.info(f"   Type: {payment_type}")
        logger.info(f"   Amount: {amount} {currency}")
        logger.info(f"   M-Pesa Code: {mpesa_code}")
        logger.info(f"   Plan: {plan}")
        logger.info(f"   Status: {status}")
        
        # ====================================================================
        # 3. VERIFY RIDER EXISTS
        # ====================================================================
        
        try:
            rider_uuid = UUID(rider_id)
        except ValueError:
            logger.error(f"❌ Invalid rider_id format: {rider_id}")
            raise HTTPException(
                status_code=400,
                detail="Invalid rider_id format"
            )
        
        rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
        if not rider:
            logger.warning(f"⚠️ Rider not found: {rider_id}")
            raise HTTPException(
                status_code=404,
                detail="Rider not found"
            )
        
        logger.info(f"✅ [Payment] Rider verified: {rider.id}")
        
        # ====================================================================
        # 4. IDEMPOTENCY CHECK: Prevent duplicate payments
        # ====================================================================
        
        logger.info(f"🔍 [Payment] Checking for existing payment with sync_id: {x_sync_id}")
        
        # Query by sync_id (X-Sync-ID header)
        existing_payment = db.query(Payment).filter(
            Payment.sync_id == x_sync_id
        ).first()
        
        if existing_payment:
            # Payment already processed - return cached response
            logger.info(f"✅ [Payment] Payment already recorded (idempotent): {x_sync_id}")
            logger.info(f"   Existing payment ID: {existing_payment.id}")
            
            return {
                "success": True,
                "cached": True,
                "message": "Payment already recorded (idempotent response)",
                "paymentId": str(existing_payment.id),
                "timestamp": existing_payment.created_at.isoformat()
            }
        
        # ====================================================================
        # 5. INSERT NEW PAYMENT RECORD
        # ====================================================================
        
        # Parse created_at timestamp
        try:
            payment_created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
        except:
            payment_created_at = datetime.now(timezone.utc)
        
        new_payment = Payment(
            id=UUID(payment_id) if payment_id else None,
            rider_id=rider_uuid,  # Store as UUID to match schema (rider.id is UUID)
            type=payment_type,
            amount=float(amount) if amount else 0,
            currency=currency,
            status=status,  # 'Success', 'Pending', 'Failed'
            channel=channel,
            mpesa_code=mpesa_code,
            plan=plan,
            sync_id=x_sync_id,  # Store X-Sync-ID for idempotency
            created_at=payment_created_at,
            data={
                "original_request": {
                    "type": payment_type,
                    "amount": amount,
                    "currency": currency,
                    "plan": plan
                },
                "mobile_timestamp": created_at_str,
                "server_received_at": datetime.now(timezone.utc).isoformat()
            }
        )
        
        db.add(new_payment)
        db.flush()  # Flush to get the ID without committing
        
        logger.info(f"✅ [Payment] Payment inserted successfully: {new_payment.id}")
        logger.info(f"   Amount: {new_payment.amount} {currency}")
        logger.info(f"   M-Pesa Code: {mpesa_code}")
        logger.info(f"   Status: {status}")
        
        # ====================================================================
        # 6. UNLOCK ACCOUNT IF IT WAS LOCKED
        # ====================================================================
        
        # Check if account was locked
        rider_sub = db.query(RiderSubscription).filter(
            RiderSubscription.rider_id == rider_uuid
        ).order_by(RiderSubscription.created_at.desc()).first()
        
        if rider_sub:
            # Update subscription to active
            rider_sub.status = "active"
            rider_sub.updated_at = datetime.now(timezone.utc)
            logger.info(f"🔓 [Payment] Unlocked subscription for rider: {rider_id}")
            logger.info(f"   Subscription ID: {rider_sub.id}")
        
        # ====================================================================
        # 7. COMMIT TRANSACTION
        # ====================================================================
        
        db.commit()
        logger.info(f"✅ [Payment] Transaction committed successfully")
        
        # ====================================================================
        # 8. RETURN SUCCESS RESPONSE
        # ====================================================================
        
        logger.info(f"✅ [Payment] SUCCESS - Payment processed completely")
        logger.info(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        return {
            "success": True,
            "paymentId": str(new_payment.id),
            "message": "Payment received and recorded successfully",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "riderId": rider_id,
            "syncId": x_sync_id,
            "amount": amount,
            "currency": currency,
            "plan": plan,
            "status": status,
            "channel": channel
        }
    
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        db.rollback()
        raise
    
    except json.JSONDecodeError:
        logger.error("❌ Invalid JSON in request body")
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Invalid JSON in request body"
        )
    
    except Exception as error:
        logger.error(f"❌ [Payment] Unexpected error: {str(error)}")
        logger.error(f"   Error type: {type(error).__name__}")
        logger.error(f"   Stack trace: {error}")
        
        db.rollback()
        
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to process payment",
                "message": str(error),
                "syncId": x_sync_id
            }
        )


# ============================================================================
# ADMIN ENDPOINTS
# ============================================================================

@router.get("/payments")
def get_all_payments(
    limit: int = 50,
    offset: int = 0,
    status: str = None,
    db: Session = Depends(get_db)
):
    """
    ✅ GET /subscriptions/payments
    
    Admin endpoint to view all payments with pagination and filtering
    
    Query Params:
        limit: Number of records to return (default: 50, max: 500)
        offset: Pagination offset (default: 0)
        status: Filter by payment status (optional)
    
    Returns:
        - List of payments sorted by newest first
        - Pagination info
    """
    try:
        # Limit max records per request
        limit = min(limit, 500)
        
        # Build query
        query = db.query(Payment)
        
        # Apply status filter if provided
        if status:
            query = query.filter(Payment.status == status)
        
        # Get total count
        total = query.count()
        
        # Get paginated payments sorted by newest first
        payments = query.order_by(
            Payment.created_at.desc()
        ).limit(limit).offset(offset).all()
        
        # Convert to dict
        payment_list = []
        for payment in payments:
            payment_list.append({
                "id": str(payment.id),
                "riderId": str(payment.rider_id),
                "type": payment.type,
                "amount": float(payment.amount) if payment.amount else 0,
                "currency": payment.currency,
                "channel": payment.channel,
                "mpesaCode": payment.mpesa_code,
                "plan": payment.plan,
                "status": payment.status,
                "syncId": payment.sync_id,
                "createdAt": payment.created_at.isoformat() if payment.created_at else None,
                "syncedAt": payment.synced_at.isoformat() if payment.synced_at else None
            })
        
        logger.info(f"📊 [Admin] Retrieved {len(payment_list)} payments (limit={limit}, offset={offset})")
        
        return {
            "success": True,
            "data": payment_list,
            "pagination": {
                "total": total,
                "limit": limit,
                "offset": offset,
                "hasMore": offset + limit < total,
                "page": (offset // limit) + 1 if limit > 0 else 1
            }
        }
    
    except Exception as error:
        logger.error(f"❌ [Admin] Error fetching payments: {str(error)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to fetch payments",
                "message": str(error)
            }
        )


@router.get("/payments/stats")
def get_payment_stats(db: Session = Depends(get_db)):
    """
    ✅ GET /subscriptions/payments/stats
    
    Admin endpoint to view payment statistics
    Returns comprehensive payment metrics and trends
    """
    try:
        # Total payments
        total_payments = db.query(Payment).count()
        total_revenue = db.query(func.sum(Payment.amount)).scalar() or 0
        
        # Payments in last 7 days
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        week_payments = db.query(Payment).filter(
            Payment.created_at > week_ago
        ).count()
        week_revenue = db.query(func.sum(Payment.amount)).filter(
            Payment.created_at > week_ago
        ).scalar() or 0
        
        # Payments today
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_payments = db.query(Payment).filter(
            Payment.created_at >= today_start
        ).count()
        today_revenue = db.query(func.sum(Payment.amount)).filter(
            Payment.created_at >= today_start
        ).scalar() or 0
        
        # Unique riders
        unique_riders = db.query(Payment.rider_id).distinct().count()
        
        # By status
        status_breakdown = db.query(
            Payment.status,
            func.count(Payment.id).label('count'),
            func.sum(Payment.amount).label('total_amount')
        ).group_by(Payment.status).all()
        
        status_stats = {
            status: {
                "count": count,
                "total_amount": float(total_amount) if total_amount else 0
            }
            for status, count, total_amount in status_breakdown
        }
        
        # By channel
        channel_breakdown = db.query(
            Payment.channel,
            func.count(Payment.id).label('count'),
            func.sum(Payment.amount).label('total_amount')
        ).group_by(Payment.channel).all()
        
        channel_stats = {
            channel: {
                "count": count,
                "total_amount": float(total_amount) if total_amount else 0
            }
            for channel, count, total_amount in channel_breakdown
        }
        
        # By plan
        plan_breakdown = db.query(
            Payment.plan,
            func.count(Payment.id).label('count'),
            func.sum(Payment.amount).label('total_amount')
        ).group_by(Payment.plan).all()
        
        plan_stats = {
            plan: {
                "count": count,
                "total_amount": float(total_amount) if total_amount else 0
            }
            for plan, count, total_amount in plan_breakdown
        }
        
        # Calculate average payment amount
        avg_payment = db.query(func.avg(Payment.amount)).scalar() or 0
        
        logger.info(f"📊 [Admin] Payment stats calculated")
        logger.info(f"   Total Payments: {total_payments}")
        logger.info(f"   Total Revenue: {total_revenue} KES")
        logger.info(f"   Unique Riders: {unique_riders}")
        
        return {
            "success": True,
            "stats": {
                "summary": {
                    "totalPayments": total_payments,
                    "totalRevenue": float(total_revenue),
                    "uniqueRiders": unique_riders,
                    "averagePayment": float(avg_payment)
                },
                "today": {
                    "payments": today_payments,
                    "revenue": float(today_revenue)
                },
                "last7Days": {
                    "payments": week_payments,
                    "revenue": float(week_revenue)
                },
                "byStatus": status_stats,
                "byChannel": channel_stats,
                "byPlan": plan_stats
            }
        }
    
    except Exception as error:
        logger.error(f"❌ [Admin] Error fetching stats: {str(error)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to fetch statistics",
                "message": str(error)
            }
        )


@router.get("/payments/{payment_id}")
def get_payment_details(
    payment_id: str,
    db: Session = Depends(get_db)
):
    """
    ✅ GET /subscriptions/payments/{payment_id}
    
    Get detailed information about a specific payment
    """
    try:
        try:
            payment_uuid = UUID(payment_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid payment ID format")
        
        payment = db.query(Payment).filter(Payment.id == payment_uuid).first()
        
        if not payment:
            raise HTTPException(
                status_code=404,
                detail="Payment not found"
            )
        
        return {
            "success": True,
            "data": {
                "id": str(payment.id),
                "riderId": str(payment.rider_id),
                "type": payment.type,
                "amount": float(payment.amount) if payment.amount else 0,
                "currency": payment.currency,
                "channel": payment.channel,
                "mpesaCode": payment.mpesa_code,
                "plan": payment.plan,
                "status": payment.status,
                "syncId": payment.sync_id,
                "createdAt": payment.created_at.isoformat() if payment.created_at else None,
                "syncedAt": payment.synced_at.isoformat() if payment.synced_at else None,
                "metadata": payment.data
            }
        }
    
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"❌ [Admin] Error fetching payment details: {str(error)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to fetch payment details",
                "message": str(error)
            }
        )


# ============================================================================
# USAGE & INTEGRATION
# ============================================================================
"""
SETUP INSTRUCTIONS:

1. Update backend/app/models/payment.py with the corrected model

2. Register in backend/app/main.py:
   from app.routers import subscriptions_payment
   app.include_router(subscriptions_payment.router)

3. Test payment endpoint:
   POST http://localhost:8000/subscriptions/payment?rider_id=YOUR-RIDER-UUID
   Headers:
     X-Sync-ID: payment_123456789_1704110400000
     X-Client-Timestamp: 2024-12-20T10:30:00Z
     Content-Type: application/json
   Body:
     {
       "id": "payment_6fa42197-e13c-4020-9934-c9b4a73cfd8c",
       "type": "subscription",
       "amount": 500,
       "currency": "KES",
       "status": "Success",
       "channel": "M-Pesa",
       "mpesa_code": "ABC123XYZ",
       "plan": "biweekly",
       "createdAt": "2024-12-20T10:30:00Z"
     }

4. Admin endpoints:
   GET /subscriptions/payments?limit=50&offset=0&status=Success
   GET /subscriptions/payments/stats
   GET /subscriptions/payments/{payment_id}

5. Key fixes applied:
   ✅ Removed non-existent columns: label, reconciliation, sync_status, submitted_at
   ✅ Added correct column mappings: type, currency, plan
   ✅ Fixed sync_id to use X-Sync-ID header
   ✅ Fixed created_at to accept mobile timestamp
   ✅ Added data JSON field for metadata
   ✅ All queries now match actual database schema
"""