// admin-console/src/api/subscriptionManagement.js
/**
 * SUBSCRIPTION MANAGEMENT API
 * Admin endpoints for managing rider subscriptions, prepay, and reports
 */

import client from './client';

// ============================================
// SUBSCRIPTION STATUS FUNCTIONS
// ============================================

/**
 * List all subscriptions with status
 * GET /admin/subscription/list
 */
export async function listSubscriptions(filters = {}) {
  try {
    const response = await client.get('/admin/subscription/list', { params: filters });
    return response.data || [];
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    throw error;
  }
}

/**
 * Get detailed subscription info for a rider
 * GET /admin/subscription/rider?rider_id=<uuid>
 */
export async function getSubscriptionDetails(riderId) {
  try {
    const response = await client.get('/admin/subscription/rider', {
      params: { rider_id: riderId }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching subscription details:', error);
    throw error;
  }
}

/**
 * Get rider profile for subscription management
 * GET /admin/subscription/rider-profile?rider_id=<uuid>
 * 
 * Returns:
 * {
 *   rider_id: UUID,
 *   full_name: string,
 *   mobile_number: string,
 *   email: string,
 *   bike_plate: string,
 *   bike_model: string
 * }
 */
export async function getRiderProfile(riderId) {
  try {
    const response = await client.get('/admin/subscription/rider-profile', {
      params: { rider_id: riderId }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching rider profile:', error);
    throw error;
  }
}

/**
 * Get subscription status dashboard stats
 * GET /admin/subscription/stats
 */
export async function getSubscriptionStats() {
  try {
    const response = await client.get('/admin/subscription/stats');
    return response.data;
  } catch (error) {
    console.error('Error fetching subscription stats:', error);
    throw error;
  }
}

/**
 * Search subscriptions by rider name, email, or phone
 * GET /admin/subscription/search?q=<query>
 */
export async function searchSubscriptions(query) {
  try {
    const response = await client.get('/admin/subscription/search', {
      params: { q: query }
    });
    return response.data || [];
  } catch (error) {
    console.error('Error searching subscriptions:', error);
    throw error;
  }
}

/**
 * Filter subscriptions by status
 * GET /admin/subscription/filter?status=<active|inactive|expired>&period=<7d|30d|90d|all>
 */
export async function filterSubscriptions(status, period = 'all') {
  try {
    const response = await client.get('/admin/subscription/filter', {
      params: { status, period }
    });
    return response.data || [];
  } catch (error) {
    console.error('Error filtering subscriptions:', error);
    throw error;
  }
}

// ============================================
// SUBSCRIPTION MANAGEMENT FUNCTIONS
// ============================================

/**
 * Enable/Activate a subscription
 * POST /admin/subscription/enable
 */
export async function enableSubscription(riderId, notes = '') {
  try {
    const response = await client.post('/admin/subscription/enable', {
      rider_id: riderId,
      admin_notes: notes
    });
    return response.data;
  } catch (error) {
    console.error('Error enabling subscription:', error);
    throw error;
  }
}

/**
 * Disable/Suspend a subscription
 * POST /admin/subscription/disable
 */
export async function disableSubscription(riderId, reason, notes = '') {
  try {
    const response = await client.post('/admin/subscription/disable', {
      rider_id: riderId,
      reason: reason,
      admin_notes: notes
    });
    return response.data;
  } catch (error) {
    console.error('Error disabling subscription:', error);
    throw error;
  }
}

/**
 * Extend subscription end date
 * POST /admin/subscription/extend
 */
export async function extendSubscription(riderId, days, notes = '') {
  try {
    const response = await client.post('/admin/subscription/extend', {
      rider_id: riderId,
      extension_days: days,
      admin_notes: notes
    });
    return response.data;
  } catch (error) {
    console.error('Error extending subscription:', error);
    throw error;
  }
}

/**
 * Manually process prepay charge
 * POST /admin/subscription/process-prepay
 */
export async function processPrepayCharge(riderId, amount, notes = '') {
  try {
    const response = await client.post('/admin/subscription/process-prepay', {
      rider_id: riderId,
      amount: amount,
      admin_notes: notes
    });
    return response.data;
  } catch (error) {
    console.error('Error processing prepay charge:', error);
    throw error;
  }
}

/**
 * Refund a subscription charge
 * POST /admin/subscription/refund
 */
export async function refundSubscriptionCharge(riderId, amount, reason, notes = '') {
  try {
    const response = await client.post('/admin/subscription/refund', {
      rider_id: riderId,
      amount: amount,
      reason: reason,
      admin_notes: notes
    });
    return response.data;
  } catch (error) {
    console.error('Error refunding subscription charge:', error);
    throw error;
  }
}

/**
 * Adjust prepay balance
 * POST /admin/subscription/adjust-prepay
 */
export async function adjustPrepayBalance(riderId, amount, reason, notes = '') {
  try {
    const response = await client.post('/admin/subscription/adjust-prepay', {
      rider_id: riderId,
      amount: amount,
      reason: reason,
      admin_notes: notes
    });
    return response.data;
  } catch (error) {
    console.error('Error adjusting prepay balance:', error);
    throw error;
  }
}

/**
 * Get prepay transaction history
 * GET /admin/subscription/prepay-history?rider_id=<uuid>
 */
export async function getPrepayHistory(riderId) {
  try {
    const response = await client.get('/admin/subscription/prepay-history', {
      params: { rider_id: riderId }
    });
    return response.data || [];
  } catch (error) {
    console.error('Error fetching prepay history:', error);
    throw error;
  }
}

/**
 * Get subscription audit log
 * GET /admin/subscription/audit-log?rider_id=<uuid>
 */
export async function getSubscriptionAuditLog(riderId) {
  try {
    const response = await client.get('/admin/subscription/audit-log', {
      params: { rider_id: riderId }
    });
    return response.data || [];
  } catch (error) {
    console.error('Error fetching audit log:', error);
    throw error;
  }
}

// ============================================
// SUBSCRIPTION REPORTS FUNCTIONS
// ============================================

/**
 * Get subscription revenue report
 * GET /admin/subscription/revenue-report?period=<7d|30d|90d|365d>&breakdown=<daily|weekly|monthly>
 */
export async function getRevenueReport(period = '30d', breakdown = 'daily') {
  try {
    const response = await client.get('/admin/subscription/revenue-report', {
      params: { period, breakdown }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching revenue report:', error);
    throw error;
  }
}

/**
 * Get churn analysis report
 * GET /admin/subscription/churn-report?period=<7d|30d|90d|365d>
 * 
 * Returns:
 * {
 *   total_churned: number,
 *   churn_rate: number (percentage),
 *   reasons: { reason: count },
 *   top_churn_cohorts: [{cohort, rate}, ...],
 *   retention_rate: number
 * }
 */
export async function getChurnReport(period = '30d') {
  try {
    const response = await client.get('/admin/subscription/churn-report', {
      params: { period }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching churn report:', error);
    throw error;
  }
}

/**
 * Get subscription growth report
 * GET /admin/subscription/growth-report?period=<7d|30d|90d|365d>
 */
export async function getGrowthReport(period = '30d') {
  try {
    const response = await client.get('/admin/subscription/growth-report', {
      params: { period }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching growth report:', error);
    throw error;
  }
}

/**
 * Get prepay report
 * GET /admin/subscription/prepay-report?period=<7d|30d|90d|365d>
 */
export async function getPrepayReport(period = '30d') {
  try {
    const response = await client.get('/admin/subscription/prepay-report', {
      params: { period }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching prepay report:', error);
    throw error;
  }
}

/**
 * Get subscriber cohort analysis
 * GET /admin/subscription/cohort-analysis?groupBy=<signup_month|payment_method|platform>
 */
export async function getCohortAnalysis(groupBy = 'signup_month') {
  try {
    const response = await client.get('/admin/subscription/cohort-analysis', {
      params: { group_by: groupBy }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching cohort analysis:', error);
    throw error;
  }
}

/**
 * Get subscriber lifetime value (LTV) analysis
 * GET /admin/subscription/ltv-analysis
 */
export async function getLtvAnalysis() {
  try {
    const response = await client.get('/admin/subscription/ltv-analysis');
    return response.data;
  } catch (error) {
    console.error('Error fetching LTV analysis:', error);
    throw error;
  }
}

/**
 * Export subscription report (CSV/PDF)
 * GET /admin/subscription/export?format=<csv|pdf>&report_type=<revenue|churn|growth|prepay>&period=<7d|30d|90d|365d>
 */
export async function exportSubscriptionReport(format = 'csv', reportType = 'revenue', period = '30d') {
  try {
    const response = await client.get('/admin/subscription/export', {
      params: {
        format,
        report_type: reportType,
        period
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error exporting subscription report:', error);
    throw error;
  }
}

/**
 * Get failing payment report
 * GET /admin/subscription/failing-payments?status=<pending|retrying|failed>
 */
export async function getFailingPaymentsReport(status = 'failed') {
  try {
    const response = await client.get('/admin/subscription/failing-payments', {
      params: { status }
    });
    return response.data || [];
  } catch (error) {
    console.error('Error fetching failing payments report:', error);
    throw error;
  }
}