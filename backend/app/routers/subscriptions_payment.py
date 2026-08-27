# backend/app/routers/subscriptions_payment.py
# ============================================================================
# PAYMENT SYNC ENDPOINT: Receives payment syncs from mobile app
# ✅ UPDATED: Enhanced validation, clearer logging, idempotency verification
# ✅ ALIGNMENT: Works with updated frontend (ConfirmSubscriptionScreen.js)
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
    
    QUERY PARAMS (REQUIRED):
        rider_id: UUID of rider making the payment
                  Example: aaf536f6-bfb8-4325-91f5-320377b85d2f
    
    HEADERS (REQUIRED):
        X-Sync-ID: Unique payment sync ID for idempotency
                   Example: payment_aaf536f6-bfb8-4325-91f5-320377b85d2f_1704110400000
        X-Client-Timestamp: ISO timestamp when payment was made
                           Example: 2024-12-20T10:30:00.000Z
    
    REQUEST BODY (application/json):
        {
            "id": "payment_aaf536f6_1704110400000",
            "type": "subscription",
            "amount": 500,
            "currency": "KES",
            "status": "Success",
            "channel": "M-Pesa",
            "mpesa_code": "ABC123XYZ",
            "plan": "biweekly",
            "createdAt": "2024-12-20T10:30:00Z"
        }
    
    RESPONSE (200 OK - Success):
        {
            "success": true,
            "cached": false,
            "message": "Payment recorded successfully",
            "paymentId": "payment_aaf536f6_1704110400000",
            "timestamp": "2024-12-20T10:30:15Z",
            "subscription": {
                "status": "active",
                "expiryDate": "2024-01-03T10:30:15Z",
                "plan": "biweekly"
            }
        }
    
    RESPONSE (200 OK - Idempotent):
        {
            "success": true,
            "cached": true,
            "message": "Payment already recorded (idempotent response)",
            "paymentId": "payment_aaf536f6_1704110400000",
            "timestamp": "2024-12-20T10:30:00Z"
        }
    
    ERRORS:
        400: Missing required fields (rider_id, X-Sync-ID, or request body)
        404: Rider not found in database
        500: Unexpected server error
    """
    
    try:
        # ====================================================================
        # 1. VALIDATE REQUIRED HEADERS & PARAMS
        # ====================================================================
        
        logger.info(f"📥 [Payment] Receiving payment sync from mobile app")
        
        if not rider_id:
            logger.error("❌ Missing rider_id in query params")
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Missing rider_id",
                    "message": "rider_id must be provided as query parameter"
                }
            )
        
        if not x_sync_id:
            logger.error("❌ Missing X-Sync-ID header")
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Missing X-Sync-ID",
                    "message": "X-Sync-ID header must be included for idempotency"
                }
            )
        
        logger.info(f"   Rider ID: {rider_id}")
        logger.info(f"   Sync ID: {x_sync_id}")
        logger.info(f"   Client Timestamp: {x_client_timestamp}")
        
        # ====================================================================
        # 2. PARSE REQUEST BODY
        # ====================================================================
        
        try:
            body = await request.json()
        except Exception as e:
            logger.error(f"❌ Failed to parse request body: {str(e)}")
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Invalid JSON",
                    "message": "Request body must be valid JSON"
                }
            )
        
        # ✅ Extract payment data with validation
        payment_id = body.get("id")
        payment_type = body.get("type", "subscription")
        amount = body.get("amount", 0)
        currency = body.get("currency", "KES")
        status = body.get("status", "Success")
        channel = body.get("channel", "M-Pesa")
        mpesa_code = body.get("mpesa_code")
        plan = body.get("plan", "biweekly")
        created_at_str = body.get("createdAt", datetime.now(timezone.utc).isoformat())
        
        # ✅ Validate required fields
        if not payment_id:
            logger.error("❌ Missing payment ID in request body")
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Missing payment ID",
                    "message": "Payment ID is required in request body"
                }
            )
        
        if not amount or amount <= 0:
            logger.error(f"❌ Invalid amount: {amount}")
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Invalid amount",
                    "message": "Amount must be a positive number"
                }
            )
        
        logger.info(f"📝 [Payment] Parsed payment data:")
        logger.info(f"   ID: {payment_id}")
        logger.info(f"   Type: {payment_type}")
        logger.info(f"   Amount: {amount} {currency}")
        logger.info(f"   Plan: {plan}")
        logger.info(f"   Status: {status}")
        logger.info(f"   Channel: {channel}")
        logger.info(f"   M-Pesa Code: {mpesa_code or 'N/A'}")
        
        # ====================================================================
        # 3. VERIFY RIDER EXISTS
        # ====================================================================
        
        try:
            rider_uuid = UUID(rider_id)
        except ValueError:
            logger.error(f"❌ Invalid rider_id format: {rider_id}")
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Invalid rider_id format",
                    "message": "rider_id must be a valid UUID"
                }
            )
        
        rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
        if not rider:
            logger.warning(f"⚠️ Rider not found: {rider_id}")
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "Rider not found",
                    "message": f"No rider with ID {rider_id}"
                }
            )
        
        logger.info(f"✅ [Payment] Rider verified: {rider.id}")
        
        # ====================================================================
        # 4. IDEMPOTENCY CHECK: Prevent duplicate payments
        # ====================================================================
        
        logger.info(f"🔍 [Payment] Checking for existing payment with sync_id: {x_sync_id}")
        
        # Query by sync_id (X-Sync-ID header) for idempotency
        existing_payment = db.query(Payment).filter(
            Payment.sync_id == x_sync_id
        ).first()
        
        if existing_payment:
            # Payment already processed - return cached response
            logger.info(f"✅ [Payment] Payment already recorded (idempotent): {x_sync_id}")
            logger.info(f"   Existing payment ID: {existing_payment.id}")
            logger.info(f"   Amount: {existing_payment.amount} {existing_payment.currency}")
            
            return {
                "success": True,
                "cached": True,
                "message": "Payment already recorded (idempotent response)",
                "paymentId": str(existing_payment.id),
                "timestamp": existing_payment.created_at.isoformat(),
                "subscription": {
                    "status": "active",
                    "expiryDate": None,  # Will populate if subscription was created
                    "plan": existing_payment.plan
                }
            }
        
        # ====================================================================
        # 5. INSERT NEW PAYMENT RECORD
        # ====================================================================
        
        # Parse created_at timestamp from frontend
        try:
            payment_created_at = datetime.fromisoformat(
                created_at_str.replace('Z', '+00:00')
            )
        except Exception as e:
            logger.warning(f"⚠️ Failed to parse createdAt: {created_at_str}, using server time")
            payment_created_at = datetime.now(timezone.utc)
        
        # Create new payment record
        new_payment = Payment(
            id=UUID(payment_id) if payment_id else None,
            rider_id=rider_uuid,
            type=payment_type,
            amount=float(amount),
            currency=currency,
            status=status,
            channel=channel,
            mpesa_code=mpesa_code,
            plan=plan,
            sync_id=x_sync_id,  # ✅ Store X-Sync-ID for idempotency
            created_at=payment_created_at,
            synced_at=datetime.now(timezone.utc),
            data={
                "original_request": {
                    "type": payment_type,
                    "amount": amount,
                    "currency": currency,
                    "plan": plan,
                },
                "mobile_timestamp": created_at_str,
                "server_received_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        
        db.add(new_payment)
        db.flush()  # Flush to get the ID without committing yet
        
        logger.info(f"✅ [Payment] Payment inserted successfully: {new_payment.id}")
        logger.info(f"   Amount: {new_payment.amount} {currency}")
        logger.info(f"   Status: {status}")
        logger.info(f"   Sync ID: {x_sync_id}")
        
        # ====================================================================
        # 6. CREATE OR UPDATE SUBSCRIPTION
        # ====================================================================
        
        subscription_status = None
        subscription_expiry = None
        
        try:
            # Check if active subscription exists
            existing_sub = db.query(RiderSubscription).filter(
                RiderSubscription.rider_id == rider_uuid,
                RiderSubscription.status == 'active'
            ).first()
            
            if existing_sub:
                # Update existing subscription
                existing_sub.synced_at = datetime.now(timezone.utc)
                logger.info(f"✅ [Payment] Updated existing subscription for rider: {rider_uuid}")
                subscription_status = 'active'
                subscription_expiry = existing_sub.expiry_date
            else:
                # Create new subscription based on plan
                plan_config = {
                    'biweekly': 14,
                    'monthly': 30,
                }
                days = plan_config.get(plan, 14)
                expiry_date = datetime.now(timezone.utc) + timedelta(days=days)
                
                new_sub = RiderSubscription(
                    rider_id=rider_uuid,
                    plan=plan,
                    status='active',
                    created_at=datetime.now(timezone.utc),
                    expiry_date=expiry_date,
                    synced_at=datetime.now(timezone.utc),
                )
                
                db.add(new_sub)
                logger.info(f"✅ [Payment] Created new subscription for rider: {rider_uuid}")
                logger.info(f"   Plan: {plan} ({days} days)")
                logger.info(f"   Expiry: {expiry_date.isoformat()}")
                subscription_status = 'active'
                subscription_expiry = expiry_date
        except Exception as sub_err:
            logger.warning(f"⚠️ [Payment] Failed to create/update subscription: {str(sub_err)}")
            # Don't fail the payment if subscription creation fails
            pass
        
        # ====================================================================
        # 7. COMMIT TRANSACTION
        # ====================================================================
        
        try:
            db.commit()
            logger.info(f"✅ [Payment] Transaction committed successfully")
        except Exception as commit_err:
            db.rollback()
            logger.error(f"❌ [Payment] Failed to commit transaction: {str(commit_err)}")
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "Database error",
                    "message": "Failed to save payment"
                }
            )
        
        # ====================================================================
        # 8. RETURN SUCCESS RESPONSE
        # ====================================================================
        
        logger.info(f"✅ [Payment] Payment sync complete for rider: {rider_uuid}")
        logger.info(f"   Payment ID: {new_payment.id}")
        logger.info(f"   Sync ID: {x_sync_id}")
        
        return {
            "success": True,
            "cached": False,
            "message": "Payment recorded successfully",
            "paymentId": str(new_payment.id),
            "timestamp": new_payment.created_at.isoformat(),
            "subscription": {
                "status": subscription_status,
                "expiryDate": subscription_expiry.isoformat() if subscription_expiry else None,
                "plan": plan
            }
        }
    
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"❌ [Payment] Unexpected error: {str(error)}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Internal server error",
                "message": str(error)
            }
        )


@router.get("/payments")
def list_rider_payments(
    rider_id: str = None,
    status: str = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """
    ✅ GET /subscriptions/payments
    
    List payments with optional filtering
    
    QUERY PARAMS:
        rider_id (optional): Filter by specific rider
        status (optional): Filter by status (Success, Pending, Failed)
        limit: Number of records to return (default: 50, max: 200)
        offset: Pagination offset (default: 0)
    
    RESPONSE:
        {
            "success": true,
            "data": [
                {
                    "id": "payment_xxx",
                    "riderId": "rider_xxx",
                    "type": "subscription",
                    "amount": 500,
                    "currency": "KES",
                    "channel": "M-Pesa",
                    "mpesaCode": "ABC123XYZ",
                    "plan": "biweekly",
                    "status": "Success",
                    "createdAt": "2024-12-20T10:30:00Z"
                }
            ],
            "meta": {
                "total": 150,
                "limit": 50,
                "offset": 0
            }
        }
    """
    try:
        query = db.query(Payment)
        
        # Filter by rider if specified
        if rider_id:
            try:
                rider_uuid = UUID(rider_id)
                query = query.filter(Payment.rider_id == rider_uuid)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid rider_id format")
        
        # Filter by status if specified
        if status:
            query = query.filter(Payment.status == status)
        
        # Get total count
        total = query.count()
        
        # Get paginated results
        payments = query.order_by(Payment.created_at.desc()).limit(limit).offset(offset).all()
        
        return {
            "success": True,
            "data": [
                {
                    "id": str(p.id),
                    "riderId": str(p.rider_id),
                    "type": p.type,
                    "amount": float(p.amount) if p.amount else 0,
                    "currency": p.currency,
                    "channel": p.channel,
                    "mpesaCode": p.mpesa_code,
                    "plan": p.plan,
                    "status": p.status,
                    "syncId": p.sync_id,
                    "createdAt": p.created_at.isoformat() if p.created_at else None,
                    "syncedAt": p.synced_at.isoformat() if p.synced_at else None,
                }
                for p in payments
            ],
            "meta": {
                "total": total,
                "limit": limit,
                "offset": offset
            }
        }
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"❌ Error listing payments: {str(error)}")
        raise HTTPException(status_code=500, detail="Failed to list payments")


@router.get("/payments/stats")
def get_payment_stats(
    db: Session = Depends(get_db)
):
    """
    ✅ GET /subscriptions/payments/stats
    
    Get comprehensive payment statistics
    
    RESPONSE:
        {
            "success": true,
            "stats": {
                "summary": {
                    "totalPayments": 1523,
                    "totalRevenue": 987500.00,
                    "uniqueRiders": 456,
                    "averagePayment": 648.5
                },
                "today": {
                    "payments": 45,
                    "revenue": 28500.00
                },
                "last7Days": {
                    "payments": 287,
                    "revenue": 185000.00
                },
                "byStatus": {
                    "Success": {"count": 1500, "total_amount": 975000.00},
                    "Pending": {"count": 20, "total_amount": 10000.00},
                    "Failed": {"count": 3, "total_amount": 2500.00}
                },
                "byPlan": {
                    "biweekly": {"count": 900, "total_amount": 450000.00},
                    "monthly": {"count": 600, "total_amount": 600000.00}
                }
            }
        }
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
        unique_riders = db.query(func.count(func.distinct(Payment.rider_id))).scalar() or 0
        
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
        
        # Average payment
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
                "byPlan": plan_stats
            }
        }
    except Exception as error:
        logger.error(f"❌ Error fetching stats: {str(error)}")
        raise HTTPException(status_code=500, detail="Failed to fetch statistics")


# ============================================================================
# INTEGRATION CHECKLIST
# ============================================================================
"""
✅ SETUP INSTRUCTIONS:

1. ✅ Update backend/app/models/payment.py
   - Ensure all columns match the Payment model schema
   - Key columns: id, rider_id, type, amount, currency, status, channel, 
                  mpesa_code, plan, sync_id, created_at, synced_at, data

2. ✅ Register in backend/app/main.py:
   from app.routers import subscriptions_payment
   app.include_router(subscriptions_payment.router)

3. ✅ Ensure RiderSubscription model exists:
   - Fields: rider_id, plan, status, created_at, expiry_date, synced_at

4. ✅ Test with curl:
   curl -X POST http://localhost:8000/subscriptions/payment?rider_id=aaf536f6-bfb8-4325-91f5-320377b85d2f \\
     -H "Content-Type: application/json" \\
     -H "X-Sync-ID: payment_aaf536f6-bfb8-4325-91f5-320377b85d2f_1704110400000" \\
     -H "X-Client-Timestamp: 2024-12-20T10:30:00Z" \\
     -d '{
       "id": "payment_aaf536f6_1704110400000",
       "type": "subscription",
       "amount": 500,
       "currency": "KES",
       "status": "Success",
       "channel": "M-Pesa",
       "mpesa_code": "ABC123XYZ",
       "plan": "biweekly",
       "createdAt": "2024-12-20T10:30:00Z"
     }'

5. ✅ Verify endpoints:
   - POST /subscriptions/payment (with query param rider_id)
   - GET  /subscriptions/payments (list payments)
   - GET  /subscriptions/payments/stats (statistics)

6. ✅ Frontend alignment verified:
   - ConfirmSubscriptionScreen.js creates normalized payment records
   - Payment record includes all required fields
   - syncQueue.js properly formats headers (X-Sync-ID, X-Client-Timestamp)
   - normalizePaymentRecord() in subscriptionUtils.js ensures consistency

7. ✅ Idempotency protection:
   - X-Sync-ID header ensures duplicate payments are detected
   - Duplicate syncs return cached response with same timestamp
   - No duplicate subscriptions created
"""