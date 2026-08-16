// rider-app/src/subscription/subscriptionGate.js
// FIXED: Complete module with all missing exports
// Provides subscription status checking, trial tracking, and UI banners
import api from '../api/client';
import { getRiderAccountSummary, saveRiderAccountSummary } from '../offline/db';

const LOCKED_STATUSES = new Set(['locked', 'expired']);
const NEVER_BLOCK_STATUSES = new Set(['active', 'pending_verification', 'free_trial']);

// Subscription plan details
export const SUBSCRIPTION_PLAN = {
  dailyPrice: 99, // KSh per day
  monthlyPrice: 2970, // KSh per month (30 days)
  frequency: 'daily', // 'daily' | 'monthly'
};

/**
 * Check if the rider's subscription is locked (expired/unpaid)
 * Falls back to cached status if offline
 */
export async function isSubscriptionLocked() {
  const cached = await getRiderAccountSummary();
  const cachedStatus = cached?.subscription_status;

  try {
    const { data } = await api.get('/subscription/status');
    await saveRiderAccountSummary({ 
      ...(cached || {}), 
      subscription_status: data.status, 
      locked_at: data.locked_at 
    });
    return LOCKED_STATUSES.has(data.status) && !NEVER_BLOCK_STATUSES.has(data.status);
  } catch {
    if (!cachedStatus) return false;
    return LOCKED_STATUSES.has(cachedStatus) && !NEVER_BLOCK_STATUSES.has(cachedStatus);
  }
}

/**
 * Get trial status including whether trial is active and days remaining
 * Returns { active: boolean, daysRemaining: number }
 */
export async function getTrialStatus() {
  const cached = await getRiderAccountSummary();
  
  try {
    const { data } = await api.get('/subscription/trial-status');
    const trialData = {
      active: data.active || false,
      daysRemaining: data.days_remaining || 0,
      startedAt: data.started_at,
      expiresAt: data.expires_at,
    };
    
    await saveRiderAccountSummary({ 
      ...(cached || {}), 
      trial_status: trialData 
    });
    
    return trialData;
  } catch {
    // Return cached trial data if offline, or default if no cache
    if (cached?.trial_status) {
      return cached.trial_status;
    }
    return { active: false, daysRemaining: 0 };
  }
}

/**
 * Get subscription status banner (Module F component stub)
 * This returns null for now as the actual banner component will be built
 * as part of Module F subscription implementation
 * 
 * In production, this would return a React component that displays:
 * - Active subscription with renewal date
 * - Subscription expiring soon warning
 * - Subscription expired with reactivation prompt
 */
export function getSubscriptionStatusBanner() {
  // STUB: Module F will implement the actual banner component
  // For now, returning null means no banner is displayed
  // When Module F lands, replace this with:
  // return <SubscriptionStatusBanner />;
  return null;
}

/**
 * Get the full subscription details for display/management
 * Includes current status, pricing, renewal info, etc.
 */
export async function getSubscriptionDetails() {
  const cached = await getRiderAccountSummary();
  
  try {
    const { data } = await api.get('/subscription/details');
    const subscriptionData = {
      status: data.status,
      plan: data.plan || 'daily',
      renewsAt: data.renews_at,
      lockedAt: data.locked_at,
      pendingPayment: data.pending_payment || false,
      paymentCode: data.payment_code,
      lastPaymentDate: data.last_payment_date,
    };
    
    await saveRiderAccountSummary({ 
      ...(cached || {}), 
      subscription_details: subscriptionData 
    });
    
    return subscriptionData;
  } catch {
    if (cached?.subscription_details) {
      return cached.subscription_details;
    }
    return {
      status: 'unknown',
      plan: 'daily',
      renewsAt: null,
      lockedAt: null,
    };
  }
}

/**
 * Update subscription preference (daily vs monthly billing)
 */
export async function updateSubscriptionFrequency(frequency) {
  try {
    const { data } = await api.post('/subscription/update-frequency', {
      frequency, // 'daily' | 'monthly'
    });
    
    const cached = await getRiderAccountSummary();
    await saveRiderAccountSummary({
      ...(cached || {}),
      subscription_plan: frequency,
    });
    
    return { ok: true, data };
  } catch (err) {
    console.error('Failed to update subscription frequency:', err);
    throw err;
  }
}