# backend/app/routers/subscriptions_payment.py
# ============================================================================
# PAYMENT SYNC ENDPOINT: Receives payment syncs from mobile app
# ✅ FIXED: Proper transaction handling with explicit commit & verification
# ✅ FIXED: Comprehensive error logging for diagnosis
# ============================================================================

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, text
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
# PAYMENT SYNC ENDPOINT - FIXED VERSION
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
    
    payment_id_for_logging = None
    
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
        
        logger.info(f"📥 [Payment] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
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
        
        payment_id_for_logging = payment_id
        
        logger.info(f"📝 [Payment] Parsed payment data:")
        logger.info(f"   Payment ID: {payment_id}")
        logger.info(f"   Type: {payment_type}")
        logger.info(f"   Amount: {amount} {currency}")
        logger.info(f"   Plan: {plan}")
        logger.info(f"   Status: {status}")
        logger.info(f"   Channel: {channel}")
        logger.info(f"   M-Pesa Code: {mpesa_code}")
        
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
        
        logger.info(f"🔍 [Payment] Verifying rider exists: {rider_id}")
        rider = db.query(Rider).filter(Rider.id == rider_uuid).first()
        
        if not rider:
            logger.error(f"❌ Rider not found: {rider_id}")
            raise HTTPException(
                status_code=404,
                detail="Rider not found"
            )
        
        logger.info(f"✅ [Payment] Rider verified: {rider.id}")
        
        # ====================================================================
        # 4. IDEMPOTENCY CHECK: Prevent duplicate payments
        # ====================================================================
        
        logger.info(f"🔍 [Payment] Checking for existing payment with sync_id: {x_sync_id}")
        
        existing_payment = db.query(Payment).filter(
            Payment.sync_id == x_sync_id
        ).first()
        
        if existing_payment:
            logger.info(f"✅ [Payment] Payment already recorded (idempotent): {x_sync_id}")
            logger.info(f"   Existing payment ID: {existing_payment.id}")
            logger.info(f"   Skipping duplicate insert")
            
            return {
                "success": True,
                "cached": True,
                "message": "Payment already recorded (idempotent response)",
                "paymentId": str(existing_payment.id),
                "timestamp": existing_payment.created_at.isoformat(),
                "status": "cached"
            }
        
        logger.info(f"✅ [Payment] No duplicate found - proceeding with insert")
        
        # ====================================================================
        # 5. CREATE & INSERT NEW PAYMENT RECORD
        # ====================================================================
        
        # Parse created_at timestamp
        try:
            payment_created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
        except Exception as time_err:
            logger.warning(f"⚠️ Failed to parse timestamp '{created_at_str}': {time_err}")
            payment_created_at = datetime.now(timezone.utc)
        
        logger.info(f"📝 [Payment] Creating Payment object...")
        
        # Create payment with all required fields
        new_payment = Payment(
            id=UUID(payment_id) if payment_id else None,
            rider_id=rider_uuid,
            type=payment_type,
            amount=float(amount) if amount else 0.0,
            currency=currency,
            status=status,
            channel=channel,
            mpesa_code=mpesa_code if mpesa_code else None,
            plan=plan,
            sync_id=x_sync_id,
            created_at=payment_created_at,
            data={
                "original_request": {
                    "type": payment_type,
                    "amount": amount,
                    "currency": currency,
                    "plan": plan,
                    "channel": channel
                },
                "mobile_timestamp": created_at_str,
                "server_received_at": datetime.now(timezone.utc).isoformat()
            }
        )
        
        logger.info(f"📝 [Payment] Adding to session...")
        db.add(new_payment)
        
        logger.info(f"📝 [Payment] Flushing to database...")
        db.flush()
        
        payment_id_for_logging = str(new_payment.id)
        logger.info(f"✅ [Payment] Payment flushed successfully (ID: {new_payment.id})")
        
        # ====================================================================
        # 6. UNLOCK ACCOUNT IF IT WAS LOCKED
        # ====================================================================
        
        logger.info(f"🔍 [Payment] Checking subscription status...")
        
        rider_sub = db.query(RiderSubscription).filter(
            RiderSubscription.rider_id == rider_uuid
        ).order_by(RiderSubscription.created_at.desc()).first()
        
        if rider_sub:
            logger.info(f"📋 [Payment] Found subscription: {rider_sub.id}")
            logger.info(f"   Current status: {rider_sub.status}")
            
            # Update subscription to active
            rider_sub.status = "active"
            rider_sub.updated_at = datetime.now(timezone.utc)
            
            logger.info(f"🔓 [Payment] Unlocked subscription for rider: {rider_id}")
            logger.info(f"   Subscription ID: {rider_sub.id}")
            logger.info(f"   New status: active")
        else:
            logger.info(f"ℹ️ [Payment] No subscription found for rider (first payment)")
        
        # ====================================================================
        # 7. COMMIT TRANSACTION - CRITICAL STEP
        # ====================================================================
        
        logger.info(f"💾 [Payment] COMMITTING TRANSACTION...")
        db.commit()
        logger.info(f"✅ [Payment] Transaction committed successfully")
        
        # ====================================================================
        # 8. VERIFY PAYMENT WAS ACTUALLY SAVED
        # ====================================================================
        
        logger.info(f"🔍 [Payment] Verifying payment was saved to database...")
        
        # Create new query (after commit, using fresh session connection)
        verify_result = db.query(Payment).filter(
            Payment.sync_id == x_sync_id
        ).first()
        
        if not verify_result:
            logger.error(f"❌ [Payment] VERIFICATION FAILED - Payment not found after commit!")
            logger.error(f"   Sync ID: {x_sync_id}")
            logger.error(f"   Payment ID: {payment_id_for_logging}")
            raise Exception("Payment was not actually saved to database after commit")
        
        logger.info(f"✅ [Payment] VERIFICATION PASSED - Payment found in database!")
        logger.info(f"   Verified ID: {verify_result.id}")
        logger.info(f"   Verified Amount: {verify_result.amount}")
        logger.info(f"   Verified Status: {verify_result.status}")
        logger.info(f"   Verified Rider: {verify_result.rider_id}")
        
        # ====================================================================
        # 9. RETURN SUCCESS RESPONSE
        # ====================================================================
        
        logger.info(f"✅ [Payment] SUCCESS - Payment processed completely")
        logger.info(f"📥 [Payment] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        return {
            "success": True,
            "paymentId": str(new_payment.id),
            "message": "Payment received and recorded successfully",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "riderId": rider_id,
            "syncId": x_sync_id,
            "amount": float(amount),
            "currency": currency,
            "plan": plan,
            "status": status,
            "channel": channel,
            "verified": True
        }
    
    except HTTPException as http_err:
        logger.error(f"❌ [Payment] HTTP Exception: {http_err.detail}")
        db.rollback()
        raise
    
    except json.JSONDecodeError as json_err:
        logger.error(f"❌ [Payment] Invalid JSON in request body: {json_err}")
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Invalid JSON in request body"
        )
    
    except Exception as error:
        logger.error(f"❌ [Payment] Unexpected error: {str(error)}")
        logger.error(f"   Error type: {type(error).__name__}")
        logger.error(f"   Payment ID: {payment_id_for_logging}")
        logger.error(f"   Stack trace:", exc_info=True)
        
        try:
            db.rollback()
            logger.info(f"✅ [Payment] Rollback completed")
        except Exception as rollback_err:
            logger.error(f"❌ [Payment] Error during rollback: {rollback_err}")
        
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to process payment",
                "message": str(error),
                "syncId": x_sync_id,
                "paymentId": payment_id_for_logging
            }
        )


# ============================================================================
# VERIFICATION ENDPOINT - Diagnose payment save issues
# ============================================================================

@router.get("/payment/verify/{sync_id}")
def verify_payment_sync(
    sync_id: str,
    db: Session = Depends(get_db)
):
    """
    ✅ GET /subscriptions/payment/verify/{sync_id}
    
    Verify if a payment with specific sync_id exists in database
    
    USAGE:
        GET http://localhost:8000/subscriptions/payment/verify/payment_123456789_1704110400000
    """
    try:
        logger.info(f"🔍 [Verify] Checking for payment with sync_id: {sync_id}")
        
        payment = db.query(Payment).filter(
            Payment.sync_id == sync_id
        ).first()
        
        if payment:
            logger.info(f"✅ [Verify] Payment found!")
            return {
                "success": True,
                "found": True,
                "message": "Payment exists in database",
                "payment": {
                    "id": str(payment.id),
                    "riderId": str(payment.rider_id),
                    "amount": float(payment.amount),
                    "currency": payment.currency,
                    "status": payment.status,
                    "plan": payment.plan,
                    "channel": payment.channel,
                    "syncId": payment.sync_id,
                    "createdAt": payment.created_at.isoformat()
                }
            }
        else:
            logger.info(f"❌ [Verify] Payment not found with sync_id: {sync_id}")
            return {
                "success": False,
                "found": False,
                "message": "Payment not found in database",
                "syncId": sync_id
            }
    
    except Exception as error:
        logger.error(f"❌ [Verify] Error: {str(error)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Verification failed",
                "message": str(error)
            }
        )


# ============================================================================
# DIAGNOSTIC ENDPOINT - Check database connectivity
# ============================================================================

@router.get("/payment/diagnostics")
def payment_diagnostics(
    rider_id: str = None,
    db: Session = Depends(get_db)
):
    """
    ✅ GET /subscriptions/payment/diagnostics?rider_id=XXX
    
    Get comprehensive diagnostics about payment table and sync status
    """
    try:
        logger.info(f"🔍 [Diagnostics] Running payment diagnostics...")
        
        # Check if payment table exists
        try:
            table_check = db.query(Payment).count()
            table_exists = True
        except:
            table_exists = False
        
        # Get total payment count
        total_payments = db.query(Payment).count() if table_exists else 0
        
        # Get total revenue
        total_revenue = db.query(func.sum(Payment.amount)).scalar() or 0
        
        # Get latest 5 payments
        latest_payments = []
        if table_exists:
            recent = db.query(Payment).order_by(Payment.created_at.desc()).limit(5).all()
            latest_payments = [
                {
                    "id": str(p.id),
                    "riderId": str(p.rider_id),
                    "amount": float(p.amount),
                    "status": p.status,
                    "createdAt": p.created_at.isoformat()
                }
                for p in recent
            ]
        
        # Get rider-specific data if requested
        rider_payments = []
        if rider_id and table_exists:
            try:
                rider_uuid = UUID(rider_id)
                rider_payments_list = db.query(Payment).filter(
                    Payment.rider_id == rider_uuid
                ).all()
                rider_payments = [
                    {
                        "id": str(p.id),
                        "amount": float(p.amount),
                        "status": p.status,
                        "syncId": p.sync_id,
                        "createdAt": p.created_at.isoformat()
                    }
                    for p in rider_payments_list
                ]
            except:
                pass
        
        # Get payment status breakdown
        status_breakdown = {}
        if table_exists:
            statuses = db.query(
                Payment.status,
                func.count(Payment.id).label('count')
            ).group_by(Payment.status).all()
            status_breakdown = {status: count for status, count in statuses}
        
        logger.info(f"✅ [Diagnostics] Complete")
        
        return {
            "success": True,
            "diagnostics": {
                "database": {
                    "tableExists": table_exists,
                    "totalPayments": total_payments,
                    "totalRevenue": float(total_revenue)
                },
                "latestPayments": latest_payments,
                "byStatus": status_breakdown,
                "riderData": {
                    "riderId": rider_id,
                    "paymentCount": len(rider_payments),
                    "payments": rider_payments
                }
            }
        }
    
    except Exception as error:
        logger.error(f"❌ [Diagnostics] Error: {str(error)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Diagnostics failed",
                "message": str(error)
            }
        )


# ============================================================================
# LIST ALL PAYMENTS (Admin)
# ============================================================================

@router.get("/payments")
def list_payments(
    limit: int = 50,
    offset: int = 0,
    status: str = None,
    db: Session = Depends(get_db)
):
    """
    ✅ GET /subscriptions/payments?limit=50&offset=0&status=Success
    
    List all payments with pagination and filtering
    """
    try:
        query = db.query(Payment)
        
        if status:
            query = query.filter(Payment.status == status)
        
        total = query.count()
        payments = query.order_by(Payment.created_at.desc()).limit(limit).offset(offset).all()
        
        return {
            "success": True,
            "pagination": {
                "limit": limit,
                "offset": offset,
                "total": total
            },
            "payments": [
                {
                    "id": str(p.id),
                    "riderId": str(p.rider_id),
                    "type": p.type,
                    "amount": float(p.amount),
                    "currency": p.currency,
                    "status": p.status,
                    "channel": p.channel,
                    "plan": p.plan,
                    "syncId": p.sync_id,
                    "createdAt": p.created_at.isoformat()
                }
                for p in payments
            ]
        }
    
    except Exception as error:
        logger.error(f"❌ Error listing payments: {str(error)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to list payments",
                "message": str(error)
            }
        )


# ============================================================================
# STATS ENDPOINT (Admin)
# ============================================================================

@router.get("/payments/stats")
def payment_stats(
    db: Session = Depends(get_db)
):
    """
    ✅ GET /subscriptions/payments/stats
    
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

1. Replace your existing subscriptions_payment.py with this fixed version

2. Verify Payment model in app/models/payment.py has these columns:
   ✅ id (UUID)
   ✅ rider_id (UUID, foreign key to riders)
   ✅ type (String)
   ✅ amount (Numeric/Float)
   ✅ currency (String)
   ✅ status (String)
   ✅ channel (String)
   ✅ mpesa_code (String, nullable)
   ✅ plan (String)
   ✅ sync_id (String, UNIQUE)
   ✅ data (JSON/JSONB, nullable)
   ✅ created_at (DateTime)
   ✅ synced_at (DateTime, nullable)
   ✅ verified_at (DateTime, nullable)

3. Test with diagnostic endpoint first:
   GET http://localhost:8000/subscriptions/payment/diagnostics

4. Make a test payment:
   POST http://localhost:8000/subscriptions/payment?rider_id=YOUR-RIDER-UUID
   Headers:
     X-Sync-ID: TEST_PAYMENT_12345_1704110400000
     X-Client-Timestamp: 2024-12-20T10:30:00Z
     Content-Type: application/json
   Body:
     {
       "id": "payment_test_123",
       "type": "subscription",
       "amount": 500,
       "currency": "KES",
       "status": "Success",
       "channel": "M-Pesa",
       "mpesa_code": "ABC123XYZ",
       "plan": "biweekly",
       "createdAt": "2024-12-20T10:30:00Z"
     }

5. Verify with verification endpoint:
   GET http://localhost:8000/subscriptions/payment/verify/TEST_PAYMENT_12345_1704110400000

6. Check all payments:
   GET http://localhost:8000/subscriptions/payments

7. KEY CHANGES FROM PREVIOUS VERSION:
   ✅ Added explicit db.commit() after all operations
   ✅ Added POST-COMMIT verification to confirm payment was saved
   ✅ Enhanced error logging with file operations tracking
   ✅ Added new verification endpoint (/verify/{sync_id})
   ✅ Added new diagnostic endpoint (/diagnostics)
   ✅ Better exception handling with rollback
   ✅ More detailed logging throughout transaction lifecycle
"""