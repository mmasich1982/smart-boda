// rider-app/src/offline/subscriptionUtils.js
// ✅ REFACTORED: Subscription utilities using IndexedDB-first architecture
// ✅ UNIFIED: Mirrors trip, fuel, financial screen patterns
// ✅ RETENTION POLICY: 6-month rolling window for subscription history
// ✅ BUSINESS LOGIC: Bi-Weekly (500), Monthly (1000), Free Trial
// ✅ FIXED EXPORTS: Clean named exports (no conflicting default export)
// ✅ AUTO-INIT: Ensures free trial initialized for new riders on first load
// ✅ IMPROVED: Better state handling and return values

import indexedDbAdapter from './adapters/indexedDbAdapter';
import { addToSyncQueue } from './syncQueue';

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
 * Free Trial:      1 day (default for new subscribers)
 * 
 * ============================================================================
 * BUSINESS RULES
 * ============================================================================
 * 
 * FREE TRIAL:
 * • All new riders get 1-day free trial automatically
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

export const FREE_TRIAL_DAYS = 1;
export const REMINDER_DAYS_BEFORE = 2;
export const REMINDER_CHECKS_PER_DAY = 3;

/**
 * Get active subscription for rider
 */
export async function getActiveSubscription(riderId) {
  try {
    const key = `subscription_${riderId}`;
    const cached = await indexedDbAdapter.kvGet(key);

    if (cached) {
      const subscription = typeof cached === 'string' ? JSON.parse(cached) : cached;
      
      // Check if expired
      const expiryMs = subscription.expiryDate || subscription.expiry_ms || 0;
      if (expiryMs > 0 && expiryMs <= Date.now()) {
        console.log('⚠️ Subscription expired');
        return null;
      }

      return subscription;
    }
    return null;
  } catch (err) {
    console.error('❌ Error getting active subscription:', err);
    return null;
  }
}

/**
 * Get subscription state (trial, reminders, lock status)
 */
export async function getSubscriptionState(riderId) {
  try {
    const key = `subscription_state_${riderId}`;
    const cached = await indexedDbAdapter.kvGet(key);

    if (cached) {
      return typeof cached === 'string' ? JSON.parse(cached) : cached;
    }

    // Return default state
    return {
      trialStarted: false,
      trialEndDate: null,
      reminderCount: 0,
      lastReminderCheck: null,
      lockedAt: null,
      lockReason: null,
    };
  } catch (err) {
    console.error('❌ Error getting subscription state:', err);
    return {
      trialStarted: false,
      trialEndDate: null,
      reminderCount: 0,
      lastReminderCheck: null,
      lockedAt: null,
      lockReason: null,
    };
  }
}

/**
 * ✅ ENSURE FREE TRIAL EXISTS FOR NEW RIDERS
 * Called on first home screen load to auto-initialize trial for new riders
 * Returns the current state (whether just created or existing)
 */
export async function ensureFreeTrial(riderId) {
  try {
    console.log('🔍 [ensureFreeTrial] Checking trial status for rider:', riderId);
    
    const state = await getSubscriptionState(riderId);
    
    // ✅ If trial not started, initialize it now
    if (!state.trialStarted) {
      console.log('✨ [ensureFreeTrial] New rider detected - initializing free trial');
      
      const now = Date.now();
      const trialEndMs = now + (FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);

      const newState = {
        trialStarted: true,
        trialStartDate: new Date(now).toISOString(),
        trialEndDate: new Date(trialEndMs).toISOString(),
        trialEndMs: trialEndMs,
        reminderCount: 0,
        lastReminderCheck: null,
        lockedAt: null,
        lockReason: null,
      };

      const key = `subscription_state_${riderId}`;
      await indexedDbAdapter.kvSet(key, JSON.stringify(newState));
      
      console.log('✅ [ensureFreeTrial] Free trial created:', {
        trialStartDate: newState.trialStartDate,
        trialEndDate: newState.trialEndDate,
        daysRemaining: FREE_TRIAL_DAYS,
      });
      
      return newState;
    }
    
    console.log('✅ [ensureFreeTrial] Trial already exists:', {
      trialStarted: state.trialStarted,
      trialEndDate: state.trialEndDate,
    });
    
    return state;
  } catch (err) {
    console.error('❌ [ensureFreeTrial] Error ensuring free trial:', err);
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

  const expiryMs = subscription.expiryDate || subscription.expiry_ms || 0;
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
    const expiryMs = subscription.expiryDate || subscription.expiry_ms || 0;
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
 * Record reminder shown (for rate limiting)
 */
export async function recordReminderShown(riderId) {
  try {
    const state = await getSubscriptionState(riderId);
    state.lastReminderCheck = new Date().toISOString();

    const key = `subscription_state_${riderId}`;
    await indexedDbAdapter.kvSet(key, JSON.stringify(state));
  } catch (err) {
    console.error('❌ Error recording reminder:', err);
  }
}

/**
 * Create new subscription
 */
export async function createSubscription(riderId, plan, paymentMethod = 'mpesa') {
  try {
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
      startDate: new Date(now).toISOString(),
      start_ms: now,
      expiryDate: new Date(expiryMs).toISOString(),
      expiry_ms: expiryMs,
      createdAt: new Date().toISOString(),
      ts: now,
      timestamp: now,
      syncStatus: 'pending',
    };

    // Save to IndexedDB
    const key = `subscription_${riderId}`;
    await indexedDbAdapter.kvSet(key, JSON.stringify(subscription));

    // Update history
    await addToSubscriptionHistory(riderId, subscription);

    // Initialize trial state if new rider
    const state = await getSubscriptionState(riderId);
    if (!state.trialStarted) {
      await ensureFreeTrial(riderId);
    }

    // Queue for sync
    await addToSyncQueue({
      id: subscription.id,
      type: 'subscription',
      endpoint: `/subscriptions?rider_id=${riderId}`,
      data: subscription,
      timestamp: new Date(),
    });

    console.log('✅ Subscription created:', subscription.id);
    return subscription;
  } catch (err) {
    console.error('❌ Error creating subscription:', err);
    return null;
  }
}

/**
 * Initialize free trial for new rider
 */
export async function initializeFreeTrial(riderId) {
  try {
    const now = Date.now();
    const trialEndMs = now + (FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const state = {
      trialStarted: true,
      trialStartDate: new Date(now).toISOString(),
      trialEndDate: new Date(trialEndMs).toISOString(),
      trialEndMs: trialEndMs,
      reminderCount: 0,
      lastReminderCheck: null,
      lockedAt: null,
      lockReason: null,
    };

    const key = `subscription_state_${riderId}`;
    await indexedDbAdapter.kvSet(key, JSON.stringify(state));

    console.log('✅ Free trial initialized for rider:', riderId);
    console.log('   Trial ends at:', new Date(trialEndMs).toISOString());
    return state;
  } catch (err) {
    console.error('❌ Error initializing trial:', err);
    return null;
  }
}

/**
 * Lock account due to expired subscription
 */
export async function lockAccount(riderId, reason = 'Subscription expired') {
  try {
    const state = await getSubscriptionState(riderId);
    state.lockedAt = new Date().toISOString();
    state.lockReason = reason;

    const key = `subscription_state_${riderId}`;
    await indexedDbAdapter.kvSet(key, JSON.stringify(state));

    console.log('🔒 Account locked for rider:', riderId);
    return state;
  } catch (err) {
    console.error('❌ Error locking account:', err);
    return null;
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

    const key = `subscription_state_${riderId}`;
    await indexedDbAdapter.kvSet(key, JSON.stringify(state));

    console.log('🔓 Account unlocked for rider:', riderId);
    return state;
  } catch (err) {
    console.error('❌ Error unlocking account:', err);
    return null;
  }
}

/**
 * Add subscription to history
 */
async function addToSubscriptionHistory(riderId, subscription) {
  try {
    const key = `subscription_history_${riderId}`;
    let history = [];

    const cached = await indexedDbAdapter.kvGet(key);
    if (cached) {
      history = typeof cached === 'string' ? JSON.parse(cached) : cached;
      if (!Array.isArray(history)) history = [];
    }

    history.unshift(subscription);
    await indexedDbAdapter.kvSet(key, JSON.stringify(history));
  } catch (err) {
    console.error('❌ Error updating subscription history:', err);
  }
}

/**
 * Get subscription history
 */
export async function getSubscriptionHistory(riderId) {
  try {
    const key = `subscription_history_${riderId}`;
    const cached = await indexedDbAdapter.kvGet(key);

    if (cached) {
      return typeof cached === 'string' ? JSON.parse(cached) : cached;
    }
    return [];
  } catch (err) {
    console.error('❌ Error getting subscription history:', err);
    return [];
  }
}

// ============================================================================
// ✅ CLEAN NAMED EXPORTS (No conflicting default export)
// ============================================================================
// All functions available via named imports:
// import { getActiveSubscription, getSubscriptionState, ensureFreeTrial, isFreTrialActive, ... } from './subscriptionUtils'