// rider-app/src/components/subscription/SubscriptionBanners.js
// ✅ REUSABLE COMPONENTS: Trial status and price change banners

import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions
} from 'react-native';
import { AppContext } from '../../context/AppContext';
import api from '../../api/client';
import LocalStore from '../../offline/LocalStore';

const { width } = Dimensions.get('window');

/**
 * ✅ TrialStatusBanner
 * Shows on last day of trial only (fires ONE toast)
 * SPEC SECTION 9: checkTrialNotifications()
 */
export const TrialStatusBanner = ({ daysLeft, isTrialUser, onDismiss }) => {
  if (!isTrialUser || daysLeft !== 0) {
    return null; // Only show on last day
  }

  return (
    <View style={styles.trialBanner}>
      <View style={styles.bannerContent}>
        <Text style={styles.trialIcon}>🎉</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.trialTitle}>Last Day of Free Trial!</Text>
          <Text style={styles.trialMessage}>
            Choose Bi-Weekly (KSh 500) or Monthly (KSh 1,000) to continue
          </Text>
        </View>
      </View>
      {onDismiss && (
        <TouchableOpacity onPress={onDismiss}>
          <Text style={styles.dismissButton}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

/**
 * ✅ SubscriptionStatusBanner
 * Shows on Home screen when subscription ≤2 days left
 * SPEC SECTION 9: subscriptionStatusBanner()
 * 
 * Shows different messages for trial vs paid users
 */
export const SubscriptionStatusBanner = ({ daysLeft, isTrialUser, navigation }) => {
  if (daysLeft > 2 || daysLeft < 0) {
    return null; // Only show when ≤2 days
  }

  let backgroundColor = '#fff3e0';
  let borderColor = '#ff9800';
  let messageText = '';
  let urgencyLevel = 'warning';

  if (daysLeft === 0) {
    backgroundColor = '#fdecea';
    borderColor = '#ef5350';
    messageText = isTrialUser 
      ? 'Your free trial ends today. Subscribe now.'
      : 'Your subscription ends today. Renew now.';
    urgencyLevel = 'error';
  } else if (daysLeft === 1) {
    backgroundColor = '#fff3e0';
    borderColor = '#ff9800';
    messageText = isTrialUser
      ? 'Your free trial ends tomorrow. Subscribe now.'
      : 'Your subscription ends tomorrow. Renew now.';
    urgencyLevel = 'warning';
  }

  return (
    <TouchableOpacity
      style={[
        styles.statusBanner,
        { 
          backgroundColor,
          borderLeftColor: borderColor
        }
      ]}
      onPress={() => navigation.navigate('Subscription')}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.statusMessage,
        { color: urgencyLevel === 'error' ? '#c62828' : '#e65100' }
      ]}>
        {messageText}
      </Text>
      <Text style={styles.statusTap}>Tap to manage →</Text>
    </TouchableOpacity>
  );
};

/**
 * ✅ PriceChangeBanner
 * Shows when Super Admin has scheduled a price change (EM-10)
 * SPEC: "Pending price change alert"
 */
export const PriceChangeBanner = ({ pendingChange, onDismiss }) => {
  const { state } = useContext(AppContext);
  const { api } = useContext(AppContext);
  const [dismissed, setDismissed] = useState(false);

  if (!pendingChange || dismissed) {
    return null;
  }

  if (pendingChange.viewed) {
    return null; // Don't show if already viewed
  }

  const handleViewPriceChange = async () => {
    try {
      // Mark as viewed in backend
      await api.post('/api/riders/subscription/mark-price-change-viewed');
      
      // Cache it
      LocalStore.set(
        `price_change_viewed_${state?.riderId}`,
        JSON.stringify({ viewedAt: new Date().toISOString() })
      );
    } catch (err) {
      console.warn('Failed to mark price change as viewed');
    }

    setDismissed(true);
    onDismiss?.();
  };

  return (
    <TouchableOpacity 
      style={styles.priceChangeBanner}
      onPress={handleViewPriceChange}
    >
      <View style={styles.priceChangeContent}>
        <Text style={styles.priceChangeIcon}>⚠️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.priceChangeTitle}>Price Change Notice</Text>
          <Text style={styles.priceChangeDetails}>
            {pendingChange.biweekly_price && `Bi-Weekly: ${pendingChange.biweekly_price} KSh`}
            {pendingChange.biweekly_price && pendingChange.monthly_price && ' | '}
            {pendingChange.monthly_price && `Monthly: ${pendingChange.monthly_price} KSh`}
          </Text>
          <Text style={styles.priceChangeTime}>
            Effective in {pendingChange.hours_until} hours
          </Text>
        </View>
      </View>
      <Text style={styles.priceChangeAction}>→</Text>
    </TouchableOpacity>
  );
};

/**
 * ✅ UnlockedNotificationBanner
 * Shows when account is unlocked after payment
 */
export const UnlockedNotificationBanner = ({ onDismiss }) => {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  return (
    <View style={styles.unlockedBanner}>
      <View style={styles.unlockedContent}>
        <Text style={styles.unlockedIcon}>✅</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.unlockedTitle}>Account Unlocked!</Text>
          <Text style={styles.unlockedMessage}>
            Your subscription is active. Enjoy using the app!
          </Text>
        </View>
      </View>
      <TouchableOpacity onPress={handleDismiss}>
        <Text style={styles.dismissButton}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

/**
 * ✅ PaymentPendingBanner
 * Shows after payment is submitted, waiting for admin verification
 */
export const PaymentPendingBanner = ({ frequency, amount }) => {
  const frequencyLabel = frequency === 'biweekly' ? 'Bi-Weekly' : 'Monthly';

  return (
    <View style={styles.pendingBanner}>
      <View style={styles.pendingContent}>
        <Text style={styles.pendingIcon}>⏳</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.pendingTitle}>Payment Under Review</Text>
          <Text style={styles.pendingDetails}>
            {frequencyLabel} plan (KSh {amount})
          </Text>
          <Text style={styles.pendingMessage}>
            Our team will verify your M-Pesa payment within a few hours
          </Text>
        </View>
      </View>
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  // Trial Status Banner
  trialBanner: {
    backgroundColor: '#e8f5e9',
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  bannerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  trialIcon: {
    fontSize: 20
  },
  trialTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2e7d32',
    marginBottom: 2
  },
  trialMessage: {
    fontSize: 12,
    color: '#558b2f',
    lineHeight: 16
  },

  // Subscription Status Banner
  statusBanner: {
    borderLeftWidth: 4,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    justifyContent: 'center'
  },
  statusMessage: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 18
  },
  statusTap: {
    fontSize: 11,
    color: '#5b606c',
    fontStyle: 'italic'
  },

  // Price Change Banner
  priceChangeBanner: {
    backgroundColor: '#fff3e0',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  priceChangeContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  priceChangeIcon: {
    fontSize: 18,
    marginTop: 2
  },
  priceChangeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e65100',
    marginBottom: 2
  },
  priceChangeDetails: {
    fontSize: 12,
    color: '#1a1c20',
    fontWeight: '600',
    marginBottom: 2
  },
  priceChangeTime: {
    fontSize: 11,
    color: '#5b606c',
    fontStyle: 'italic'
  },
  priceChangeAction: {
    fontSize: 16,
    color: '#ff7a1a',
    fontWeight: 'bold',
    marginLeft: 8
  },

  // Unlocked Notification Banner
  unlockedBanner: {
    backgroundColor: '#e8f5e9',
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  unlockedContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  unlockedIcon: {
    fontSize: 20
  },
  unlockedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2e7d32',
    marginBottom: 2
  },
  unlockedMessage: {
    fontSize: 12,
    color: '#558b2f',
    lineHeight: 16
  },

  // Payment Pending Banner
  pendingBanner: {
    backgroundColor: '#e3f2fd',
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  pendingContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  pendingIcon: {
    fontSize: 18,
    marginTop: 2
  },
  pendingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1565c0',
    marginBottom: 2
  },
  pendingDetails: {
    fontSize: 12,
    color: '#1a1c20',
    fontWeight: '600',
    marginBottom: 2
  },
  pendingMessage: {
    fontSize: 11,
    color: '#5b606c',
    lineHeight: 16
  },

  // Common
  dismissButton: {
    fontSize: 16,
    color: '#5b606c',
    fontWeight: 'bold',
    marginLeft: 12
  }
});

export default {
  TrialStatusBanner,
  SubscriptionStatusBanner,
  PriceChangeBanner,
  UnlockedNotificationBanner,
  PaymentPendingBanner
};
