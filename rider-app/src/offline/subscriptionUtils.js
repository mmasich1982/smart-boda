// rider-app/src/offline/subscriptionUtils.js
// ✅ REFACTORED: Subscription utilities using IndexedDB-first architecture
// ✅ UNIFIED: Mirrors trip, fuel, financial screen patterns
// ✅ RETENTION POLICY: 6-month rolling window for subscription history
// ✅ BUSINESS LOGIC: Bi-Weekly (500), Monthly (1000), Free Trial
// ✅ FIXED EXPORTS: Clean named exports (no conflicting default export)
// ✅ AUTO-INIT: Ensures free trial initialized for new riders on first load
// ✅ IMPROVED: Better state handling and return values
// ✅ NEW: CRITICAL LOCK ENFORCEMENT - checkAndEnforceLock function for instant expiry detection
// ✅ NEW: normalizePaymentRecord - transforms frontend payment to backend schema

import indexedDbAdapter from './adapters/indexedDbAdapter';
import { addToSyncQueue } from './syncQueue';

/**
 * Convert UTC timestamp to East Africa Time (EAT - UTC+3) formatted string
 */
function toEATString(timestamp) {
  const EAT_OFFSET = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
  const eatDate = new Date(new Date(timestamp).getTime() + EAT_OFFSET);
  return eatDate.toISOString().replace('Z', '+03:00');
}

/**
 * ============================================================================
 * SUBSCRIPTION STORAGE ARCHITECTURE
 * ============================================================================
 *
 * CACHE KEYS:
 * -----------
 * subscription_${riderId}
 *   - Active subscription record
 *   - Fields: status, frequency, amount, startDate, expiryDate, ts, timestamp
 *   - Updated on purchase/renewal/expiry
 *
 * subscription_history_${riderId}
 *   - Array of all subscriptions (active + expired)
 *   - Sorted by expiry date (newest first)
 *   - Used by payment history
 *
 * subscription_state_${riderId}
 *   - Trial status, reminders, lock status
 *   - Fields: trialStarted, trialEndDate, reminderCount, lastReminderCheck, lockedAt
 *
 * ============================================================================
 * SUBSCRIPTION PRICING
 * ============================================================================
 * Bi-Weekly Plan:  KSh 500  (14 days)
 * Monthly Plan:    KSh 1000 (30 days)
 * Free Trial:      2 Hours (default for new subscribers)
 * 
 * ============================================================================
 * BUSINESS RULES
 * ============================================================================
 * 
 * FREE TRIAL:
 * • All new riders get a 2-hour free trial automatically
 * • Trial banner shown on Home Screen immediately on first load
 * • Trial status persisted in IndexedDB
 * • Can pay before or after trial expiry
 *
 * REMINDERS:
 * • Reminder banner appears 2 days before expiry
 * • Limited to 3 checks per day
 * • Not shown if already paid ahead
 *
 * EXPIRY HANDLING:
 * • On expiry without payment: Account lock screen instead of Home
 * • Lock screen shows: days since expiry, unlock amount, pay options
 * • Once payment received: Automatic unlock, return to normal flow
 *
 * ACCOUNT LOCK:
 * • Graceful UI (no errors, no crashes)
 * • Data remains safe and accessible after unlock
 * • CRITICAL: Enforced immediately on:
 *   - Home Screen focus
 *   - After PIN login
 *   - On any screen that navigates to Home
 */

export const SUBSCRIPTION_PLANS = {
  biweekly: {
    key: 'biweekly',
    label: 'Bi-Weekly Plan',
    amount: 500,
    days: 14,
  },
  monthly: {
    key: 'monthly',
    label: 'Monthly Plan',
    amount: 1000,
    days: 30,
  },
};

// ✅ 2-HOUR FREE TRIAL (7,200,000 milliseconds)
export const FREE_TRIAL_HOURS = 2;
export const FREE_TRIAL_MS = 2 * 60 * 60 * 1000; // 7200000 ms
export const REMINDER_DAYS_BEFORE = 2;
export const REMINDER_CHECKS_PER_DAY = 3;

/**
 * ============================================================================
 * ✅ NEW: NORMALIZE PAYMENT RECORD FOR BACKEND SYNC
 * ============================================================================
 * Transforms frontend payment record to exact backend schema expected by
 * POST /subscriptions/payment endpoint
 * 
 * Frontend schema (IndexedDB):
 *   id, rider_id, type, amount, plan, currency, status, channel, 
 *   mpesa_code, createdAt, subscription_id, subscription_start, subscription_expiry
 * 
 * Backend schema (expected by API):
 *   id, type, amount, currency, status, channel, mpesa_code, plan, createdAt
 * 
 * Headers sent:
 *   X-Sync-ID: ${payment.id}
 *   X-Client-Timestamp: ${payment.createdAt}
 *
 * Query param:
 *   rider_id=${riderId}
 */
export function normalizePaymentRecord(paymentRecord, riderId) {
  try {
    if (!paymentRecord || !riderId) {
      throw new Error('Payment record and rider ID are required');
    }

    console.log('🔄 [normalizePaymentRecord] Transforming payment for backend...');
    console.log('   Input:', {
      id: paymentRecord.id,
      type: paymentRecord.type,
      amount: paymentRecord.amount,
      status: paymentRecord.status,
    });

    // ✅ Backend expects these exact fields
    const normalized = {
      // ✅ CRITICAL: Use fields exactly as backend expects
      id: paymentRecord.id,
      type: paymentRecord.type || 'subscription',
      amount: parseFloat(paymentRecord.amount) || 0,
      currency: paymentRecord.currency || 'KES',
      status: paymentRecord.status || 'Success', // Backend expects: 'Success', 'Pending', 'Failed'
      channel: paymentRecord.channel || 'M-Pesa',
      mpesa_code: paymentRecord.mpesa_code || null,
      plan: paymentRecord.plan || 'biweekly',
      // ✅ Timestamp in ISO format (backend will parse)
      createdAt: paymentRecord.createdAt || new Date().toISOString(),
    };

    // ✅ Additional metadata for sync tracking
    normalized.sync_id = paymentRecord.id; // For idempotency
    normalized.rider_id = riderId;
    normalized.endpoint = `/subscriptions/payment?rider_id=${riderId}`;

    console.log('✅ [normalizePaymentRecord] Normalized output:', {
      id: normalized.id,
      type: normalized.type,
      amount: normalized.amount,
      status: normalized.status,
      endpoint: normalized.endpoint,
    });

    return normalized;
  } catch (err) {
    console.error('❌ [normalizePaymentRecord] Error normalizing payment:', err);
    throw err;
  }
}

/**
 * ============================================================================
 * ✅ CRITICAL: CHECK AND ENFORCE ACCOUNT LOCK
 * ============================================================================
 * This is the master function for determining if account should be locked.
 * Called from:
 *   - HomeScreen on mount/focus
 *   - PinLoginScreen after successful PIN verification
 *   - Any navigation to Home
 *
 * Returns: { isLocked, reason, lockedSince, justLocked }
 * - isLocked: boolean - true if account should be locked
 * - reason: string - why account is locked
 * - lockedSince: ISO date - when account was locked
 * - justLocked: boolean - true if lock status changed on this check
 */
export async function checkAndEnforceLock(riderId) {
  try {
    // ✅ CRITICAL: Validate rider ID exists
    if (!riderId || riderId === 'undefined' || riderId === 'null') {
      console.error('❌ [checkAndEnforceLock] Invalid rider ID:', riderId);
      return { isLocked: false, reason: null, lockedSince: null, justLocked: false };
    }

    console.log('🔐 [checkAndEnforceLock] Checking lock status for rider:', riderId);

    const now = Date.now();
    
    // ✅ 1. Get current subscription with rider ID isolation
    const subscription = await getActiveSubscription(riderId);
    console.log('   Active subscription:', subscription ? `YES (${subscription.plan})` : 'NO');
    
    // ✅ 2. Get current state with rider ID isolation
    const state = await getSubscriptionState(riderId);
    console.log('   Trial started:', state?.trialStarted);
    console.log('   Trial end date:', state?.trialEndDate);
    console.log('   Currently locked:', !!state?.lockedAt);

    // ✅ 3. Check if currently locked
    const isCurrentlyLocked = !!state?.lockedAt;

    // ✅ 4. Determine lock reason
    let shouldLock = false;
    let lockReason = null;

    // ✅ PRIORITY 1: Active paid subscription takes precedence
    if (subscription) {
      const expiryMs = subscription.expiryDate 
        ? new Date(subscription.expiryDate).getTime() 
        : subscription.expiry_ms;

      if (expiryMs > now) {
        // Subscription active
        console.log('✅ [checkAndEnforceLock] Subscription is ACTIVE');
        shouldLock = false;
      } else {
        // Subscription expired
        console.log('⏰ [checkAndEnforceLock] Subscription has EXPIRED');
        shouldLock = true;
        lockReason = 'subscription_expired';
      }
    }
    // ✅ PRIORITY 2: Check free trial
    else if (state?.trialStarted && state?.trialEndDate) {
      const trialEndMs = new Date(state.trialEndDate).getTime();

      if (trialEndMs > now) {
        // Trial active
        console.log('✨ [checkAndEnforceLock] FREE TRIAL is ACTIVE');
        shouldLock = false;
      } else {
        // Trial expired
        console.log('⏰ [checkAndEnforceLock] FREE TRIAL has EXPIRED');
        shouldLock = true;
        lockReason = 'trial_expired';
      }
    }
    // ✅ PRIORITY 3: No subscription and no trial
    else {
      console.log('⚠️ [checkAndEnforceLock] No active subscription or trial');
      shouldLock = true;
      lockReason = 'no_subscription';
    }

    // ✅ 5. Determine if lock status changed
    let justLocked = false;
    if (shouldLock && !isCurrentlyLocked) {
      // Just locked
      justLocked = true;
      const now_iso = new Date().toISOString();
      state.lockedAt = now_iso;
      state.lockReason = lockReason;
      const stateKey = `subscription_state_${riderId}`;
      await indexedDbAdapter.kvSet(stateKey, JSON.stringify(state));
      console.log('🔒 [checkAndEnforceLock] ACCOUNT LOCKED - saving to IndexedDB');
    } else if (!shouldLock && isCurrentlyLocked) {
      // Just unlocked
      state.lockedAt = null;
      state.lockReason = null;
      const stateKey = `subscription_state_${riderId}`;
      await indexedDbAdapter.kvSet(stateKey, JSON.stringify(state));
      console.log('🔓 [checkAndEnforceLock] ACCOUNT UNLOCKED');
    }

    return {
      isLocked: shouldLock,
      reason: lockReason,
      lockedSince: state?.lockedAt,
      justLocked: justLocked,
    };
  } catch (err) {
    console.error('❌ [checkAndEnforceLock] Error:', err);
    return { isLocked: false, reason: null, lockedSince: null, justLocked: false };
  }
}

/**
 * Get active subscription for a rider
 * Returns null if no active subscription
 */
export async function getActiveSubscription(riderId) {
  try {
    if (!riderId || riderId === 'undefined' || riderId === 'null') {
      console.warn('⚠️ [getActiveSubscription] Invalid rider ID:', riderId);
      return null;
    }

    const key = `subscription_${riderId}`;
    const data = await indexedDbAdapter.kvGet(key);

    if (!data) {
      console.log('ℹ️ [getActiveSubscription] No subscription found for rider:', riderId);
      return null;
    }

    const subscription = typeof data === 'string' ? JSON.parse(data) : data;
    
    // Check if still valid
    const expiryMs = subscription.expiryDate 
      ? new Date(subscription.expiryDate).getTime() 
      : subscription.expiry_ms || 0;

    if (expiryMs <= Date.now()) {
      console.log('⏰ [getActiveSubscription] Subscription expired:', riderId);
      return null;
    }

    console.log('✅ [getActiveSubscription] Found active subscription:', {
      plan: subscription.plan,
      expiryDate: subscription.expiryDate,
    });

    return subscription;
  } catch (err) {
    console.error('❌ [getActiveSubscription] Error:', err);
    return null;
  }
}

/**
 * Get subscription state (trial, reminders, lock)
 */
export async function getSubscriptionState(riderId) {
  try {
    if (!riderId || riderId === 'undefined' || riderId === 'null') {
      console.warn('⚠️ [getSubscriptionState] Invalid rider ID:', riderId);
      return {
        trialStarted: false,
        trialEndDate: null,
        reminderCount: 0,
        lastReminderCheck: null,
        lockedAt: null,
      };
    }

    const key = `subscription_state_${riderId}`;
    const data = await indexedDbAdapter.kvGet(key);

    if (!data) {
      console.log('ℹ️ [getSubscriptionState] No state found, initializing for rider:', riderId);
      return {
        trialStarted: false,
        trialEndDate: null,
        reminderCount: 0,
        lastReminderCheck: null,
        lockedAt: null,
      };
    }

    const state = typeof data === 'string' ? JSON.parse(data) : data;
    console.log('✅ [getSubscriptionState] Retrieved state for rider:', riderId);
    return state;
  } catch (err) {
    console.error('❌ [getSubscriptionState] Error:', err);
    return {
      trialStarted: false,
      trialEndDate: null,
      reminderCount: 0,
      lastReminderCheck: null,
      lockedAt: null,
    };
  }
}

/**
 * Initialize free trial for new rider
 */
export async function ensureFreeTrial(riderId) {
  try {
    if (!riderId || riderId === 'undefined' || riderId === 'null') {
      console.error('❌ [ensureFreeTrial] Invalid rider ID:', riderId);
      return null;
    }

    const state = await getSubscriptionState(riderId);

    // Already initialized?
    if (state.trialStarted) {
      console.log('✅ [ensureFreeTrial] Trial already exists for rider:', riderId);
      return state;
    }

    // Initialize trial
    const now = Date.now();
    const trialEnd = now + FREE_TRIAL_MS;

    const newState = {
      trialStarted: true,
      trialEndDate: toEATString(trialEnd),
      reminderCount: 0,
      lastReminderCheck: null,
      lockedAt: null,
    };

    const stateKey = `subscription_state_${riderId}`;
    await indexedDbAdapter.kvSet(stateKey, JSON.stringify(newState));

    console.log('✅ [ensureFreeTrial] Trial initialized for rider:', riderId);
    console.log('   Trial ends at:', newState.trialEndDate);
    return newState;
  } catch (err) {
    console.error('❌ [ensureFreeTrial] Error:', err);
    return null;
  }
}

/**
 * Check if subscription is expired
 */
export async function isSubscriptionExpired(riderId) {
  const subscription = await getActiveSubscription(riderId);
  
  if (!subscription) {
    return true;
  }

  const expiryMs = subscription.expiryDate 
    ? new Date(subscription.expiryDate).getTime() 
    : subscription.expiry_ms || 0;
  return expiryMs <= Date.now();
}

/**
 * Check if free trial is still active
 * ✅ IMPROVED: Better null checking
 */
export async function isFreTrialActive(riderId) {
  try {
    const state = await getSubscriptionState(riderId);
    
    // Must have trial started and end date
    if (!state || !state.trialStarted || !state.trialEndDate) {
      console.log('ℹ️ [isFreTrialActive] No trial data for rider:', riderId);
      return false;
    }

    const trialEndMs = new Date(state.trialEndDate).getTime();
    const now = Date.now();
    const isActive = trialEndMs > now;

    if (isActive) {
      const daysLeft = Math.ceil((trialEndMs - now) / (1000 * 60 * 60 * 24));
      console.log('✨ [isFreTrialActive] Trial is ACTIVE:', {
        trialEndDate: state.trialEndDate,
        daysLeft: daysLeft,
      });
    } else {
      console.log('⏰ [isFreTrialActive] Trial has EXPIRED:', {
        trialEndDate: state.trialEndDate,
      });
    }

    return isActive;
  } catch (err) {
    console.error('❌ [isFreTrialActive] Error checking trial status:', err);
    return false;
  }
}

/**
 * Check if reminder should be shown (2 days before expiry, max 3x per day)
 */
export async function shouldShowReminderBanner(riderId) {
  try {
    const subscription = await getActiveSubscription(riderId);
    if (!subscription) return false;

    const state = await getSubscriptionState(riderId);
    const expiryMs = subscription.expiryDate 
      ? new Date(subscription.expiryDate).getTime() 
      : subscription.expiry_ms || 0;
    const now = Date.now();
    const daysUntilExpiry = (expiryMs - now) / (1000 * 60 * 60 * 24);

    // Only show if within reminder window (2 days)
    if (daysUntilExpiry >= REMINDER_DAYS_BEFORE || daysUntilExpiry < 0) {
      return false;
    }

    // Check 3x per day limit
    const lastCheck = state.lastReminderCheck ? new Date(state.lastReminderCheck).getTime() : 0;
    const timeSinceLastCheck = (now - lastCheck) / (1000 * 60 * 60);

    if (timeSinceLastCheck < (24 / REMINDER_CHECKS_PER_DAY)) {
      return false;
    }

    return true;
  } catch (err) {
    console.error('❌ Error checking reminder:', err);
    return false;
  }
}

/**
 * Update reminder check time
 */
export async function updateLastReminderCheck(riderId) {
  try {
    const state = await getSubscriptionState(riderId);
    state.lastReminderCheck = new Date().toISOString();
    const stateKey = `subscription_state_${riderId}`;
    await indexedDbAdapter.kvSet(stateKey, JSON.stringify(state));
  } catch (err) {
    console.error('❌ Error updating reminder check:', err);
  }
}

/**
 * ✅ CREATE SUBSCRIPTION: Main subscription purchase flow
 * Called by ConfirmSubscriptionScreen after M-Pesa payment
 */
export async function createSubscription(riderId, plan, paymentMethod = 'mpesa') {
  try {
    // ✅ CRITICAL: Validate rider ID exists and is not undefined/null
    if (!riderId || riderId === 'undefined' || riderId === 'null') {
      console.error('❌ [createSubscription] Invalid rider ID:', riderId);
      throw new Error('Rider ID is required to create subscription');
    }

    console.log('📝 [createSubscription] Creating subscription for rider:', riderId);
    console.log('   Plan:', plan);
    console.log('   Payment Method:', paymentMethod);

    const planConfig = SUBSCRIPTION_PLANS[plan];
    if (!planConfig) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    const now = Date.now();
    const expiryMs = now + (planConfig.days * 24 * 60 * 60 * 1000);

    const subscription = {
      id: `sub_${riderId}_${now}`,
      rider_id: riderId,
      plan: plan,
      frequency: plan, // Alias for compatibility
      amount: planConfig.amount,
      currency: 'KES',
      status: 'active',
      paymentMethod: paymentMethod,
      startDate: toEATString(now),
      start_ms: now,
      expiryDate: toEATString(expiryMs),
      expiry_ms: expiryMs,
      createdAt: toEATString(Date.now()),
      ts: now,
      timestamp: now,
      syncStatus: 'pending',
    };

    // ✅ Save to IndexedDB with rider ID isolation
    const key = `subscription_${riderId}`;
    console.log('💾 [createSubscription] Saving to IndexedDB with key:', key);
    await indexedDbAdapter.kvSet(key, JSON.stringify(subscription));

    // ✅ Update history with rider ID isolation
    await addToSubscriptionHistory(riderId, subscription);

    // ✅ CRITICAL: Clear trial lock state when paid subscription is created
    // This prevents immediate account lock after subscription creation
    const state = await getSubscriptionState(riderId);
    state.lockedAt = null; // Clear lock
    state.lockReason = null; // Clear lock reason
    // Keep trial info for historical purposes, but it's no longer active
    state.trialActive = false;
    
    const stateKey = `subscription_state_${riderId}`;
    await indexedDbAdapter.kvSet(stateKey, JSON.stringify(state));
    console.log('✅ [createSubscription] Cleared trial lock state for rider:', riderId);

    // ✅ Queue for sync with rider ID
    await addToSyncQueue({
      id: subscription.id,
      type: 'subscription',
      endpoint: `/subscriptions?rider_id=${riderId}`,
      data: subscription,
      timestamp: new Date(),
    });

    console.log('✅ [createSubscription] Subscription successfully created:', {
      id: subscription.id,
      riderId: riderId,
      plan: plan,
      amount: subscription.amount,
      expiryDate: subscription.expiryDate,
    });
    
    return subscription;
  } catch (err) {
    console.error('❌ [createSubscription] Error:', err);
    throw err;
  }
}

/**
 * Add subscription to history
 */
export async function addToSubscriptionHistory(riderId, subscription) {
  try {
    const historyKey = `subscription_history_${riderId}`;
    let history = [];

    try {
      const cached = await indexedDbAdapter.kvGet(historyKey);
      if (cached) {
        history = typeof cached === 'string' ? JSON.parse(cached) : cached;
        if (!Array.isArray(history)) history = [];
      }
    } catch (err) {
      console.warn('⚠️ Failed to load subscription history:', err);
    }

    history.unshift(subscription);
    await indexedDbAdapter.kvSet(historyKey, JSON.stringify(history));
    console.log('📜 [addToSubscriptionHistory] Updated subscription history (count:', history.length, ')');
  } catch (err) {
    console.error('❌ [addToSubscriptionHistory] Error:', err);
  }
}

/**
 * Unlock account after payment
 */
export async function unlockAccount(riderId) {
  try {
    const state = await getSubscriptionState(riderId);
    state.lockedAt = null;
    state.lockReason = null;
    
    const stateKey = `subscription_state_${riderId}`;
    await indexedDbAdapter.kvSet(stateKey, JSON.stringify(state));
    console.log('🔓 [unlockAccount] Account unlocked for rider:', riderId);
  } catch (err) {
    console.error('❌ [unlockAccount] Error:', err);
  }
}

/**
 * Get payment history for rider
 */
export async function getPaymentHistory(riderId) {
  try {
    const historyKey = `payment_history_${riderId}`;
    const cached = await indexedDbAdapter.kvGet(historyKey);

    if (!cached) {
      return [];
    }

    const history = typeof cached === 'string' ? JSON.parse(cached) : cached;
    return Array.isArray(history) ? history : [];
  } catch (err) {
    console.error('❌ [getPaymentHistory] Error:', err);
    return [];
  }
}

export default {
  SUBSCRIPTION_PLANS,
  FREE_TRIAL_HOURS,
  FREE_TRIAL_MS,
  REMINDER_DAYS_BEFORE,
  REMINDER_CHECKS_PER_DAY,
  normalizePaymentRecord,
  checkAndEnforceLock,
  getActiveSubscription,
  getSubscriptionState,
  ensureFreeTrial,
  isSubscriptionExpired,
  isFreTrialActive,
  shouldShowReminderBanner,
  updateLastReminderCheck,
  createSubscription,
  addToSubscriptionHistory,
  unlockAccount,
  getPaymentHistory,
};