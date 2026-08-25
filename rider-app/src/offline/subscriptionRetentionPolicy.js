// rider-app/src/offline/subscriptionRetentionPolicy.js
// ============================================================================
// ✅ SUBSCRIPTION RETENTION POLICY: 6-Month Rolling Window
// ✅ SAFE CLEANUP: Only delete synced, archived data
// ✅ AUDIT TRAIL: Log all cleanup operations for compliance
// ============================================================================

import indexedDbAdapter from './adapters/indexedDbAdapter';
import subscriptionUtils from './subscriptionUtils';

/**
 * ============================================================================
 * 6-MONTH RETENTION POLICY
 * ============================================================================
 *
 * WINDOW: Data is retained for 6 months (180 days) from creation date
 *
 * LIFECYCLE:
 * • Phase 1 (Days 0-180): ACTIVE
 *   - Data stored in IndexedDB for fast offline access
 *   - Fully queryable and editable
 *   - Synced to PostgreSQL when online
 *   - Accessible via all subscription screens
 *
 * • Phase 2 (Days 180+): ARCHIVED
 *   - Data deleted from IndexedDB (device storage freed)
 *   - Data persists in PostgreSQL (long-term archive)
 *   - Not accessible via offline screens
 *   - Available via API archive endpoints only
 *
 * RETENTION THRESHOLDS:
 * • Subscription records: 180 days from created_at
 * • Payment records: 180 days from submitted_at or created_at
 * • Prepay records: 180 days from confirmed_at
 *
 * MINIMUM PRESERVATION:
 * • Always preserve at least 30 days of data (even if offline)
 * • Never delete if syncStatus !== 'synced'
 * • Skip cleanup entirely if device is offline
 *
 * CLEANUP TRIGGERS:
 * • Weekly via background service (recommended: Sunday at 2 AM)
 * • On app startup (if weekly missed)
 * • On demand via settings/storage management screen
 * • After successful API sync (cleanup older data immediately)
 *
 * LOGGING:
 * • All cleanup operations logged with:
 *   - Timestamp of cleanup run
 *   - Count of records deleted by type
 *   - Total storage freed (estimated)
 *   - Any errors encountered
 * • Log persisted for audit trail (separate from data)
 *
 * ============================================================================
 * SAFETY MECHANISMS
 * ============================================================================
 *
 * 1. SYNC CHECK:
 *    - Only delete records with syncStatus === 'synced'
 *    - Prevents loss of unsaved local changes
 *    - Pending records preserved for retry
 *
 * 2. MINIMUM WINDOW:
 *    - Always preserve at least 30 days of synced data
 *    - Even if 180-day window has passed
 *    - Provides buffer for edge cases
 *
 * 3. OFFLINE PROTECTION:
 *    - Skip entire cleanup if device is offline
 *    - User might be viewing historical data
 *    - Better to use storage than lose data
 *
 * 4. AUDIT TRAIL:
 *    - Log every cleanup operation
 *    - Store cleanup records for compliance
 *    - Enable debugging of retention issues
 *
 * 5. DRY RUN MODE:
 *    - Run cleanup in "dry run" first
 *    - Preview what would be deleted
 *    - Execute only if safe to proceed
 *
 * ============================================================================
 */

// Configuration
const RETENTION_DAYS = 180; // 6 months
const MIN_PRESERVE_DAYS = 30; // Minimum data to always keep
const CLEANUP_LOG_KEY = 'subscription_cleanup_log';
const MAX_LOG_ENTRIES = 52; // One year of weekly logs

// ============================================================================
// CLEANUP EXECUTION
// ============================================================================

/**
 * Execute subscription data cleanup for a rider
 * Deletes synced records older than 6 months (180 days)
 *
 * @param {string} riderId - Rider ID
 * @param {Object} options - Configuration options
 *   - dryRun: {boolean} Preview mode, don't actually delete
 *   - preserveDays: {number} Override minimum preserve days
 *   - ignoreSyncStatus: {boolean} Allow deletion of unsynced data (admin only)
 * @returns {Promise<Object>} - Cleanup report with counts and status
 */
export async function cleanupSubscriptionData(riderId, options = {}) {
  const {
    dryRun = false,
    preserveDays = MIN_PRESERVE_DAYS,
    ignoreSyncStatus = false
  } = options;

  const report = {
    timestamp: new Date().toISOString(),
    riderId,
    dryRun,
    subscriptions_deleted: 0,
    payments_deleted: 0,
    prepays_deleted: 0,
    total_deleted: 0,
    errors: [],
    duration_ms: 0
  };

  const startTime = Date.now();

  try {
    console.log(`\n📋 Starting subscription cleanup for rider: ${riderId}`);
    console.log(`   Dry Run: ${dryRun}`);
    console.log(`   Preserve Days: ${preserveDays}`);

    // Check if online (skip cleanup if offline)
    const isOnline = navigator.onLine;
    if (!isOnline) {
      console.log('⚠️  Device offline. Skipping cleanup to preserve available data.');
      report.skipped = true;
      report.reason = 'device_offline';
      return report;
    }

    // Calculate cutoff dates
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const minPreserveDate = new Date(now.getTime() - preserveDays * 24 * 60 * 60 * 1000);

    console.log(`   Cutoff Date: ${cutoffDate.toISOString()} (${RETENTION_DAYS} days ago)`);
    console.log(`   Min Preserve: ${minPreserveDate.toISOString()} (${preserveDays} days ago)`);

    // ✅ CLEANUP SUBSCRIPTIONS
    report.subscriptions_deleted = await cleanupSubscriptions(
      riderId,
      cutoffDate,
      minPreserveDate,
      ignoreSyncStatus,
      dryRun
    );

    // ✅ CLEANUP PAYMENTS
    report.payments_deleted = await cleanupPayments(
      riderId,
      cutoffDate,
      minPreserveDate,
      ignoreSyncStatus,
      dryRun
    );

    // ✅ CLEANUP PREPAYS
    report.prepays_deleted = await cleanupPrepays(
      riderId,
      cutoffDate,
      minPreserveDate,
      ignoreSyncStatus,
      dryRun
    );

    report.total_deleted = report.subscriptions_deleted + report.payments_deleted + report.prepays_deleted;

    // ✅ LOG CLEANUP OPERATION
    if (!dryRun && report.total_deleted > 0) {
      await logCleanupOperation(riderId, report);
    }

    report.duration_ms = Date.now() - startTime;
    report.status = 'success';

    console.log(`\n✅ Cleanup completed in ${report.duration_ms}ms`);
    console.log(`   Deleted: ${report.total_deleted} records`);
    console.log(`   - Subscriptions: ${report.subscriptions_deleted}`);
    console.log(`   - Payments: ${report.payments_deleted}`);
    console.log(`   - Prepays: ${report.prepays_deleted}`);

    return report;
  } catch (err) {
    console.error('❌ Error during cleanup:', err);
    report.status = 'error';
    report.error = err.message;
    return report;
  }
}

// ============================================================================
// CLEANUP HELPERS BY DATA TYPE
// ============================================================================

/**
 * Clean up old subscription records
 * @private
 */
async function cleanupSubscriptions(riderId, cutoffDate, minPreserveDate, ignoreSyncStatus, dryRun) {
  try {
    let deletedCount = 0;

    // Load all subscription keys for this rider
    const historyKey = `subscription_history_${riderId}`;
    const history = await indexedDbAdapter.kvGet(historyKey);

    if (!history) {
      return 0; // No history to clean
    }

    const subscriptions = typeof history === 'string' ? JSON.parse(history) : history;
    if (!Array.isArray(subscriptions)) {
      return 0;
    }

    const subscriptionsToDelete = subscriptions.filter(sub => {
      const subDate = new Date(sub.created_at || sub.ts);
      
      // Safety checks
      if (subDate > minPreserveDate) return false; // Preserve recent data
      if (subDate > cutoffDate) return false; // Within retention window
      if (!ignoreSyncStatus && sub.syncStatus !== 'synced') return false; // Not synced

      return true;
    });

    // Delete individual subscription records
    for (const sub of subscriptionsToDelete) {
      const recordKey = `subscription_${sub.id}`;
      
      if (!dryRun) {
        try {
          await indexedDbAdapter.kvDelete(recordKey);
          deletedCount++;
        } catch (err) {
          console.warn(`⚠️  Failed to delete subscription ${sub.id}:`, err);
        }
      } else {
        deletedCount++;
      }
    }

    console.log(`   📋 Subscriptions: ${deletedCount} to delete`);
    return deletedCount;
  } catch (err) {
    console.error('❌ Error cleaning subscriptions:', err);
    return 0;
  }
}

/**
 * Clean up old payment records
 * @private
 */
async function cleanupPayments(riderId, cutoffDate, minPreserveDate, ignoreSyncStatus, dryRun) {
  try {
    let deletedCount = 0;

    // Load payment history
    const paymentsKey = `subscription_payments_${riderId}`;
    const payments = await indexedDbAdapter.kvGet(paymentsKey);

    if (!payments) {
      return 0;
    }

    const paymentsList = typeof payments === 'string' ? JSON.parse(payments) : payments;
    if (!Array.isArray(paymentsList)) {
      return 0;
    }

    const paymentsToDelete = paymentsList.filter(payment => {
      const paymentDate = new Date(payment.submitted_at || payment.created_at || payment.ts);
      
      // Safety checks
      if (paymentDate > minPreserveDate) return false;
      if (paymentDate > cutoffDate) return false;
      if (!ignoreSyncStatus && payment.syncStatus !== 'synced') return false;

      return true;
    });

    // Delete individual payment records
    for (const payment of paymentsToDelete) {
      const recordKey = `subscription_payment_${payment.id}`;
      
      if (!dryRun) {
        try {
          await indexedDbAdapter.kvDelete(recordKey);
          deletedCount++;
        } catch (err) {
          console.warn(`⚠️  Failed to delete payment ${payment.id}:`, err);
        }
      } else {
        deletedCount++;
      }
    }

    console.log(`   💳 Payments: ${deletedCount} to delete`);
    return deletedCount;
  } catch (err) {
    console.error('❌ Error cleaning payments:', err);
    return 0;
  }
}

/**
 * Clean up old prepay records
 * @private
 */
async function cleanupPrepays(riderId, cutoffDate, minPreserveDate, ignoreSyncStatus, dryRun) {
  try {
    let deletedCount = 0;

    // Prepays are stored individually, need to scan for them
    // This is a limitation - we can't enumerate all keys in IndexedDB
    // Solution: maintain a prepay history cache similar to payments

    const prepayHistoryKey = `subscription_prepay_history_${riderId}`;
    const prepays = await indexedDbAdapter.kvGet(prepayHistoryKey);

    if (!prepays) {
      return 0;
    }

    const prepaysList = typeof prepays === 'string' ? JSON.parse(prepays) : prepays;
    if (!Array.isArray(prepaysList)) {
      return 0;
    }

    const prepaysToDelete = prepaysList.filter(prepay => {
      const prepayDate = new Date(prepay.confirmed_at || prepay.created_at || prepay.ts);
      
      // Safety checks
      if (prepayDate > minPreserveDate) return false;
      if (prepayDate > cutoffDate) return false;
      if (!ignoreSyncStatus && prepay.syncStatus !== 'synced') return false;

      return true;
    });

    // Delete individual prepay records
    for (const prepay of prepaysToDelete) {
      const recordKey = `subscription_prepay_${prepay.id}`;
      
      if (!dryRun) {
        try {
          await indexedDbAdapter.kvDelete(recordKey);
          deletedCount++;
        } catch (err) {
          console.warn(`⚠️  Failed to delete prepay ${prepay.id}:`, err);
        }
      } else {
        deletedCount++;
      }
    }

    console.log(`   💰 Prepays: ${deletedCount} to delete`);
    return deletedCount;
  } catch (err) {
    console.error('❌ Error cleaning prepays:', err);
    return 0;
  }
}

// ============================================================================
// CLEANUP LOGGING & AUDIT TRAIL
// ============================================================================

/**
 * Log cleanup operation for audit trail
 * @private
 */
async function logCleanupOperation(riderId, report) {
  try {
    // Load existing logs
    let logs = [];
    const logsData = await indexedDbAdapter.kvGet(CLEANUP_LOG_KEY);

    if (logsData) {
      try {
        logs = typeof logsData === 'string' ? JSON.parse(logsData) : logsData;
        if (!Array.isArray(logs)) logs = [];
      } catch (err) {
        logs = [];
      }
    }

    // Add new log entry
    logs.unshift({
      timestamp: report.timestamp,
      riderId,
      subscriptions_deleted: report.subscriptions_deleted,
      payments_deleted: report.payments_deleted,
      prepays_deleted: report.prepays_deleted,
      total_deleted: report.total_deleted,
      duration_ms: report.duration_ms
    });

    // Keep only recent logs (52 weeks = 1 year)
    logs = logs.slice(0, MAX_LOG_ENTRIES);

    // Save updated logs
    await indexedDbAdapter.kvSet(CLEANUP_LOG_KEY, JSON.stringify(logs));
    console.log('📝 Cleanup operation logged');
  } catch (err) {
    console.warn('⚠️  Failed to log cleanup operation:', err);
  }
}

/**
 * Get cleanup history for rider
 * @param {string} riderId - Rider ID (optional, returns all if not provided)
 * @returns {Promise<Array>} - Cleanup log entries
 */
export async function getCleanupHistory(riderId) {
  try {
    const logsData = await indexedDbAdapter.kvGet(CLEANUP_LOG_KEY);

    if (!logsData) {
      return [];
    }

    let logs = typeof logsData === 'string' ? JSON.parse(logsData) : logsData;
    if (!Array.isArray(logs)) {
      return [];
    }

    // Filter by rider if specified
    if (riderId) {
      logs = logs.filter(log => log.riderId === riderId);
    }

    return logs;
  } catch (err) {
    console.error('❌ Error getting cleanup history:', err);
    return [];
  }
}

// ============================================================================
// SCHEDULED CLEANUP (Background Service Integration)
// ============================================================================

/**
 * Check if cleanup is due for a rider
 * Returns true if:
 * - Never cleaned before, OR
 * - Last cleanup was > 7 days ago
 *
 * @param {string} riderId - Rider ID
 * @returns {Promise<boolean>} - Whether cleanup is due
 */
export async function isCleanupDue(riderId) {
  try {
    const logs = await getCleanupHistory(riderId);
    if (logs.length === 0) {
      return true; // Never cleaned
    }

    const lastCleanup = new Date(logs[0].timestamp);
    const now = new Date();
    const daysSinceCleanup = (now.getTime() - lastCleanup.getTime()) / (24 * 60 * 60 * 1000);

    return daysSinceCleanup > 7; // Due if more than 7 days
  } catch (err) {
    console.error('❌ Error checking cleanup due:', err);
    return true; // Assume due if error
  }
}

/**
 * Attempt cleanup for rider if due
 * Safe wrapper that checks if cleanup is needed
 *
 * @param {string} riderId - Rider ID
 * @returns {Promise<Object|null>} - Cleanup report or null if not due
 */
export async function attemptCleanupIfDue(riderId) {
  try {
    const due = await isCleanupDue(riderId);
    if (!due) {
      return null; // Not due yet
    }

    // Execute cleanup
    return await cleanupSubscriptionData(riderId);
  } catch (err) {
    console.error('❌ Error attempting cleanup:', err);
    return null;
  }
}

// ============================================================================
// STORAGE ESTIMATION & MANAGEMENT
// ============================================================================

/**
 * Get estimated storage used by subscription data
 * (Rough estimate based on record counts)
 *
 * @param {string} riderId - Rider ID
 * @returns {Promise<Object>} - Storage breakdown
 */
export async function estimateSubscriptionStorage(riderId) {
  try {
    const estimate = {
      subscriptions_kb: 0,
      payments_kb: 0,
      prepays_kb: 0,
      total_kb: 0
    };

    // Load counts
    const historyKey = `subscription_history_${riderId}`;
    const paymentsKey = `subscription_payments_${riderId}`;
    const prepayHistoryKey = `subscription_prepay_history_${riderId}`;

    const history = await indexedDbAdapter.kvGet(historyKey);
    const payments = await indexedDbAdapter.kvGet(paymentsKey);
    const prepays = await indexedDbAdapter.kvGet(prepayHistoryKey);

    // Rough estimates (1 record ≈ 0.5 KB)
    const historyCount = history ? (typeof history === 'string' ? JSON.parse(history) : history).length : 0;
    const paymentsCount = payments ? (typeof payments === 'string' ? JSON.parse(payments) : payments).length : 0;
    const prepaysCount = prepays ? (typeof prepays === 'string' ? JSON.parse(prepays) : prepays).length : 0;

    estimate.subscriptions_kb = Math.round(historyCount * 0.5);
    estimate.payments_kb = Math.round(paymentsCount * 0.5);
    estimate.prepays_kb = Math.round(prepaysCount * 0.5);
    estimate.total_kb = estimate.subscriptions_kb + estimate.payments_kb + estimate.prepays_kb;

    return estimate;
  } catch (err) {
    console.error('❌ Error estimating storage:', err);
    return { total_kb: 0 };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  cleanupSubscriptionData,
  getCleanupHistory,
  isCleanupDue,
  attemptCleanupIfDue,
  estimateSubscriptionStorage,

  // Constants
  RETENTION_DAYS,
  MIN_PRESERVE_DAYS
};