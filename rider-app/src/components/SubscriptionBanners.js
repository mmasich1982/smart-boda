// rider-app/src/components/SubscriptionBanners.js
// ✅ DIAGNOSTIC VERSION: Includes detailed logging for navigation debugging

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
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
  const [bannerType, setBannerType] = useState(null);

  // ========================================================================
  // DIAGNOSTIC: Log navigation on mount
  // ========================================================================
  useEffect(() => {
    console.log('🔍 [SubscriptionBanners] ===== NAVIGATION DIAGNOSTIC =====');
    console.log('📱 Navigation prop:', navigation);
    console.log('📱 Navigation.navigate:', navigation?.navigate);
    console.log('📱 Navigation.getState():', navigation?.getState?.());
    
    if (navigation?.getState?.()) {
      const navState = navigation.getState();
      console.log('✅ Available route names:', navState.routeNames);
      console.log('✅ FrequencySelectScreen available?', navState.routeNames?.includes('FrequencySelectScreen'));
    }
  }, [navigation]);

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
        
        const ensuredState = await ensureFreeTrial(riderId);
        console.log('📊 [SubscriptionBanners] ensureFreeTrial returned:', {
          trialStarted: ensuredState?.trialStarted,
          trialEndDate: ensuredState?.trialEndDate,
        });

        const sub = await getActiveSubscription(riderId);
        console.log('💳 [SubscriptionBanners] Active subscription:', sub ? 'YES' : 'NO');

        const fullState = await getSubscriptionState(riderId);
        console.log('📋 [SubscriptionBanners] Full subscription state:', {
          trialStarted: fullState?.trialStarted,
          trialEndDate: fullState?.trialEndDate,
          lockedAt: fullState?.lockedAt,
        });

        setSubscription(sub);
        setState(fullState);

        console.log('🎯 [SubscriptionBanners] Determining banner type...');
        
        if (fullState?.lockedAt) {
          console.log('🔒 [SubscriptionBanners] >>> SHOWING LOCKED BANNER');
          setBannerType('locked');
        } else if (sub && await shouldShowReminderBanner(riderId)) {
          console.log('👉 [SubscriptionBanners] >>> SHOWING REMINDER BANNER');
          setBannerType('reminder');
          await recordReminderShown(riderId);
        } else if (fullState?.trialStarted && fullState?.trialEndDate) {
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
        } else {
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
  // HANDLE NAVIGATION - WITH DETAILED LOGGING
  // ========================================================================
  const handleNavigateFrequencySelect = () => {
    console.log('🔵 [SubscriptionBanners] handleNavigate TRIGGERED');
    console.log('📱 Navigation object exists?', !!navigation);
    console.log('📱 Navigation.navigate exists?', !!navigation?.navigate);
    
    const navState = navigation?.getState?.();
    if (navState) {
      console.log('📱 Available screens:', navState.routeNames);
      console.log('📱 FrequencySelectScreen in routes?', navState.routeNames?.includes('FrequencySelectScreen'));
    } else {
      console.warn('⚠️ Cannot get navigation state');
    }

    try {
      console.log('➡️ Attempting navigation to: FrequencySelectScreen');
      navigation.navigate('FrequencySelectScreen');
      console.log('✅ Navigation.navigate() call executed');
    } catch (error) {
      console.error('❌ Navigation error caught:', error);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error name:', error.name);
      Alert.alert('Navigation Error', `Cannot navigate: ${error.message}`);
    }
  };

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

    console.log('🎨 [SubscriptionBanners] Rendering trial banner with', daysLeft, 'days left');

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
          style={styles.bannerButton}
          onPress={handleNavigateFrequencySelect}
          activeOpacity={0.7}
        >
          <Text style={styles.bannerButtonText}>Subscribe Now →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ========================================================================
  // REMINDER BANNER
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
          onPress={handleNavigateFrequencySelect}
          activeOpacity={0.7}
        >
          <Text style={styles.bannerButtonText}>Subscribe Now →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ========================================================================
  // ACCOUNT LOCKED BANNER
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
          onPress={handleNavigateFrequencySelect}
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 14,
    gap: 12,
  },

  bannerTrial: {
    backgroundColor: '#e6f5ef',
    borderLeftWidth: 4,
    borderLeftColor: '#1e9e6f',
  },

  bannerReminder: {
    backgroundColor: '#fdf3df',
    borderLeftWidth: 4,
    borderLeftColor: '#c98a12',
  },

  bannerLocked: {
    backgroundColor: '#fdecea',
    borderLeftWidth: 4,
    borderLeftColor: '#e0453f',
  },

  bannerIcon: {
    fontSize: 24,
  },
  bannerIconText: {
    fontSize: 20,
  },

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