// admin-console/src/api/riderSupport.js
/**
 * RIDER SUPPORT API - PIN RECOVERY ENDPOINTS
 * ✅ UPDATED: Email-based PIN recovery flow
 * Handles queue management, rider profile, and PIN dispatch
 */

import client from './client';

/**
 * List all pending PIN recovery requests
 * GET /admin/pin-recovery/queue
 */
export async function listPinRecoveryQueue() {
  try {
    const response = await client.get('/admin/pin-recovery/queue');
    return response.data || [];
  } catch (error) {
    console.error('Error fetching PIN recovery queue:', error);
    throw error;
  }
}

/**
 * Get detailed rider profile for PIN recovery verification
 * GET /admin/pin-recovery/rider-profile?rider_id=<uuid>
 * 
 * Returns:
 * {
 *   rider_id: UUID,
 *   full_name: string,
 *   mobile_number: string,
 *   email: string,
 *   bike_plate: string,
 *   bike_model: string,
 *   registration_status: string,
 *   recent_trips: [{completed_at, fare_amount, payment_method, status}, ...]
 * }
 */
export async function getRiderProfile(riderId) {
  try {
    const response = await client.get('/admin/pin-recovery/rider-profile', {
      params: { rider_id: riderId }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching rider profile:', error);
    throw error;
  }
}

/**
 * Approve and send new PIN to rider via email
 * POST /admin/pin-recovery/send-pin
 * 
 * Sends:
 * {
 *   pin_recovery_id: string,
 *   rider_id: UUID,
 *   email: string,
 *   verification_notes: string (due diligence notes)
 * }
 * 
 * Returns:
 * {
 *   success: boolean,
 *   message: string,
 *   email_sent_at: timestamp,
 *   error?: string
 * }
 */
export async function sendPinByEmail(requestId, riderId, email, verificationNotes) {
  try {
    const response = await client.post('/admin/pin-recovery/send-pin', {
      pin_recovery_id: requestId,
      rider_id: riderId,
      email: email,
      verification_notes: verificationNotes
    });
    return response.data;
  } catch (error) {
    console.error('Error sending PIN:', error);
    throw error;
  }
}

/**
 * Get PIN recovery request details
 * GET /admin/pin-recovery/request?request_id=<id>
 */
export async function getPinRecoveryRequest(requestId) {
  try {
    const response = await client.get('/admin/pin-recovery/request', {
      params: { request_id: requestId }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching PIN recovery request:', error);
    throw error;
  }
}

/**
 * Reject a PIN recovery request (admin can deny if suspicious)
 * POST /admin/pin-recovery/reject
 */
export async function rejectPinRecovery(requestId, reason) {
  try {
    const response = await client.post('/admin/pin-recovery/reject', {
      pin_recovery_id: requestId,
      reason: reason
    });
    return response.data;
  } catch (error) {
    console.error('Error rejecting PIN recovery:', error);
    throw error;
  }
}

/**
 * Approve a PIN recovery request (legacy - use sendPinByEmail instead)
 * POST /admin/pin-recovery/approve
 */
export async function approvePinRecovery(id) {
  try {
    const response = await client.post('/admin/pin-recovery/approve', { id });
    return response.data;
  } catch (error) {
    console.error('Error approving PIN recovery:', error);
    throw error;
  }
}

/**
 * Get PIN recovery audit log
 * GET /admin/pin-recovery/audit-log?rider_id=<uuid>
 * 
 * Returns history of all PIN resets for a rider
 */
export async function getPinRecoveryAuditLog(riderId) {
  try {
    const response = await client.get('/admin/pin-recovery/audit-log', {
      params: { rider_id: riderId }
    });
    return response.data || [];
  } catch (error) {
    console.error('Error fetching PIN recovery audit log:', error);
    throw error;
  }
}

/**
 * Search PIN recovery requests by rider name, email, or phone
 * GET /admin/pin-recovery/search?q=<query>
 */
export async function searchPinRecoveryRequests(query) {
  try {
    const response = await client.get('/admin/pin-recovery/search', {
      params: { q: query }
    });
    return response.data || [];
  } catch (error) {
    console.error('Error searching PIN recovery requests:', error);
    throw error;
  }
}

/**
 * Get PIN recovery dashboard stats
 * GET /admin/pin-recovery/stats
 * 
 * Returns:
 * {
 *   pending_count: number,
 *   resolved_today: number,
 *   avg_resolution_time_hours: number,
 *   total_processed: number
 * }
 */
export async function getPinRecoveryStats() {
  try {
    const response = await client.get('/admin/pin-recovery/stats');
    return response.data;
  } catch (error) {
    console.error('Error fetching PIN recovery stats:', error);
    throw error;
  }
}

/**
 * Export PIN recovery audit log (CSV/PDF)
 * GET /admin/pin-recovery/export?format=csv|pdf&date_from=...&date_to=...
 */
export async function exportPinRecoveryLog(format = 'csv', dateFrom = null, dateTo = null) {
  try {
    const params = { format };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;

    const response = await client.get('/admin/pin-recovery/export', { params });
    return response.data;
  } catch (error) {
    console.error('Error exporting PIN recovery log:', error);
    throw error;
  }
}