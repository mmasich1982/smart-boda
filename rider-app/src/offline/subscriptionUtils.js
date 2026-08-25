// rider-app/src/offline/subscriptionUtils.js
// ============================================================================
// ✅ SUBSCRIPTION UTILITY FUNCTIONS: IndexedDB-First Operations
// ✅ RETENTION POLICY: 6-month rolling window compliance
// ✅ PATTERN: Mirrors financialPerformanceUtils.js for consistency
// ============================================================================

import indexedDbAdapter from './adapters/indexedDbAdapter';

/**
 * ============================================================================
 * SUBSCRIPTION STORAGE ARCHITECTURE (IndexedDB-First Pattern)
 * ============================================================================
 *
 * CACHE KEYS BY DATA TYPE:
 * ───────────────────────
 *
 * SUBSCRIPTION RECORDS:
 * • subscription_${subscriptionId}: Individual subscription record
 *   Format: { id, rider_id, frequency, price, status, expiry_at, days_left,
 *             ts, timestamp, created_at, syncStatus, locked, ... }
 * • subscription_${riderId}: Current active subscription status
 *   Updated by FrequencySelectScreen & ConfirmSubscriptionScreen
 *   Accessed by SubscriptionScreen & banners
 * • subscription_history_${riderId}: Array of all subscription records
 *   Chronologically ordered (newest first)
 *   Updated on sync from API
 * • subscription_frequency_${riderId}: Last selected frequency preference
 *   Quick lookup for UI defaults
 *
 * PAYMENT RECORDS:
 * • subscription_payment_${paymentId}: Individual payment transaction
 *   Format: { id, rider_id, frequency, amount, status, mpesa_code,
 *             submitted_at, verified_at, ts, timestamp, syncStatus, ... }
 * • subscription_payments_${riderId}: Array of all payment records
 *   Chronologically ordered (newest first)
 *   Accessed by PaymentHistoryScreen
 *   Updated by payment processing screens
 * • subscription_payment_pending_${riderId}: Current pending payment status
 *   Used to show PaymentPendingBanner
 *
 * RENEWAL/PREPAY RECORDS:
 * • subscription_prepay_${prepayId}: Prepayment/renewal record
 *   Format: { id, rider_id, days, total, new_expiry_at, current_expiry_at,
 *             confirmed_at, ts, timestamp, syncStatus, ... }
 * • prepay_pending_${riderId}: Current pending prepay
 *   Used to track prepayment flow state
 *
 * SUMMARY RECORDS:
 * • subscription_summary_${riderId}: Subscription metrics summary
 *   Format: { current_status, days_left, expiry_at, days_until_expiry,
 *             total_spent, total_renewals, latest_payment_date,
 *             has_ever_paid, trial_status, is_trial_user, ... }
 * • subscription_stats_${riderId}: Subscription statistics
 *   Format: { renewal_count, payment_count, average_renewal_interval,
 *             total_subscriptions, last_renewal_date, ... }
 *
 * TRIAL DATA:
 * • trial_status_${riderId}: Trial progress tracking
 *   Format: { active, days_remaining, started_at, expires_at,
 *             days_left, is_trial_user, notification_shown_at }
 * • trial_notification_shown_${riderId}: Trial end notification state
 *   Format: { shown_at, dismissed }
 *
 * ============================================================================
 * RETENTION POLICY (6-MONTH ROLLING WINDOW)
 * ============================================================================
 *
 * RETENTION WINDOW: 6 months from first subscription date or onboarding
 * 
 * LIFECYCLE:
 * • Phase 1 (Days 0-180): Active period
 *   - Data stored in IndexedDB for fast offline access
 *   - Fully queryable and viewable via screens
 *   - Synced to PostgreSQL when online
 *   - Used for calculations in subscription screens
 * 
 * • Phase 2 (Days 180+): Archive period
 *   - Data deleted from IndexedDB (device storage freed)
 *   - Data persists in PostgreSQL (long-term archive)
 *   - Not accessible via offline screens
 *   - Available via API if archive endpoints exist
 *
 * CLEANUP TRIGGERS:
 * • Automatic weekly via background service (subscriptionRetentionPolicy.js)
 * • On app startup (if weekly cleanup missed)
 * • On demand via storage management screen
 *
 * SAFETY CHECKS:
 * • Never delete unless syncStatus === 'synced'
 * • Preserve at least 30 days even if sync fails
 * • Skip cleanup if offline (user might be viewing old data)
 * • Log all cleanup operations with timestamp and count
 *
 * ============================================================================
 * USAGE PATTERNS
 * ============================================================================
 *
 * SELECT FREQUENCY (FrequencySelectScreen):
 *   1. Load subscription_frequency_${riderId} for default
 *   2. User selects frequency
 *   3. Save to subscription_frequency_${riderId} via kvSet
 *   4. Navigate to ConfirmSubscriptionScreen with selection
 *
 * CONFIRM SUBSCRIPTION (ConfirmSubscriptionScreen):
 *   1. Save payment record to subscription_payment_${paymentId}
 *   2. Update subscription_payment_pending_${riderId}
 *   3. Queue payment for sync via addToSyncQueue
 *   4. Try immediate sync if online
 *   5. Navigate to ConfirmPaymentScreen
 *
 * VIEW SUBSCRIPTION STATUS (SubscriptionScreen):
 *   1. Load subscription_${riderId} from cache
 *   2. Parse to get status, days_left, expiry_at
 *   3. Display current subscription details
 *   4. Check for warning banners (days_left <= 2)
 *   5. On refresh: reload from API and update cache
 *
 * VIEW PAYMENT HISTORY (PaymentHistoryScreen):
 *   1. Load subscription_payments_${riderId} array
 *   2. Sort chronologically (newest first)
 *   3. Display paginated list
 *   4. On refresh: fetch from API and update cache
 *
 * PREPAY/RENEWAL (PrepayScreen → ConfirmPrepayScreen):
 *   1. Save prepay record to subscription_prepay_${prepayId}
 *   2. Update prepay_pending_${riderId}
 *   3. Queue for sync
 *   4. Show prepayment confirmation
 *
 * UPDATE SUBSCRIPTION STATUS (via API sync):
 *   1. Fetch latest subscription from API
 *   2. Parse and validate
 *   3. Save to subscription_${riderId}
 *   4. Update subscription_summary_${riderId}
 *   5. Update subscription_history_${riderId} (append)
 *   6. Mark all related payments as synced
 *
 * ============================================================================
 */

// ============================================================================
// SUBSCRIPTION RECORD OPERATIONS
// ============================================================================

/**
 * Load subscription record from IndexedDB
 * @param {string} subscriptionId - Subscription ID or riderId for current subscription
 * @returns {Promise<Object|null>} - Subscription record or null
 */
export async function loadSubscriptionFromDb(subscriptionId) {
  try {
    const recordKey = `subscription_${subscriptionId}`;
    const data = await indexedDbAdapter.kvGet(recordKey);

    if (data) {
      return typeof data === 'string' ? JSON.parse(data) : data;
    }
    return null;
  } catch (err) {
    console.error('❌ Error loading subscription:', err);
    return null;
  }
}

/**
 * Save subscription record to IndexedDB
 * @param {string} subscriptionId - Subscription ID or riderId for current subscription
 * @param {Object} subscriptionData - Subscription record
 * @returns {Promise<boolean>} - Success status
 */
export async function saveSubscriptionToDb(subscriptionId, subscriptionData) {
  try {
    const recordKey = `subscription_${subscriptionId}`;
    await indexedDbAdapter.kvSet(recordKey, JSON.stringify(subscriptionData));
    console.log('✅ Subscription saved:', subscriptionId);
    return true;
  } catch (err) {
    console.error('❌ Error saving subscription:', err);
    return false;
  }
}

// ============================================================================
// SUBSCRIPTION PAYMENT OPERATIONS
// ============================================================================

/**
 * Load payment record from IndexedDB
 * @param {string} paymentId - Payment ID
 * @returns {Promise<Object|null>} - Payment record or null
 */
export async function loadPaymentFromDb(paymentId) {
  try {
    const recordKey = `subscription_payment_${paymentId}`;
    const data = await indexedDbAdapter.kvGet(recordKey);

    if (data) {
      return typeof data === 'string' ? JSON.parse(data) : data;
    }
    return null;
  } catch (err) {
    console.error('❌ Error loading payment:', err);
    return null;
  }
}

/**
 * Save payment record to IndexedDB
 * @param {string} paymentId - Payment ID
 * @param {Object} paymentData - Payment record
 * @returns {Promise<boolean>} - Success status
 */
export async function savePaymentToDb(paymentId, paymentData) {
  try {
    const recordKey = `subscription_payment_${paymentId}`;
    await indexedDbAdapter.kvSet(recordKey, JSON.stringify(paymentData));
    console.log('✅ Payment saved:', paymentId);
    return true;
  } catch (err) {
    console.error('❌ Error saving payment:', err);
    return false;
  }
}

/**
 * Load payment history cache for rider
 * @param {string} riderId - Rider ID
 * @returns {Promise<Array>} - Payment records (newest first)
 */
export async function loadPaymentHistoryCache(riderId) {
  try {
    const cacheKey = `subscription_payments_${riderId}`;
    const cachedData = await indexedDbAdapter.kvGet(cacheKey);
    let items = [];

    if (cachedData) {
      try {
        items = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        if (!Array.isArray(items)) items = [];
      } catch (parseErr) {
        console.warn('⚠️ Payment history cache parse error');
        items = [];
      }
    }

    return items;
  } catch (err) {
    console.error('❌ Error loading payment history cache:', err);
    return [];
  }
}

/**
 * Save payment history cache for rider
 * @param {string} riderId - Rider ID
 * @param {Array} payments - Payment records
 * @returns {Promise<boolean>} - Success status
 */
export async function savePaymentHistoryCache(riderId, payments) {
  try {
    const cacheKey = `subscription_payments_${riderId}`;

    // Ensure array and sort (newest first)
    const sorted = Array.isArray(payments)
      ? payments.sort((a, b) => {
          const bTs = b.ts || b.timestamp || 0;
          const aTs = a.ts || a.timestamp || 0;
          return bTs - aTs;
        })
      : [];

    await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(sorted));
    console.log('✅ Payment history cache saved for rider:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Error saving payment history cache:', err);
    return false;
  }
}

// ============================================================================
// PREPAY/RENEWAL OPERATIONS
// ============================================================================

/**
 * Load prepay record from IndexedDB
 * @param {string} prepayId - Prepay ID
 * @returns {Promise<Object|null>} - Prepay record or null
 */
export async function loadPrepayFromDb(prepayId) {
  try {
    const recordKey = `subscription_prepay_${prepayId}`;
    const data = await indexedDbAdapter.kvGet(recordKey);

    if (data) {
      return typeof data === 'string' ? JSON.parse(data) : data;
    }
    return null;
  } catch (err) {
    console.error('❌ Error loading prepay:', err);
    return null;
  }
}

/**
 * Save prepay record to IndexedDB
 * @param {string} prepayId - Prepay ID
 * @param {Object} prepayData - Prepay record
 * @returns {Promise<boolean>} - Success status
 */
export async function savePrepayToDb(prepayId, prepayData) {
  try {
    const recordKey = `subscription_prepay_${prepayId}`;
    await indexedDbAdapter.kvSet(recordKey, JSON.stringify(prepayData));
    console.log('✅ Prepay saved:', prepayId);
    return true;
  } catch (err) {
    console.error('❌ Error saving prepay:', err);
    return false;
  }
}

// ============================================================================
// SUBSCRIPTION FREQUENCY & PREFERENCES
// ============================================================================

/**
 * Load last selected frequency preference
 * @param {string} riderId - Rider ID
 * @returns {Promise<string|null>} - 'biweekly' | 'monthly' | null
 */
export async function loadFrequencyPreference(riderId) {
  try {
    const cacheKey = `subscription_frequency_${riderId}`;
    const data = await indexedDbAdapter.kvGet(cacheKey);

    if (data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return parsed.frequency || null;
    }
    return null;
  } catch (err) {
    console.error('❌ Error loading frequency preference:', err);
    return null;
  }
}

/**
 * Save frequency preference
 * @param {string} riderId - Rider ID
 * @param {string} frequency - 'biweekly' | 'monthly'
 * @returns {Promise<boolean>} - Success status
 */
export async function saveFrequencyPreference(riderId, frequency) {
  try {
    const cacheKey = `subscription_frequency_${riderId}`;
    await indexedDbAdapter.kvSet(
      cacheKey,
      JSON.stringify({
        frequency,
        saved_at: new Date().toISOString()
      })
    );
    console.log('✅ Frequency preference saved:', frequency);
    return true;
  } catch (err) {
    console.error('❌ Error saving frequency preference:', err);
    return false;
  }
}

// ============================================================================
// SUBSCRIPTION SUMMARY & AGGREGATION
// ============================================================================

/**
 * Get subscription summary for rider
 * @param {string} riderId - Rider ID
 * @returns {Promise<Object>} - Subscription summary
 */
export async function getSubscriptionSummary(riderId) {
  try {
    const summaryKey = `subscription_summary_${riderId}`;
    const cached = await indexedDbAdapter.kvGet(summaryKey);

    if (cached) {
      return typeof cached === 'string' ? JSON.parse(cached) : cached;
    }

    // Return empty summary if not cached
    return {
      current_status: 'unknown',
      days_left: 0,
      expiry_at: null,
      total_spent: 0,
      total_renewals: 0,
      has_ever_paid: false,
      is_trial_user: false,
      locked: false
    };
  } catch (err) {
    console.error('❌ Error getting subscription summary:', err);
    return null;
  }
}

/**
 * Save subscription summary
 * @param {string} riderId - Rider ID
 * @param {Object} summary - Summary data
 * @returns {Promise<boolean>} - Success status
 */
export async function saveSubscriptionSummary(riderId, summary) {
  try {
    const summaryKey = `subscription_summary_${riderId}`;
    await indexedDbAdapter.kvSet(summaryKey, JSON.stringify(summary));
    console.log('✅ Subscription summary saved for rider:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Error saving subscription summary:', err);
    return false;
  }
}

// ============================================================================
// TRIAL STATUS OPERATIONS
// ============================================================================

/**
 * Get trial status for rider
 * @param {string} riderId - Rider ID
 * @returns {Promise<Object>} - Trial status data
 */
export async function getTrialStatus(riderId) {
  try {
    const trialKey = `trial_status_${riderId}`;
    const cached = await indexedDbAdapter.kvGet(trialKey);

    if (cached) {
      return typeof cached === 'string' ? JSON.parse(cached) : cached;
    }

    return {
      active: false,
      days_remaining: 0,
      started_at: null,
      expires_at: null,
      is_trial_user: false
    };
  } catch (err) {
    console.error('❌ Error getting trial status:', err);
    return null;
  }
}

/**
 * Save trial status
 * @param {string} riderId - Rider ID
 * @param {Object} trialData - Trial status data
 * @returns {Promise<boolean>} - Success status
 */
export async function saveTrialStatus(riderId, trialData) {
  try {
    const trialKey = `trial_status_${riderId}`;
    await indexedDbAdapter.kvSet(trialKey, JSON.stringify(trialData));
    console.log('✅ Trial status saved for rider:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Error saving trial status:', err);
    return false;
  }
}

// ============================================================================
// CACHE INVALIDATION
// ============================================================================

/**
 * Invalidate subscription caches (called when subscription is updated)
 * @param {string} riderId - Rider ID
 * @returns {Promise<boolean>} - Success status
 */
export async function invalidateSubscriptionCaches(riderId) {
  try {
    const cacheKeys = [
      `subscription_${riderId}`,
      `subscription_summary_${riderId}`,
      `subscription_payments_${riderId}`,
      `subscription_stats_${riderId}`,
      `trial_status_${riderId}`
    ];

    for (const key of cacheKeys) {
      try {
        await indexedDbAdapter.kvDelete(key);
      } catch (err) {
        console.warn(`⚠️ Failed to invalidate cache key: ${key}`);
      }
    }

    console.log('✅ Invalidated subscription caches for rider:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Error invalidating subscription caches:', err);
    return false;
  }
}

// ============================================================================
// CACHE MANAGEMENT & SYNC
// ============================================================================

/**
 * Clear all subscription data for a rider (for testing/debugging)
 * @param {string} riderId - Rider ID
 * @returns {Promise<boolean>} - Success status
 */
export async function clearSubscriptionCacheForRider(riderId) {
  try {
    const cacheKeys = [
      `subscription_${riderId}`,
      `subscription_frequency_${riderId}`,
      `subscription_history_${riderId}`,
      `subscription_payments_${riderId}`,
      `subscription_payment_pending_${riderId}`,
      `subscription_summary_${riderId}`,
      `subscription_stats_${riderId}`,
      `trial_status_${riderId}`,
      `trial_notification_shown_${riderId}`,
      `prepay_pending_${riderId}`,
      `price_change_viewed_${riderId}`
    ];

    for (const key of cacheKeys) {
      try {
        await indexedDbAdapter.kvDelete(key);
      } catch (err) {
        console.warn(`⚠️ Failed to clear: ${key}`);
      }
    }

    console.log('✅ Cleared all subscription caches for rider:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Error clearing subscription cache:', err);
    return false;
  }
}

/**
 * Sync subscription data from API to local cache
 * @param {string} riderId - Rider ID
 * @param {Object} subscriptionData - Subscription data from API
 * @returns {Promise<boolean>} - Success status
 */
export async function syncSubscriptionFromApi(riderId, subscriptionData) {
  try {
    if (!subscriptionData || typeof subscriptionData !== 'object') {
      console.warn('⚠️ Invalid subscription data for sync');
      return false;
    }

    // Save current subscription
    await saveSubscriptionToDb(riderId, {
      ...subscriptionData,
      syncStatus: 'synced',
      synced_at: new Date().toISOString()
    });

    // Update summary cache
    const summary = {
      current_status: subscriptionData.status || 'unknown',
      days_left: subscriptionData.days_left || 0,
      expiry_at: subscriptionData.expiry_at,
      total_spent: subscriptionData.total_spent || 0,
      total_renewals: subscriptionData.total_renewals || 0,
      has_ever_paid: subscriptionData.has_ever_paid || false,
      is_trial_user: subscriptionData.is_trial_user || false,
      locked: subscriptionData.locked || false,
      synced_at: new Date().toISOString()
    };

    await saveSubscriptionSummary(riderId, summary);

    console.log('✅ Synced subscription from API for rider:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Error syncing subscription from API:', err);
    return false;
  }
}

/**
 * Sync payment data from API to local cache
 * @param {string} riderId - Rider ID
 * @param {Array} payments - Payment data from API
 * @returns {Promise<boolean>} - Success status
 */
export async function syncPaymentsFromApi(riderId, payments) {
  try {
    if (!Array.isArray(payments)) {
      console.warn('⚠️ Invalid payments data for sync');
      return false;
    }

    // Sort by timestamp (newest first)
    const sorted = payments.sort((a, b) => {
      const bTs = b.ts || b.timestamp || new Date(b.submitted_at).getTime() || 0;
      const aTs = a.ts || a.timestamp || new Date(a.submitted_at).getTime() || 0;
      return bTs - aTs;
    });

    // Save payment history cache
    await savePaymentHistoryCache(riderId, sorted);

    // Save individual payment records
    for (const payment of sorted) {
      await savePaymentToDb(payment.id, {
        ...payment,
        syncStatus: 'synced',
        synced_at: new Date().toISOString()
      });
    }

    console.log('✅ Synced', sorted.length, 'payments from API for rider:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Error syncing payments from API:', err);
    return false;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  // Subscription operations
  loadSubscriptionFromDb,
  saveSubscriptionToDb,

  // Payment operations
  loadPaymentFromDb,
  savePaymentToDb,
  loadPaymentHistoryCache,
  savePaymentHistoryCache,

  // Prepay operations
  loadPrepayFromDb,
  savePrepayToDb,

  // Preferences
  loadFrequencyPreference,
  saveFrequencyPreference,

  // Summary & aggregation
  getSubscriptionSummary,
  saveSubscriptionSummary,

  // Trial operations
  getTrialStatus,
  saveTrialStatus,

  // Cache management
  invalidateSubscriptionCaches,
  clearSubscriptionCacheForRider,
  syncSubscriptionFromApi,
  syncPaymentsFromApi
};