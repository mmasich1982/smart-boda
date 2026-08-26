// rider-app/src/components/SubscriptionBanners.js
// ✅ REFACTORED: Subscription banners for Home Screen
// ✅ DISPLAYS BELOW HERO FARE CARD: Free Trial, Reminder, Account Lock
// ✅ UI/UX: Matches index.html design system
// ✅ BUSINESS LOGIC: Trial status, reminder rate limiting, lock detection
// ✅ OFFLINE-FIRST: All data persisted via IndexedDB adapter
// ✅ AUTO-INIT: Ensures free trial is initialized for new riders on first home screen load
// ✅ IMPROVED: Better state management and direct state usage after initialization
// ✅ UPDATED: "Subscribe Now" button on all banners instead of arrow
// ✅ FIXED: Navigation screen names corrected to match actual registration
//           'SelectFrequency' instead of 'FrequencySelectScreen'
// ✅ FIXED: Added useFocusEffect to refresh subscription state when returning to Home
//           This ensures banner hides after successful payment/subscription creation

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getActiveSubscription,
  getSubscriptionState,
  isFreTrialActive,
  shouldShowReminderBanner,
  recordReminderShown,
  isSubscriptionExpired,
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
  // CHECK AND INITIALIZE SUBSCRIPTION STATE
  // ========================================================================
  const checkAndInitializeSubscription = async (currentRiderId) => {
    if (!currentRiderId) {
      return;
    }

    try {
      console.log('🔍 [SubscriptionBanners] Starting subscription check for rider:', currentRiderId);
      
      // ✅ CRITICAL: Ensure free trial is initialized for new riders
      const ensuredState = await ensureFreeTrial(currentRiderId);
      console.log('📊 [SubscriptionBanners] ensureFreeTrial returned:', {
        trialStarted: ensuredState?.trialStarted,
        trialEndDate: ensuredState?.trialEndDate,
      });

      // Get the subscription (if any paid plan is active)
      const sub = await getActiveSubscription(currentRiderId);
      console.log('💳 [SubscriptionBanners] Active subscription:', sub ? 'YES' : 'NO');

      // Get full state (trial, reminders, lock)
      const fullState = await getSubscriptionState(currentRiderId);
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
      else if (sub && await shouldShowReminderBanner(currentRiderId)) {
        console.log('👉 [SubscriptionBanners] >>> SHOWING REMINDER BANNER');
        setBannerType('reminder');
        await recordReminderShown(currentRiderId);
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

  // ========================================================================
  // INITIAL LOAD: Check subscription on first mount
  // ========================================================================
  useEffect(() => {
    if (!riderId) {
      return;
    }

    checkAndInitializeSubscription(riderId);
  }, [riderId]);

  // ========================================================================
  // FOCUS EFFECT: Refresh subscription state when screen is focused
  // ✅ CRITICAL: This ensures banner updates after user returns from payment screen
  // ========================================================================
  useFocusEffect(
    React.useCallback(() => {
      console.log('🔄 [SubscriptionBanners] Screen focused - refreshing subscription state');
      if (riderId) {
        checkAndInitializeSubscription(riderId);
      }

      return () => {
        // Cleanup if needed
      };
    }, [riderId])
  );

  // ========================================================================
  // DON'T RENDER IF LOADING, NO RIDER, OR NO BANNER TO SHOW
  // ========================================================================
  if (loading || !riderId || !bannerType) {
    return null;
  }

  // ========================================================================
  // FREE TRIAL BANNER - "Subscribe Now" button (✅ FIXED SCREEN NAME)
  // ========================================================================
  if (bannerType === 'trial' && state?.trialEndDate) {
    const trialEndMs = new Date(state.trialEndDate).getTime();
    const hoursLeft = Math.ceil((trialEndMs - Date.now()) / (1000 * 60 * 60));

    console.log('🎨 [SubscriptionBanners] Rendering trial banner with', hoursLeft, 'hours left');

    return (
      <View style={[styles.banner, styles.bannerTrial]}>
        <View style={styles.bannerIcon}>
          <Text style={styles.bannerIconText}>✨</Text>
        </View>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerTitle}>Enjoy 2-Hour Free Trial</Text>
          <Text style={styles.bannerDesc}>
            {hoursLeft > 0
              ? `${hoursLeft} hour${hoursLeft > 1 ? 's' : ''} left · Pay before or after`
              : 'Trial ending soon · Subscribe now'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.bannerButton}
          onPress={() => {
            console.log('🔵 [Trial Banner] Navigating to SelectFrequency');
            navigation.navigate('SelectFrequency');
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.bannerButtonText}>Subscribe Now →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ========================================================================
  // REMINDER BANNER (2 days before expiry) - "Subscribe Now" button (✅ FIXED SCREEN NAME)
  // ========================================================================
  if (bannerType === 'reminder' && subscription?.expiryDate) {
    const expiryMs = new Date(subscription.expiryDate).getTime();
    const daysLeft = Math.ceil((expiryMs - Date.now()) / (1000 * 60 * 60 * 24));

    console.log('🎨 [SubscriptionBanners] Rendering reminder banner with', daysLeft, 'days left');

    return (
      <View style={[styles.banner, styles.bannerReminder]}>
        <View style={styles.bannerIcon}>
          <Text style={styles.bannerIconText}>👉</Text>
        </View>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerTitle}>Subscription Expiring Soon</Text>
          <Text style={styles.bannerDesc}>
            {daysLeft} day{daysLeft === 1 ? '' : 's'} remaining · Renew now to stay active
          </Text>
        </View>
        <TouchableOpacity
          style={styles.bannerButton}
          onPress={() => {
            console.log('🔵 [Reminder Banner] Navigating to SelectFrequency');
            navigation.navigate('SelectFrequency');
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.bannerButtonText}>Subscribe Now →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ========================================================================
  // ACCOUNT LOCKED BANNER - "Subscribe Now" button (✅ FIXED SCREEN NAME)
  // ========================================================================
  if (bannerType === 'locked') {
    console.log('🎨 [SubscriptionBanners] Rendering locked banner');

    return (
      <View style={[styles.banner, styles.bannerLocked]}>
        <View style={styles.bannerIcon}>
          <Text style={styles.bannerIconText}>🔒</Text>
        </View>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerTitle}>Account Locked</Text>
          <Text style={styles.bannerDesc}>
            Subscription expired · {state?.lockReason || 'Payment required to continue'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.bannerButton}
          onPress={() => {
            console.log('🔵 [Locked Banner] Navigating to SelectFrequency');
            navigation.navigate('SelectFrequency');
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.bannerButtonText}>Subscribe Now →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  // Container & Layout
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 14,
    gap: 12,
  },

  // Free Trial Banner - Green/Success styling
  bannerTrial: {
    backgroundColor: '#e6f5ef',
    borderLeftWidth: 4,
    borderLeftColor: '#1e9e6f',
  },

  // Reminder Banner - Amber/Warning styling
  bannerReminder: {
    backgroundColor: '#fdf3df',
    borderLeftWidth: 4,
    borderLeftColor: '#c98a12',
  },

  // Locked Banner - Red/Error styling
  bannerLocked: {
    backgroundColor: '#fdecea',
    borderLeftWidth: 4,
    borderLeftColor: '#e0453f',
  },

  // Icon
  bannerIcon: {
    fontSize: 24,
  },
  bannerIconText: {
    fontSize: 20,
  },

  // Content
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 2,
  },
  bannerDesc: {
    fontSize: 11.5,
    color: '#5b606c',
    lineHeight: 16,
  },

  // Subscribe Now Button (✅ UNIFIED for all banners)
  bannerButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ff7a1a',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#fff',
  },
});