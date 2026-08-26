// rider-app/src/components/SubscriptionBanners.js
// ✅ REFACTORED: Subscription banners for Home Screen
// ✅ DISPLAYS BELOW HERO FARE CARD: Free Trial, Reminder, Account Lock
// ✅ UI/UX: Matches index.html design system
// ✅ BUSINESS LOGIC: Trial status, reminder rate limiting, lock detection
// ✅ OFFLINE-FIRST: All data persisted via IndexedDB adapter
// ✅ AUTO-INIT: Ensures free trial is initialized for new riders on first home screen load

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
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
          console.log('✅ SubscriptionBanners: Loaded rider ID:', id);
        } else {
          console.warn('⚠️ SubscriptionBanners: No rider ID found');
        }
      } catch (err) {
        console.error('❌ SubscriptionBanners: Error loading rider ID:', err);
      }
    };
    loadRiderId();
  }, []);

  // ========================================================================
  // AUTO-INITIALIZE FREE TRIAL + CHECK SUBSCRIPTION STATUS
  // ========================================================================
  useEffect(() => {
    if (!riderId) {
      setLoading(false);
      return;
    }

    const checkAndInitializeSubscription = async () => {
      try {
        console.log('🔍 SubscriptionBanners: Checking subscription for rider:', riderId);
        
        // ✅ CRITICAL: Ensure free trial is initialized for new riders
        // This is the key fix - it auto-initializes trial on first load
        await ensureFreeTrial(riderId);
        console.log('✅ SubscriptionBanners: Free trial ensured');

        // Now check subscription status
        const sub = await getActiveSubscription(riderId);
        const subState = await getSubscriptionState(riderId);

        console.log('📊 SubscriptionBanners: Subscription state:', {
          subscription: sub ? 'ACTIVE' : 'NONE',
          trialStarted: subState?.trialStarted,
          trialEndDate: subState?.trialEndDate,
          lockedAt: subState?.lockedAt,
        });

        setSubscription(sub);
        setState(subState);

        // ✅ Determine which banner to show (priority order)
        if (subState?.lockedAt) {
          // Account is locked
          console.log('🔒 SubscriptionBanners: Account locked, showing lock banner');
          setBannerType('locked');
        } else if (await shouldShowReminderBanner(riderId)) {
          // Show reminder (2 days before expiry, max 3x per day)
          console.log('👉 SubscriptionBanners: Showing reminder banner');
          setBannerType('reminder');
          await recordReminderShown(riderId);
        } else if (await isFreTrialActive(riderId)) {
          // Show free trial banner
          console.log('✨ SubscriptionBanners: Showing free trial banner');
          setBannerType('trial');
        } else {
          console.log('ℹ️ SubscriptionBanners: No banner to show');
          setBannerType(null);
        }
      } catch (err) {
        console.error('❌ SubscriptionBanners: Error checking subscription status:', err);
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
  // FREE TRIAL BANNER
  // ========================================================================
  if (bannerType === 'trial' && state?.trialEndDate) {
    const trialEndMs = new Date(state.trialEndDate).getTime();
    const daysLeft = Math.ceil((trialEndMs - Date.now()) / (1000 * 60 * 60 * 24));

    return (
      <View style={[styles.banner, styles.bannerTrial]}>
        <View style={styles.bannerIcon}>
          <Text style={styles.bannerIconText}>✨</Text>
        </View>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerTitle}>Enjoy 1-Day Free Trial</Text>
          <Text style={styles.bannerDesc}>
            {daysLeft > 0
              ? `${daysLeft} day${daysLeft > 1 ? 's' : ''} left · Pay before or after`
              : 'Trial ending soon · Subscribe now'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.bannerAction}
          onPress={() => navigation.navigate('SubscriptionScreen')}
          activeOpacity={0.7}
        >
          <Text style={styles.bannerActionText}>→</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ========================================================================
  // REMINDER BANNER (2 days before expiry)
  // ========================================================================
  if (bannerType === 'reminder' && subscription?.expiryDate) {
    const expiryMs = new Date(subscription.expiryDate).getTime();
    const daysLeft = Math.ceil((expiryMs - Date.now()) / (1000 * 60 * 60 * 24));

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
          style={styles.bannerAction}
          onPress={() => navigation.navigate('SubscriptionScreen')}
          activeOpacity={0.7}
        >
          <Text style={styles.bannerActionText}>→</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ========================================================================
  // ACCOUNT LOCKED BANNER
  // ========================================================================
  if (bannerType === 'locked') {
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
          style={styles.bannerAction}
          onPress={() => navigation.navigate('SubscriptionScreen')}
          activeOpacity={0.7}
        >
          <Text style={styles.bannerActionText}>→</Text>
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

  // Action Button
  bannerAction: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bannerActionText: {
    fontSize: 18,
    color: '#ff7a1a',
    fontWeight: '700',
  },
});