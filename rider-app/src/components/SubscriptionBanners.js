// rider-app/src/components/SubscriptionBanners.js
// ✅ REFACTORED: Subscription banners for Home Screen
// ✅ DISPLAYS BELOW HERO FARE CARD: Free Trial, Reminder, Account Lock
// ✅ UI/UX: 100% ALIGNED WITH index.html design system
// ✅ BUSINESS LOGIC: Trial status, reminder rate limiting, lock detection
// ✅ OFFLINE-FIRST: All data persisted via IndexedDB adapter
// ✅ AUTO-INIT: Ensures free trial is initialized for new riders on first home screen load

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  getActiveSubscription,
  getSubscriptionState,
  isFreTrialActive,
  shouldShowReminderBanner,
  recordReminderShown,
  ensureFreeTrial,
} from '../offline/subscriptionUtils';
import { getLocalRiderId } from '../offline/db';

export default function SubscriptionBanners({ navigation }) {
  const [riderId, setRiderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  const [state, setState] = useState(null);
  const [bannerType, setBannerType] = useState(null); // 'trial' | 'reminder' | 'locked' | null

  // ========================================================================
  // LOAD RIDER ID ON MOUNT
  // ========================================================================
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setRiderId(id);
          console.log('✅ [SubscriptionBanners] Loaded rider ID:', id);
        } else {
          console.warn('⚠️ [SubscriptionBanners] No rider ID found');
          setLoading(false);
        }
      } catch (err) {
        console.error('❌ [SubscriptionBanners] Error loading rider ID:', err);
        setLoading(false);
      }
    };
    loadRiderId();
  }, []);

  // ========================================================================
  // AUTO-INITIALIZE FREE TRIAL + CHECK SUBSCRIPTION STATUS
  // ========================================================================
  useEffect(() => {
    if (!riderId) {
      return;
    }

    const checkAndInitializeSubscription = async () => {
      try {
        console.log('🔍 [SubscriptionBanners] Starting subscription check for rider:', riderId);
        
        // ✅ CRITICAL: Ensure free trial is initialized for new riders
        const ensuredState = await ensureFreeTrial(riderId);
        console.log('📊 [SubscriptionBanners] ensureFreeTrial returned:', {
          trialStarted: ensuredState?.trialStarted,
          trialEndDate: ensuredState?.trialEndDate,
        });

        // Get the subscription (if any paid plan is active)
        const sub = await getActiveSubscription(riderId);
        console.log('💳 [SubscriptionBanners] Active subscription:', sub ? 'YES' : 'NO');

        // Get full state (trial, reminders, lock)
        const fullState = await getSubscriptionState(riderId);
        console.log('📋 [SubscriptionBanners] Full subscription state:', {
          trialStarted: fullState?.trialStarted,
          trialEndDate: fullState?.trialEndDate,
          lockedAt: fullState?.lockedAt,
        });

        setSubscription(sub);
        setState(fullState);

        // ========================================================================
        // DETERMINE WHICH BANNER TO SHOW (Priority Order)
        // ========================================================================
        console.log('🎯 [SubscriptionBanners] Determining banner type...');
        
        // PRIORITY 1: Account is locked
        if (fullState?.lockedAt) {
          console.log('🔒 [SubscriptionBanners] >>> SHOWING LOCKED BANNER');
          setBannerType('locked');
        }
        // PRIORITY 2: Reminder for expiring subscription (only if active paid subscription)
        else if (sub && await shouldShowReminderBanner(riderId)) {
          console.log('👉 [SubscriptionBanners] >>> SHOWING REMINDER BANNER');
          setBannerType('reminder');
          await recordReminderShown(riderId);
        }
        // PRIORITY 3: Free trial is active
        else if (fullState?.trialStarted && fullState?.trialEndDate) {
          const trialEndMs = new Date(fullState.trialEndDate).getTime();
          const isTrialActive = trialEndMs > Date.now();
          
          if (isTrialActive) {
            console.log('✨ [SubscriptionBanners] >>> SHOWING TRIAL BANNER');
            const daysLeft = Math.ceil((trialEndMs - Date.now()) / (1000 * 60 * 60 * 24));
            console.log(`   Trial has ${daysLeft} day(s) remaining`);
            setBannerType('trial');
          } else {
            console.log('⏰ [SubscriptionBanners] Trial expired, no banner');
            setBannerType(null);
          }
        }
        // No banner to show
        else {
          console.log('ℹ️ [SubscriptionBanners] >>> NO BANNER TO SHOW');
          setBannerType(null);
        }
      } catch (err) {
        console.error('❌ [SubscriptionBanners] Error checking subscription status:', err);
        setBannerType(null);
      } finally {
        setLoading(false);
      }
    };

    checkAndInitializeSubscription();
  }, [riderId]);

  // ========================================================================
  // DON'T RENDER IF LOADING, NO RIDER, OR NO BANNER TO SHOW
  // ========================================================================
  if (loading || !riderId || !bannerType) {
    return null;
  }

  // ========================================================================
  // FREE TRIAL BANNER - Matches index.html success/green banner style
  // ========================================================================
  if (bannerType === 'trial' && state?.trialEndDate) {
    const trialEndMs = new Date(state.trialEndDate).getTime();
    const daysLeft = Math.ceil((trialEndMs - Date.now()) / (1000 * 60 * 60 * 24));

    console.log('🎨 [SubscriptionBanners] Rendering trial banner with', daysLeft, 'days left');

    return (
      <TouchableOpacity 
        style={styles.bannerSuccess}
        onPress={() => navigation.navigate('SubscriptionScreen')}
        activeOpacity={0.7}
      >
        <Text style={styles.bannerIcon}>✨</Text>
        <View style={styles.bannerContent}>
          <Text style={[styles.bannerText, styles.bannerSuccessText]}>
            <Text style={styles.bannerSuccessBold}>Enjoy 1-Day Free Trial</Text>
            {'\n'}
            {daysLeft > 0
              ? `${daysLeft} day${daysLeft > 1 ? 's' : ''} left · Pay before or after`
              : 'Trial ending soon · Subscribe now'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // ========================================================================
  // REMINDER BANNER - Matches index.html warn/amber banner style
  // ========================================================================
  if (bannerType === 'reminder' && subscription?.expiryDate) {
    const expiryMs = new Date(subscription.expiryDate).getTime();
    const daysLeft = Math.ceil((expiryMs - Date.now()) / (1000 * 60 * 60 * 24));

    console.log('🎨 [SubscriptionBanners] Rendering reminder banner with', daysLeft, 'days left');

    return (
      <TouchableOpacity 
        style={styles.bannerWarn}
        onPress={() => navigation.navigate('SubscriptionScreen')}
        activeOpacity={0.7}
      >
        <Text style={styles.bannerIcon}>👉</Text>
        <View style={styles.bannerContent}>
          <Text style={[styles.bannerText, styles.bannerWarnText]}>
            <Text style={styles.bannerWarnBold}>Subscription Expiring Soon</Text>
            {'\n'}
            {daysLeft} day{daysLeft === 1 ? '' : 's'} remaining · Renew now to stay active
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // ========================================================================
  // ACCOUNT LOCKED BANNER - Matches index.html error/red banner style
  // ========================================================================
  if (bannerType === 'locked') {
    console.log('🎨 [SubscriptionBanners] Rendering locked banner');

    return (
      <TouchableOpacity 
        style={styles.bannerError}
        onPress={() => navigation.navigate('SubscriptionScreen')}
        activeOpacity={0.7}
      >
        <Text style={styles.bannerIcon}>🔒</Text>
        <View style={styles.bannerContent}>
          <Text style={[styles.bannerText, styles.bannerErrorText]}>
            <Text style={styles.bannerErrorBold}>Account Locked</Text>
            {'\n'}
            Subscription expired · {state?.lockReason || 'Payment required to continue'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return null;
}

// ============================================================================
// STYLES - 100% Aligned with index.html design system
// ============================================================================

const styles = StyleSheet.create({
  // Base banner styles - matches index.html .banner class
  bannerBase: {
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },

  // Success/Green banner - matches index.html .banner.success
  bannerSuccess: {
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#e6f5ef', // --signal-green-bg
  },

  // Warn/Amber banner - matches index.html .banner.warn
  bannerWarn: {
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#fdf3df', // --signal-amber-bg
  },

  // Error/Red banner - matches index.html .banner.error
  bannerError: {
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#fdecea', // --signal-red-bg
  },

  // Icon - emoji
  bannerIcon: {
    fontSize: 18,
    lineHeight: 20,
  },

  // Content wrapper
  bannerContent: {
    flex: 1,
  },

  // Text - matches index.html .banner base font-size: 12.5px
  bannerText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#5b606c', // Default text color for success
  },

  // Bold text inside banner - title
  bannerBold: {
    fontWeight: '700',
    color: '#1a1c20', // Dark ink for emphasis
  },

  // Override text color for warn banner
  bannerWarnText: {
    color: '#8a5c0d', // Warn text color from index.html
  },

  bannerWarnBold: {
    fontWeight: '700',
    color: '#8a5c0d',
  },

  // Override text color for error banner
  bannerErrorText: {
    color: '#a5312c', // Error text color from index.html
  },

  bannerErrorBold: {
    fontWeight: '700',
    color: '#a5312c',
  },

  // Override text color for success banner
  bannerSuccessText: {
    color: '#146142', // Success text color from index.html
  },

  bannerSuccessBold: {
    fontWeight: '700',
    color: '#146142',
  },
});