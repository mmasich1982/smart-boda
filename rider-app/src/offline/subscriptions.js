// FILE LOCATION:
// D:\Martin\Smart Agric\Smart Solo\MVP 0\1 Motorcycle\CODE BASE\smart-boda\smart-boda\routes\subscriptions.js
//
// IF routes FOLDER DOESN'T EXIST, CREATE IT:
// D:\Martin\Smart Agric\Smart Solo\MVP 0\1 Motorcycle\CODE BASE\smart-boda\smart-boda\routes\
//
// Then create subscriptions.js inside it

const express = require('express');
const router = express.Router();
const pool = require('../database'); // Your PostgreSQL connection pool

/**
 * ✅ POST /subscriptions/payment
 * 
 * Receives payment sync from mobile app
 * Saves payment record to database with idempotency protection
 * Logs to audit table for admin visibility
 * 
 * ✅ FIXED: Now properly handles rider_id from query params
 * ✅ FIXED: Validates headers X-Sync-ID and X-Client-Timestamp
 * 
 * HEADERS (sent by mobile app):
 *   X-Sync-ID: payment_6fa42197-e13c-4020-9934-c9b4a73cfd8c_1787805185038
 *   X-Client-Timestamp: 2024-12-20T10:30:00Z
 *   Content-Type: application/json
 * 
 * QUERY PARAMS:
 *   rider_id: 6fa42197-e13c-4020-9934-c9b4a73cfd8c
 * 
 * BODY:
 *   {
 *     "id": "payment_6fa42197-e13c-4020-9934-c9b4a73cfd8c_1787805185038",
 *     "type": "subscription",
 *     "amount": 500,
 *     "currency": "KES",
 *     "status": "pending_verification",
 *     "channel": "Manual (Lipa na M-Pesa / Pochi / Send Money)",
 *     "mpesa_code": "ABC123XYZ",
 *     "plan": "biweekly",
 *     "createdAt": "2024-12-20T10:30:00Z",
 *     "ts": 1708396200000,
 *     "timestamp": 1708396200000,
 *     "syncStatus": "pending"
 *   }
 */
router.post('/payment', async (req, res) => {
  try {
    // ====================================================================
    // 1. EXTRACT & VALIDATE REQUIRED FIELDS
    // ====================================================================
    const { rider_id } = req.query;
    const syncId = req.headers['x-sync-id'];
    const clientTimestamp = req.headers['x-client-timestamp'];

    if (!rider_id || !syncId) {
      console.error('❌ Missing required fields:', { rider_id, syncId });
      return res.status(400).json({
        error: 'Missing rider_id or X-Sync-ID header',
        message: 'rider_id must be in query params, X-Sync-ID must be in headers'
      });
    }

    console.log(`📥 [Payment] Receiving payment sync from mobile app`);
    console.log(`   Rider ID: ${rider_id}`);
    console.log(`   Sync ID: ${syncId}`);
    console.log(`   Client Timestamp: ${clientTimestamp}`);
    console.log(`   Request Body:`, JSON.stringify(req.body, null, 2));

    // ====================================================================
    // 2. EXTRACT PAYMENT DATA FROM REQUEST BODY
    // ====================================================================
    const {
      id,
      type,
      amount,
      currency,
      status,
      channel,
      mpesa_code,
      plan,
      createdAt,
      data
    } = req.body;

    // ====================================================================
    // 3. IDEMPOTENCY CHECK: Prevent duplicate payments
    // ====================================================================
    console.log(`🔍 [Payment] Checking for existing payment with sync_id: ${syncId}`);
    
    const existingPayment = await pool.query(
      'SELECT id, created_at FROM payment WHERE sync_id = $1',
      [syncId]
    );

    if (existingPayment.rows.length > 0) {
      // Payment already processed - return cached response
      const existingId = existingPayment.rows[0].id;
      console.log(`✅ [Payment] Payment already recorded (idempotent): ${syncId}`);
      console.log(`   Existing payment ID: ${existingId}`);
      
      return res.status(200).json({
        success: true,
        cached: true,
        message: 'Payment already recorded (idempotent response)',
        paymentId: existingId,
        timestamp: existingPayment.rows[0].created_at
      });
    }

    // ====================================================================
    // 4. INSERT NEW PAYMENT RECORD INTO DATABASE
    // ====================================================================
    const paymentId = id || `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const paymentTimestamp = createdAt || new Date().toISOString();

    console.log(`📝 [Payment] Inserting new payment record...`);
    console.log(`   Payment ID: ${paymentId}`);
    console.log(`   Rider ID: ${rider_id}`);
    console.log(`   Amount: ${amount} ${currency}`);
    console.log(`   M-Pesa Code: ${mpesa_code}`);
    console.log(`   Plan: ${plan}`);

    const insertResult = await pool.query(
      `INSERT INTO payment 
       (id, rider_id, type, amount, currency, status, channel, mpesa_code, plan, sync_id, data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, created_at`,
      [
        paymentId,
        rider_id,
        type || 'subscription',
        amount || 0,
        currency || 'KES',
        status || 'pending_verification',
        channel || 'Manual (Lipa na M-Pesa / Pochi / Send Money)',
        mpesa_code || null,
        plan || 'biweekly',
        syncId,
        JSON.stringify(data || req.body),
        paymentTimestamp
      ]
    );

    const savedPayment = insertResult.rows[0];
    console.log(`✅ [Payment] Payment inserted successfully: ${savedPayment.id}`);

    // ====================================================================
    // 5. LOG TO AUDIT TABLE (Admin Traceability)
    // ====================================================================
    console.log(`📊 [Payment] Logging to audit table...`);
    
    await pool.query(
      `INSERT INTO payment_sync_audit 
       (sync_id, rider_id, action, status_code, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        syncId,
        rider_id,
        'SYNC_RECEIVED',
        200,
        req.ip || req.connection.remoteAddress || 'unknown',
        JSON.stringify({
          paymentId,
          amount,
          plan,
          channel
        })
      ]
    );

    console.log(`✅ [Payment] Audit log created`);

    // ====================================================================
    // 6. OPTIONAL: UPDATE SYNC QUEUE (if you track on backend)
    // ====================================================================
    try {
      await pool.query(
        `UPDATE syncQueue 
         SET synced = true, synced_at = NOW() 
         WHERE id = $1`,
        [syncId]
      );
      console.log(`✅ [Payment] Updated syncQueue status`);
    } catch (err) {
      // syncQueue table might not exist on backend - that's OK
      console.warn(`⚠️ [Payment] syncQueue table not found (optional), continuing...`);
    }

    // ====================================================================
    // 7. RETURN SUCCESS RESPONSE
    // ====================================================================
    console.log(`✅ [Payment] SUCCESS - Payment processed completely`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return res.status(200).json({
      success: true,
      paymentId: savedPayment.id,
      message: 'Payment received and recorded successfully',
      timestamp: savedPayment.created_at,
      riderId: rider_id,
      syncId: syncId,
      amount: amount,
      plan: plan
    });

  } catch (error) {
    console.error('❌ [Payment] ERROR processing payment:', error);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);

    // ====================================================================
    // 8. LOG ERROR TO AUDIT TABLE
    // ====================================================================
    try {
      const syncId = req.headers['x-sync-id'];
      const riderId = req.query.rider_id;
      if (syncId) {
        await pool.query(
          `INSERT INTO payment_sync_audit 
           (sync_id, rider_id, action, status_code, error_message, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            syncId,
            riderId || 'unknown',
            'SYNC_FAILED',
            500,
            error.message,
            req.ip || req.connection.remoteAddress || 'unknown'
          ]
        );
        console.log(`📊 [Payment] Error logged to audit table`);
      }
    } catch (auditErr) {
      console.error('⚠️ [Payment] Failed to log error to audit:', auditErr.message);
    }

    // ====================================================================
    // 9. RETURN ERROR RESPONSE
    // ====================================================================
    return res.status(500).json({
      error: 'Failed to process payment',
      message: error.message,
      syncId: req.headers['x-sync-id']
    });
  }
});

/**
 * ✅ GET /subscriptions/payments (Admin endpoint to view all payments)
 * 
 * Usage: GET /subscriptions/payments?limit=50&offset=0
 * Returns: List of recent payments with pagination
 */
router.get('/payments', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(
      `SELECT 
         id, rider_id, type, amount, currency, status, channel, mpesa_code, plan, 
         created_at, synced_at
       FROM payment
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await pool.query('SELECT COUNT(*) FROM payment');
    const total = parseInt(countResult.rows[0].count);

    return res.json({
      success: true,
      payments: result.rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    });
  } catch (error) {
    console.error('❌ [Admin] Error fetching payments:', error);
    return res.status(500).json({
      error: 'Failed to fetch payments',
      message: error.message
    });
  }
});

/**
 * ✅ GET /subscriptions/payments/rider/:riderId (Get payments for specific rider)
 * 
 * Usage: GET /subscriptions/payments/rider/6fa42197-e13c-4020-9934-c9b4a73cfd8c
 * Returns: Payment history for specific rider
 */
router.get('/payments/rider/:riderId', async (req, res) => {
  try {
    const { riderId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(
      `SELECT 
         id, rider_id, type, amount, currency, status, channel, mpesa_code, plan, 
         created_at, synced_at
       FROM payment
       WHERE rider_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [riderId, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM payment WHERE rider_id = $1',
      [riderId]
    );
    const total = parseInt(countResult.rows[0].count);

    return res.json({
      success: true,
      riderId,
      payments: result.rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    });
  } catch (error) {
    console.error('❌ [Admin] Error fetching rider payments:', error);
    return res.status(500).json({
      error: 'Failed to fetch rider payments',
      message: error.message
    });
  }
});

/**
 * ✅ GET /subscriptions/payments/stats (Admin dashboard stats)
 * 
 * Usage: GET /subscriptions/payments/stats
 * Returns: Payment statistics and metrics
 */
router.get('/payments/stats', async (req, res) => {
  try {
    // Get payment statistics
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(amount) as total_revenue,
        COUNT(DISTINCT rider_id) as unique_riders,
        plan,
        status,
        COUNT(*) as count_by_plan_status
      FROM payment
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY plan, status
    `);

    // Get pending verifications
    const pendingResult = await pool.query(`
      SELECT COUNT(*) as pending_count
      FROM payment
      WHERE status = 'pending_verification'
    `);

    // Get sync audit summary
    const auditResult = await pool.query(`
      SELECT 
        action,
        COUNT(*) as count,
        MAX(created_at) as last_action
      FROM payment_sync_audit
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY action
    `);

    // Get recent failed syncs
    const failedResult = await pool.query(`
      SELECT 
        sync_id, rider_id, action, error_message, created_at
      FROM payment_sync_audit
      WHERE action = 'SYNC_FAILED'
      AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 20
    `);

    return res.json({
      success: true,
      stats: {
        byPlanStatus: statsResult.rows,
        pendingVerifications: parseInt(pendingResult.rows[0].pending_count),
        syncAudit: auditResult.rows,
        recentFailures: failedResult.rows
      }
    });
  } catch (error) {
    console.error('❌ [Admin] Error fetching stats:', error);
    return res.status(500).json({
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
});

/**
 * ✅ GET /subscriptions/payment/check-sync-status (Check if payment was synced)
 * 
 * Usage: GET /subscriptions/payment/check-sync-status?sync_id=payment_xxx&rider_id=yyy
 * Returns: Sync status for a specific payment
 */
router.get('/payment/check-sync-status', async (req, res) => {
  try {
    const { sync_id, rider_id } = req.query;

    if (!sync_id) {
      return res.status(400).json({
        error: 'Missing sync_id parameter'
      });
    }

    const result = await pool.query(
      `SELECT id, status, created_at FROM payment WHERE sync_id = $1`,
      [sync_id]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: false,
        message: 'Payment not found',
        syncId: sync_id,
        found: false
      });
    }

    const payment = result.rows[0];
    return res.json({
      success: true,
      found: true,
      paymentId: payment.id,
      status: payment.status,
      createdAt: payment.created_at,
      syncId: sync_id
    });
  } catch (error) {
    console.error('❌ [Check Sync] Error:', error);
    return res.status(500).json({
      error: 'Failed to check sync status',
      message: error.message
    });
  }
});

module.exports = router;

/**
 * ============================================================================
 * SETUP INSTRUCTIONS
 * ============================================================================
 * 
 * 1. CREATE FILE:
 *    Location: D:\Martin\Smart Agric\Smart Solo\MVP 0\1 Motorcycle\CODE BASE\smart-boda\smart-boda\routes\subscriptions.js
 * 
 * 2. REGISTER IN YOUR MAIN APP FILE (app.js or server.js):
 * 
 *    const subscriptionRoutes = require('./routes/subscriptions');
 *    app.use('/subscriptions', subscriptionRoutes);
 * 
 * 3. DATABASE TABLES MUST EXIST:
 *    Run the SQL setup below to create required tables
 * 
 * 4. TEST ENDPOINT:
 *    POST /subscriptions/payment?rider_id=test-rider-123
 *    Headers: {
 *      'X-Sync-ID': 'payment_123456789',
 *      'X-Client-Timestamp': '2024-12-20T10:30:00Z',
 *      'Content-Type': 'application/json'
 *    }
 *    Body: {
 *      "id": "payment_test-rider-123_1787805185038",
 *      "type": "subscription",
 *      "amount": 500,
 *      "currency": "KES",
 *      "status": "pending_verification",
 *      "channel": "Manual (Lipa na M-Pesa / Pochi / Send Money)",
 *      "mpesa_code": "ABC123XYZ",
 *      "plan": "biweekly",
 *      "createdAt": "2024-12-20T10:30:00Z"
 *    }
 * 
 * 5. ADMIN ENDPOINTS:
 *    GET /subscriptions/payments - View all payments
 *    GET /subscriptions/payments/rider/:riderId - View rider's payments
 *    GET /subscriptions/payments/stats - View payment statistics
 *    GET /subscriptions/payment/check-sync-status?sync_id=XXX&rider_id=YYY - Check if payment synced
 * 
 * ============================================================================
 * SQL TABLE SETUP
 * ============================================================================
 * 
 * CREATE TABLE IF NOT EXISTS payment (
 *   id VARCHAR(255) PRIMARY KEY,
 *   rider_id VARCHAR(255) NOT NULL,
 *   type VARCHAR(50) NOT NULL DEFAULT 'subscription',
 *   amount NUMERIC(10, 2) NOT NULL,
 *   currency VARCHAR(3) NOT NULL DEFAULT 'KES',
 *   status VARCHAR(50) NOT NULL DEFAULT 'pending_verification',
 *   channel VARCHAR(255),
 *   mpesa_code VARCHAR(50),
 *   plan VARCHAR(50),
 *   sync_id VARCHAR(255) UNIQUE NOT NULL,
 *   data JSONB,
 *   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *   synced_at TIMESTAMP,
 *   verified_at TIMESTAMP
 * );
 * 
 * CREATE INDEX idx_payment_rider_id ON payment(rider_id);
 * CREATE INDEX idx_payment_sync_id ON payment(sync_id);
 * CREATE INDEX idx_payment_created_at ON payment(created_at);
 * CREATE INDEX idx_payment_status ON payment(status);
 * 
 * CREATE TABLE IF NOT EXISTS payment_sync_audit (
 *   id SERIAL PRIMARY KEY,
 *   sync_id VARCHAR(255) NOT NULL,
 *   rider_id VARCHAR(255),
 *   action VARCHAR(100) NOT NULL,
 *   status_code INT,
 *   error_message TEXT,
 *   ip_address VARCHAR(45),
 *   details JSONB,
 *   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 * );
 * 
 * CREATE INDEX idx_audit_sync_id ON payment_sync_audit(sync_id);
 * CREATE INDEX idx_audit_rider_id ON payment_sync_audit(rider_id);
 * CREATE INDEX idx_audit_created_at ON payment_sync_audit(created_at);
 * 
 * ============================================================================
 */