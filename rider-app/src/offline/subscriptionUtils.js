// rider-app/src/offline/subscriptionUtils.js
// ✅ REFACTORED: Subscription utilities using IndexedDB-first architecture
// ✅ UNIFIED: Mirrors trip, fuel, financial screen patterns
// ✅ RETENTION POLICY: 6-month rolling window for subscription history
// ✅ BUSINESS LOGIC: Bi-Weekly (500), Monthly (1000), Free Trial
// ✅ FIXED EXPORTS: Clean named exports (no conflicting default export)
// ✅ AUTO-INIT: Ensures free trial initialized for new riders on first load
// ✅ IMPROVED: Better state handling and return values
// ✅ NEW: CRITICAL LOCK ENFORCEMENT - checkAndEnforceLock function for instant expiry detection

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
 * Weekly Plan:      KSh 125  (7 days)
 * 2-Week Plan:      KSh 250  (14 days)
 * 3-Week Plan:      KSh 375  (21 days)
 * Monthly Plan:     KSh 500  (30 days)
 * FREE TRIAL:       REMOVED - Payment required immediately
 * 
 * ============================================================================
 * BUSINESS RULES
 * ============================================================================
 * 
 * FREE TRIAL:
 * • ✅ REMOVED - No free trial period
 * • Riders must pay immediately to use the app
 * • No trial banner or reminder logic
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
  weekly: {
    key: 'weekly',
    label: 'Weekly Plan',
    amount: 125,
    days: 7,
  },
  two_weeks: {
    key: 'two_weeks',
    label: '2-Week Plan',
    amount: 250,
    days: 14,
  },
  three_weeks: {
    key: 'three_weeks',
    label: '3-Week Plan',
    amount: 375,
    days: 21,
  },
  monthly: {
    key: 'monthly',
    label: 'Monthly Plan',
    amount: 500,
    days: 30,
  },
};

// ✅ FREE TRIAL REMOVED - No trial period
export const FREE_TRIAL_HOURS = 0;
export const FREE_TRIAL_MS = 0; // No trial
export const REMINDER_DAYS_BEFORE = 2;
export const REMINDER_CHECKS_PER_DAY = 3;

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
      
      if (expiryMs && expiryMs > now) {
        // Subscription is still valid - DO NOT LOCK
        console.log('✅ [checkAndEnforceLock] Active valid subscription found - NOT locking');
        shouldLock = false;
      } else if (expiryMs && expiryMs <= now) {
        // Subscription expired
        shouldLock = true;
        lockReason = 'Subscription expired';
        console.log('🔒 [checkAndEnforceLock] Subscription expired:', {
          expiryDate: subscription.expiryDate,
          now: toEATString(now),
        });
      }
    } 
    // ✅ PRIORITY 2: No paid subscription exists and no trial available
    // Free trial REMOVED - riders must pay immediately
    else {
      // No paid subscription found
      shouldLock = true;
      lockReason = 'Payment required to use the app';
      console.log('🔒 [checkAndEnforceLock] No active subscription - locking account:', {
        riderId,
        now: toEATString(now),
      });
    }

    // ✅ 5. Update lock state if needed
    if (shouldLock && !isCurrentlyLocked) {
      // Lock account
      await lockAccount(riderId, lockReason);
      console.log('🔒 [checkAndEnforceLock] ACCOUNT LOCKED:', {
        riderId,
        reason: lockReason,
        timestamp: toEATString(now),
      });
      return {
        isLocked: true,
        reason: lockReason,
        lockedSince: toEATString(now),
        justLocked: true,
      };
    } else if (!shouldLock && isCurrentlyLocked) {
      // Already paid - unlock account
      await unlockAccount(riderId);
      console.log('🔓 [checkAndEnforceLock] ACCOUNT UNLOCKED (payment received):', {
        riderId,
        timestamp: toEATString(now),
      });
      return {
        isLocked: false,
        reason: null,
        lockedSince: null,
        justLocked: false,
      };
    } else if (shouldLock && isCurrentlyLocked) {
      // Already locked
      console.log('🔒 [checkAndEnforceLock] Account already locked');
      return {
        isLocked: true,
        reason: state?.lockReason || lockReason,
        lockedSince: state?.lockedAt,
        justLocked: false,
      };
    }

    // ✅ 6. No lock needed
    console.log('✅ [checkAndEnforceLock] No lock required');
    return {
      isLocked: false,
      reason: null,
      lockedSince: null,
      justLocked: false,
    };
  } catch (err) {
    console.error('❌ [checkAndEnforceLock] Error checking lock status:', err);
    // FAIL-SAFE: On error, do NOT lock account - allow access
    return { isLocked: false, reason: null, lockedSince: null, justLocked: false };
  }
}

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
      const expiryMs = subscription.expiryDate 
        ? new Date(subscription.expiryDate).getTime() 
        : subscription.expiry_ms || 0;
      
      if (expiryMs > 0 && expiryMs <= Date.now()) {
        console.log('⚠️ [getActiveSubscription] Subscription expired');
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
    
    if (!riderId) {
      console.error('❌ [ensureFreeTrial] No rider ID provided');
      return null;
    }
    
    const state = await getSubscriptionState(riderId);
    
    // ✅ If trial not started, initialize it now
    if (!state.trialStarted) {
      console.log('✨ [ensureFreeTrial] New rider detected - initializing free trial');
      
      const now = Date.now();
      const trialEndMs = now + FREE_TRIAL_MS; // 2 hours

      const newState = {
        trialStarted: true,
        trialStartDate: toEATString(now),
        trialEndDate: toEATString(trialEndMs),
        trialEndMs: trialEndMs,
        reminderCount: 0,
        lastReminderCheck: null,
        lockedAt: null,
        lockReason: null,
      };

      const key = `subscription_state_${riderId}`;
      await indexedDbAdapter.kvSet(key, JSON.stringify(newState));
      
      console.log('✅ [ensureFreeTrial] Free trial created for rider:', riderId);
      console.log('   Trial duration: 2 hours (7,200,000 ms)');
      console.log('   Trial start:', newState.trialStartDate);
      console.log('   Trial end:', newState.trialEndDate);
      
      return newState;
    }
    
    console.log('✅ [ensureFreeTrial] Trial already exists for rider:', riderId);
    console.log('   Trial status:', {
      trialStarted: state.trialStarted,
      trialEndDate: state.trialEndDate,
      lockedAt: state.lockedAt,
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
 * Record reminder shown (for rate limiting)
 */
export async function recordReminderShown(riderId) {
  try {
    const state = await getSubscriptionState(riderId);
    state.lastReminderCheck = toEATString(Date.now());

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

    // ✅ SURGICAL FIX: DO NOT queue subscription sync here
    // Payment sync is handled by ConfirmSubscriptionScreen via addToSyncQueue
    // This function only creates the local subscription record
    // Backend subscription is created when payment is verified by backend
    console.log('📝 [createSubscription] Local subscription record created (no sync queued)');
    console.log('   Payment sync will be queued by ConfirmSubscriptionScreen');

    console.log('✅ [createSubscription] Subscription successfully created:', {
      id: subscription.id,
      riderId: riderId,
      plan: plan,
      amount: subscription.amount,
      expiryDate: subscription.expiryDate,
    });
    
    return subscription;
  } catch (err) {
    console.error('❌ [createSubscription] Error creating subscription:', err);
    return null;
  }
}

/**
 * ✅ DEPRECATED: Initialize free trial for new rider
 * FREE TRIAL REMOVED - This function is no longer used
 * Riders must pay immediately to use the app
 */
export async function initializeFreeTrial(riderId) {
  try {
    console.log('⚠️ [initializeFreeTrial] DEPRECATED - Free trial has been removed');
    
    const now = Date.now();
    const state = {
      trialStarted: false,
      trialStartDate: null,
      trialEndDate: null,
      trialEndMs: null,
      reminderCount: 0,
      lastReminderCheck: null,
      lockedAt: now, // Lock immediately - payment required
      lockReason: 'Payment required to use the app',
    };

    const key = `subscription_state_${riderId}`;
    await indexedDbAdapter.kvSet(key, JSON.stringify(state));

    console.log('ℹ️ [initializeFreeTrial] Account created (locked - payment required)');
    console.log('   Rider must pay to access the app');
    return state;
  } catch (err) {
    console.error('❌ Error initializing subscription state:', err);
    return null;
  }
}

/**
 * Lock account due to expired subscription
 */
export async function lockAccount(riderId, reason = 'Subscription expired') {
  try {
    const state = await getSubscriptionState(riderId);
    state.lockedAt = toEATString(Date.now());
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

/**
 * ============================================================================
 * ✅ TESTING & DEBUG UTILITIES
 * ============================================================================
 */

/**
 * RESET SUBSCRIPTION STATE FOR TESTING
 * Call this to clear subscription and reset to locked state (no trial)
 * Usage: await resetSubscriptionForTesting(riderId)
 */
export async function resetSubscriptionForTesting(riderId) {
  try {
    console.log('🔄 [resetSubscriptionForTesting] Resetting subscription state for:', riderId);
    
    // Clear subscription
    const subKey = `subscription_${riderId}`;
    await indexedDbAdapter.kvSet(subKey, null);
    
    // Clear subscription history
    const historyKey = `subscription_history_${riderId}`;
    await indexedDbAdapter.kvSet(historyKey, null);
    
    // ✅ FREE TRIAL REMOVED - Lock account immediately
    const now = Date.now();
    
    const freshState = {
      trialStarted: false,
      trialStartDate: null,
      trialEndDate: null,
      trialEndMs: null,
      reminderCount: 0,
      lastReminderCheck: null,
      lockedAt: toEATString(now),
      lockReason: 'Payment required to use the app',
    };
    
    const stateKey = `subscription_state_${riderId}`;
    await indexedDbAdapter.kvSet(stateKey, JSON.stringify(freshState));
    
    console.log('✅ [resetSubscriptionForTesting] Subscription state reset successfully');
    console.log('   Account is locked - payment required');
    console.log('   No trial period available');
    
    return freshState;
  } catch (err) {
    console.error('❌ [resetSubscriptionForTesting] Error resetting state:', err);
    return null;
  }
}

// ============================================================================
// ✅ CLEAN NAMED EXPORTS (No conflicting default export)
// ============================================================================
// All functions available via named imports:
// import { 
//   getActiveSubscription, 
//   getSubscriptionState, 
//   ensureFreeTrial, 
//   isFreTrialActive,
//   checkAndEnforceLock,     // ← CRITICAL FUNCTION
//   resetSubscriptionForTesting, // ← FOR TESTING ONLY
//   ... 
// } from './subscriptionUtils'