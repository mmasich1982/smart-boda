// rider-app/src/utils/subscriptionGate_IndexedDBUtilities.js
// ============================================================================
// ENHANCED: subscriptionGate - IndexedDB Utilities & Sync Queue Management
// ✅ Local storage as source of truth
// ✅ Incremental sync to Render
// ✅ Sync queue with retry logic
// ============================================================================

import indexedDbAdapter from '../offline/adapters/indexedDbAdapter';
import api from '../api/client';

const LOCKED_STATUSES = new Set(['locked', 'expired']);
const NEVER_BLOCK_STATUSES = new Set([
  'active',
  'pending_verification',
  'free_trial'
]);

// ✅ Only two plans supported
export const SUBSCRIPTION_PLANS = {
  BIWEEKLY: {
    key: 'biweekly',
    label: 'Bi-Weekly',
    days: 14,
    price: 500,
    dailyPrice: 35.71
  },
  MONTHLY: {
    key: 'monthly',
    label: 'Monthly',
    days: 30,
    price: 1000,
    dailyPrice: 33.33
  }
};

// ============================================================================
// INDEXEDDB STORAGE KEYS (Organized & Consistent)
// ============================================================================

const STORE_KEYS = {
  subscription: (riderId) => `subscription_${riderId}`,
  trial: (riderId) => `trial_${riderId}`,
  paymentHistory: (riderId, pageNum) => `payment_history_${riderId}_page_${pageNum}`,
  priceChange: (planId) => `price_change_${planId}`,
  lockCheck: (riderId) => `lock_check_${riderId}`,
  syncQueue: (id) => `sync_queue_${id}`,
};

// ============================================================================
// SUBSCRIPTION STATUS (Local First)
// ============================================================================

/**
 * Get subscription status from local IndexedDB
 * Falls back to API if not cached
 */
export async function getSubscriptionStatusLocal(riderId) {
  try {
    // Try local first
    console.log('📂 Getting subscription from IndexedDB...');
    const cached = await indexedDbAdapter.kvGet(
      STORE_KEYS.subscription(riderId)
    );

    if (cached) {
      const { data, cached_at } = JSON.parse(cached);
      const age = Date.now() - new Date(cached_at).getTime();
      console.log(`✅ Found subscription (${Math.floor(age / 60000)} min old)`);
      return data;
    }

    // No local cache - try API
    console.log('📡 No local cache, fetching from API...');
    return await getSubscriptionStatusAPI(riderId);
  } catch (err) {
    console.error('❌ Error getting subscription status:', err);
    return null;
  }
}

/**
 * Get subscription status from API
 */
export async function getSubscriptionStatusAPI(riderId) {
  try {
    const response = await api.get('/subscription', {
      params: { rider_id: riderId },
      timeout: 5000
    });

    if (response?.data?.subscription) {
      const data = response.data.subscription;
      
      // Cache to IndexedDB
      await cacheSubscription(riderId, data);
      console.log('✅ Cached subscription from API to IndexedDB');
      
      return data;
    }
  } catch (err) {
    console.warn('⚠️ API subscription fetch failed:', err.message);
  }

  return null;
}

// ============================================================================
// SUBSCRIPTION CACHING (IndexedDB)
// ============================================================================

/**
 * Cache subscription data locally
 */
export async function cacheSubscription(riderId, subscriptionData) {
  try {
    await indexedDbAdapter.kvSet(
      STORE_KEYS.subscription(riderId),
      JSON.stringify({
        data: subscriptionData,
        cached_at: new Date().toISOString()
      })
    );
    console.log('💾 Subscription cached to IndexedDB');
    return true;
  } catch (err) {
    console.error('❌ Cache subscription error:', err);
    return false;
  }
}

/**
 * Get subscription from cache without API fallback
 */
export async function getSubscriptionFromCache(riderId) {
  try {
    const cached = await indexedDbAdapter.kvGet(
      STORE_KEYS.subscription(riderId)
    );
    if (cached) {
      const { data } = JSON.parse(cached);
      return data;
    }
    return null;
  } catch (err) {
    console.error('❌ Get from cache error:', err);
    return null;
  }
}

/**
 * Clear subscription cache
 */
export async function clearSubscriptionCache(riderId) {
  try {
    await indexedDbAdapter.kvDelete(STORE_KEYS.subscription(riderId));
    console.log('🗑️ Subscription cache cleared');
    return true;
  } catch (err) {
    console.error('❌ Clear cache error:', err);
    return false;
  }
}

// ============================================================================
// PAYMENT HISTORY (Local First)
// ============================================================================

/**
 * Cache payment history locally for offline access
 */
export async function cachePaymentHistory(riderId, payments, pageNum, totalPages) {
  try {
    await indexedDbAdapter.kvSet(
      STORE_KEYS.paymentHistory(riderId, pageNum),
      JSON.stringify({
        data: payments,
        totalPages,
        cached_at: new Date().toISOString()
      })
    );
    console.log(`💾 Cached ${payments.length} payments to IndexedDB`);
    return true;
  } catch (err) {
    console.error('❌ Cache payments error:', err);
    return false;
  }
}

/**
 * Get payment history from cache
 */
export async function getPaymentHistoryFromCache(riderId, pageNum) {
  try {
    const cached = await indexedDbAdapter.kvGet(
      STORE_KEYS.paymentHistory(riderId, pageNum)
    );
    if (cached) {
      const { data, totalPages } = JSON.parse(cached);
      return { data, totalPages };
    }
    return null;
  } catch (err) {
    console.error('❌ Get payments from cache error:', err);
    return null;
  }
}

// ============================================================================
// SYNC QUEUE (Incremental Sync to Render)
// ============================================================================

/**
 * Add item to sync queue (local actions waiting to sync)
 */
export async function addToSyncQueue(action, table, data, riderId) {
  try {
    const syncId = `${table}_${riderId}_${Date.now()}`;
    
    const queueItem = {
      id: syncId,
      action,            // 'pay', 'prepay', 'refresh', etc
      table,              // 'subscription', 'payment'
      data,
      riderId,
      attempt: 0,
      last_attempt_at: new Date().toISOString(),
      status: 'pending',  // 'pending', 'sent', 'failed'
      created_at: new Date().toISOString()
    };

    await indexedDbAdapter.kvSet(
      STORE_KEYS.syncQueue(syncId),
      JSON.stringify(queueItem)
    );

    console.log(`📤 Added to sync queue: ${action} (${syncId})`);
    return syncId;
  } catch (err) {
    console.error('❌ Add to sync queue error:', err);
    return null;
  }
}

/**
 * Get all pending sync items
 */
export async function getSyncQueue() {
  try {
    const allItems = {};
    
    // Use kvGetAll if available, otherwise iterate
    const items = await indexedDbAdapter.kvGetAll?.() || [];
    
    const pending = items
      .filter(([key]) => key.startsWith('sync_queue_'))
      .map(([key, value]) => JSON.parse(value))
      .filter(item => item.status === 'pending' || item.status === 'failed');

    return pending;
  } catch (err) {
    console.error('❌ Get sync queue error:', err);
    return [];
  }
}

/**
 * Process sync queue - send to Render
 */
export async function processSyncQueue() {
  const queue = await getSyncQueue();

  if (queue.length === 0) {
    console.log('✅ Sync queue is empty');
    return { successful: 0, failed: 0 };
  }

  console.log(`🔄 Processing ${queue.length} sync items...`);

  let successful = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      // Send incremental update to Render
      console.log(`📤 Syncing: ${item.action} (attempt ${item.attempt + 1})`);

      const response = await api.post('/subscription/sync', {
        action: item.action,
        table: item.table,
        data: item.data,
        timestamp: item.created_at,
        sync_id: item.id
      }, {
        timeout: 10000
      });

      if (response?.status === 200) {
        // Mark as synced
        item.status = 'sent';
        await indexedDbAdapter.kvSet(
          STORE_KEYS.syncQueue(item.id),
          JSON.stringify(item)
        );
        console.log(`✅ Synced: ${item.action}`);
        successful++;
      }
    } catch (err) {
      // Retry logic with exponential backoff
      const retryDelays = [60, 300, 900]; // 1m, 5m, 15m
      const maxAttempts = 3;

      item.attempt++;
      item.last_attempt_at = new Date().toISOString();

      if (item.attempt < maxAttempts) {
        item.status = 'pending';
        console.warn(
          `⚠️ Sync failed for ${item.action}. ` +
          `Retry ${item.attempt}/${maxAttempts} in ${retryDelays[item.attempt - 1]}s`
        );
      } else {
        item.status = 'failed';
        console.error(`❌ Sync failed after ${maxAttempts} attempts: ${item.action}`);
      }

      await indexedDbAdapter.kvSet(
        STORE_KEYS.syncQueue(item.id),
        JSON.stringify(item)
      );

      failed++;
    }
  }

  console.log(`📊 Sync complete: ${successful} successful, ${failed} failed`);
  return { successful, failed };
}

/**
 * Clear sync queue (after successful sync to backend)
 */
export async function clearSyncQueue() {
  try {
    const allItems = await indexedDbAdapter.kvGetAll?.() || [];
    
    for (const [key] of allItems) {
      if (key.startsWith('sync_queue_')) {
        await indexedDbAdapter.kvDelete(key);
      }
    }

    console.log('🗑️ Sync queue cleared');
    return true;
  } catch (err) {
    console.error('❌ Clear sync queue error:', err);
    return false;
  }
}

// ============================================================================
// LOCK CHECK CACHING (Daily Check Optimization)
// ============================================================================

/**
 * Cache lock check result (daily)
 */
export async function cacheLockCheckResult(riderId, isLocked) {
  try {
    await indexedDbAdapter.kvSet(
      STORE_KEYS.lockCheck(riderId),
      JSON.stringify({
        is_locked: isLocked,
        checked_at: new Date().toISOString()
      })
    );
    console.log(`💾 Cached lock status: ${isLocked ? '🔒' : '🔓'}`);
    return true;
  } catch (err) {
    console.error('❌ Cache lock check error:', err);
    return false;
  }
}

/**
 * Get cached lock status
 */
export async function getCachedLockStatus(riderId) {
  try {
    const cached = await indexedDbAdapter.kvGet(
      STORE_KEYS.lockCheck(riderId)
    );
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (err) {
    console.error('❌ Get cached lock status error:', err);
    return null;
  }
}

// ============================================================================
// TRIAL STATUS
// ============================================================================

/**
 * Cache trial status
 */
export async function cacheTrialStatus(riderId, trialData) {
  try {
    await indexedDbAdapter.kvSet(
      STORE_KEYS.trial(riderId),
      JSON.stringify({
        ...trialData,
        cached_at: new Date().toISOString()
      })
    );
    console.log('💾 Trial status cached');
    return true;
  } catch (err) {
    console.error('❌ Cache trial status error:', err);
    return false;
  }
}

/**
 * Get trial status from cache
 */
export async function getTrialStatusFromCache(riderId) {
  try {
    const cached = await indexedDbAdapter.kvGet(
      STORE_KEYS.trial(riderId)
    );
    if (cached) {
      const data = JSON.parse(cached);
      return {
        is_trial: data.is_trial,
        days_left: data.days_left,
        expiry_at: data.expiry_at
      };
    }
    return null;
  } catch (err) {
    console.error('❌ Get trial status error:', err);
    return null;
  }
}

// ============================================================================
// PRICE CHANGE NOTIFICATIONS
// ============================================================================

/**
 * Cache pending price change
 */
export async function cachePriceChange(planId, priceChangeData) {
  try {
    await indexedDbAdapter.kvSet(
      STORE_KEYS.priceChange(planId),
      JSON.stringify({
        ...priceChangeData,
        cached_at: new Date().toISOString()
      })
    );
    console.log('💾 Price change cached');
    return true;
  } catch (err) {
    console.error('❌ Cache price change error:', err);
    return false;
  }
}

/**
 * Get pending price change from cache
 */
export async function getPriceChangeFromCache(planId) {
  try {
    const cached = await indexedDbAdapter.kvGet(
      STORE_KEYS.priceChange(planId)
    );
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (err) {
    console.error('❌ Get price change error:', err);
    return null;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate days until expiry
 */
export function daysUntilExpiry(expiryDate) {
  const expiry = new Date(expiryDate);
  const now = new Date();
  const diff = expiry.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Format expiry date for display
 */
export function formatExpiryDate(expiryDate) {
  return new Date(expiryDate).toLocaleDateString('en-KE');
}

/**
 * Validate M-Pesa code
 */
export function validateMpesaCode(code) {
  const trimmed = (code || '').trim().toUpperCase();

  if (!trimmed) {
    return { valid: false, error: 'M-Pesa code is required' };
  }

  if (trimmed.length < 8) {
    return { valid: false, error: 'M-Pesa code too short (min 8 characters)' };
  }

  if (trimmed.length > 20) {
    return { valid: false, error: 'M-Pesa code too long (max 20 characters)' };
  }

  return { valid: true, code: trimmed };
}

/**
 * Get subscription label by frequency
 */
export function getFrequencyLabel(frequency) {
  const plan = Object.values(SUBSCRIPTION_PLANS).find(
    p => p.key === frequency
  );
  return plan?.label || frequency;
}

/**
 * Setup periodic sync (every 5 minutes when online)
 */
export function startPeriodicSync() {
  console.log('🔄 Starting periodic sync (5 min interval)');
  
  setInterval(async () => {
    try {
      // Only sync if online
      const isOnline = true; // TODO: Check network state
      if (isOnline) {
        await processSyncQueue();
      }
    } catch (err) {
      console.warn('⚠️ Periodic sync error:', err);
    }
  }, 300000); // 5 minutes
}

/**
 * Export all functions
 */
export default {
  getSubscriptionStatusLocal,
  getSubscriptionStatusAPI,
  cacheSubscription,
  getSubscriptionFromCache,
  clearSubscriptionCache,
  cachePaymentHistory,
  getPaymentHistoryFromCache,
  addToSyncQueue,
  getSyncQueue,
  processSyncQueue,
  clearSyncQueue,
  cacheLockCheckResult,
  getCachedLockStatus,
  cacheTrialStatus,
  getTrialStatusFromCache,
  cachePriceChange,
  getPriceChangeFromCache,
  daysUntilExpiry,
  formatExpiryDate,
  validateMpesaCode,
  getFrequencyLabel,
  startPeriodicSync,
  SUBSCRIPTION_PLANS,
  STORE_KEYS
};
