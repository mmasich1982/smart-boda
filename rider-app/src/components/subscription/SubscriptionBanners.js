// rider-app/src/components/subscription/SubscriptionBanners.js
// ============================================================================
// ✅ MIGRATION: LocalStore → IndexedDBAdapter
// ✅ NOTIFICATIONS: Proper timing and i18n localization
// Spec Section 9: Trial notifications, payment notifications, price alerts
// ============================================================================

import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated
} from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';

/**
 * ✅ TrialStatusBanner
 * Shows on LAST DAY of trial only (fires ONE notification)
 * SPEC SECTION 9: checkTrialNotifications()
 */
export const TrialStatusBanner = ({
  daysLeft,
  isTrialUser,
  onDismiss,
  riderId
}) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  // ✅ Only show on last day (daysLeft === 0)
  if (!isTrialUser || daysLeft !== 0 || dismissed) {
    return null;
  }

  const handleDismiss = async () => {
    setDismissed(true);
    
    // Mark as shown in cache to prevent repeat
    try {
      await indexedDbAdapter.kvSet(
        `trial_notification_shown_${riderId}`,
        JSON.stringify({
          shown_at: new Date().toISOString(),
          dismissed: true
        })
      );
    } catch (err) {
      console.warn('Failed to cache trial notification:', err);
    }

    onDismiss?.();
  };

  return (
    <View style={styles.trialBanner}>
      <View style={styles.bannerContent}>
        <Text style={styles.trialIcon}>🎉</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.trialTitle}>
            {t('subscription.trial_ending_today')}
          </Text>
          <Text style={styles.trialMessage}>
            {t('subscription.choose_plan_to_continue')}
          </Text>
        </View>
      </View>
      {onDismiss && (
        <TouchableOpacity onPress={handleDismiss}>
          <Text style={styles.dismissButton}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

/**
 * ✅ SubscriptionStatusBanner
 * Shows on Home screen when subscription ≤ 2 days left
 * SPEC SECTION 9: subscriptionStatusBanner()
 */
export const SubscriptionStatusBanner = ({
  daysLeft,
  isTrialUser,
  navigation
}) => {
  const { t } = useTranslation();

  // Only show when ≤ 2 days left
  if (daysLeft > 2 || daysLeft < 0) {
    return null;
  }

  let backgroundColor = '#fff3e0';
  let borderColor = '#ff9800';
  let messageText = '';
  let urgencyLevel = 'warning';

  if (daysLeft === 0) {
    backgroundColor = '#fdecea';
    borderColor = '#ef5350';
    messageText = isTrialUser
      ? t('subscription.trial_ends_today')
      : t('subscription.subscription_ends_today');
    urgencyLevel = 'error';
  } else if (daysLeft === 1) {
    backgroundColor = '#fff3e0';
    borderColor = '#ff9800';
    messageText = isTrialUser
      ? t('subscription.trial_ends_tomorrow')
      : t('subscription.subscription_ends_tomorrow');
    urgencyLevel = 'warning';
  } else if (daysLeft === 2) {
    backgroundColor = '#fff8f0';
    borderColor = '#ffb366';
    messageText = isTrialUser
      ? t('subscription.trial_ends_in_2_days')
      : t('subscription.subscription_ends_in_2_days');
    urgencyLevel = 'info';
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
      onPress={() => navigation.navigate('SubscriptionScreen')}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.statusMessage,
          { color: urgencyLevel === 'error' ? '#c62828' : '#e65100' }
        ]}
      >
        {messageText}
      </Text>
      <Text style={styles.statusTap}>{t('subscription.tap_to_manage')} →</Text>
    </TouchableOpacity>
  );
};

/**
 * ✅ PriceChangeBanner
 * Shows when Super Admin has scheduled a price change
 * SPEC: "Pending price change alert"
 */
export const PriceChangeBanner = ({ pendingChange, onDismiss, riderId }) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  if (!pendingChange || dismissed) {
    return null;
  }

  const handleViewPriceChange = async () => {
    try {
      // Mark as viewed in cache
      await indexedDbAdapter.kvSet(
        `price_change_viewed_${riderId}`,
        JSON.stringify({ viewedAt: new Date().toISOString() })
      );
    } catch (err) {
      console.warn('Failed to mark price change as viewed:', err);
    }

    setDismissed(true);
    onDismiss?.();
  };

  const biweeklyText = pendingChange.biweekly_price
    ? `Bi-Weekly: KES ${pendingChange.biweekly_price}`
    : '';
  const monthlyText = pendingChange.monthly_price
    ? `Monthly: KES ${pendingChange.monthly_price}`
    : '';
  const separator =
    biweeklyText && monthlyText ? ' | ' : '';

  return (
    <TouchableOpacity
      style={styles.priceChangeBanner}
      onPress={handleViewPriceChange}
    >
      <View style={styles.priceChangeContent}>
        <Text style={styles.priceChangeIcon}>⚠️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.priceChangeTitle}>
            {t('subscription.price_change_notice')}
          </Text>
          <Text style={styles.priceChangeDetails}>
            {biweeklyText}
            {separator}
            {monthlyText}
          </Text>
          <Text style={styles.priceChangeTime}>
            {t('subscription.effective_in')}
            {` ${pendingChange.hours_until} ${t('common.hours')}`}
          </Text>
        </View>
      </View>
      <Text style={styles.priceChangeAction}>→</Text>
    </TouchableOpacity>
  );
};

/**
 * ✅ UnlockedNotificationBanner
 * Shows when account is unlocked after successful payment
 */
export const UnlockedNotificationBanner = ({ onDismiss }) => {
  const { t } = useTranslation();
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
          <Text style={styles.unlockedTitle}>
            {t('subscription.account_unlocked')}
          </Text>
          <Text style={styles.unlockedMessage}>
            {t('subscription.subscription_active_enjoy')}
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
export const PaymentPendingBanner = ({ frequency, amount, riderId }) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const frequencyLabel =
    frequency === 'biweekly'
      ? t('subscription.biweekly_plan')
      : t('subscription.monthly_plan');

  const handleDismiss = async () => {
    setDismissed(true);
    try {
      await indexedDbAdapter.kvSet(
        `payment_pending_dismissed_${riderId}`,
        JSON.stringify({ dismissedAt: new Date().toISOString() })
      );
    } catch (err) {
      console.warn('Failed to cache banner dismissal:', err);
    }
  };

  return (
    <View style={styles.pendingBanner}>
      <View style={styles.pendingContent}>
        <Text style={styles.pendingIcon}>⏳</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.pendingTitle}>
            {t('subscription.payment_under_review')}
          </Text>
          <Text style={styles.pendingDetails}>
            {frequencyLabel} {t('common.plan')} (KES {amount})
          </Text>
          <Text style={styles.pendingMessage}>
            {t('subscription.team_will_verify')}
          </Text>
        </View>
      </View>
      <TouchableOpacity onPress={handleDismiss} style={styles.pendingDismiss}>
        <Text style={styles.dismissButton}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

/**
 * ✅ ExpiryWarningBanner (2 days before expiry)
 * SPEC: Check subscription 2 days before expiry, 3x per day
 */
export const ExpiryWarningBanner = ({
  daysLeft,
  isTrialUser,
  navigation,
  riderId
}) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  // Only show when 2 days left (≤ 2 but not yet expired)
  if (daysLeft > 2 || daysLeft < 0 || dismissed) {
    return null;
  }

  const handleDismiss = async () => {
    setDismissed(true);
    try {
      await indexedDbAdapter.kvSet(
        `expiry_warning_dismissed_${riderId}`,
        JSON.stringify({ dismissedAt: new Date().toISOString() })
      );
    } catch (err) {
      console.warn('Failed to cache dismissal:', err);
    }
  };

  let message = '';
  if (daysLeft === 0) {
    message = isTrialUser
      ? t('subscription.trial_expires_today')
      : t('subscription.subscription_expires_today');
  } else if (daysLeft === 1) {
    message = isTrialUser
      ? t('subscription.trial_expires_tomorrow')
      : t('subscription.subscription_expires_tomorrow');
  } else if (daysLeft === 2) {
    message = isTrialUser
      ? t('subscription.trial_expires_in_2_days')
      : t('subscription.subscription_expires_in_2_days');
  }

  return (
    <View style={styles.expiryWarningBanner}>
      <View style={styles.expiryWarningContent}>
        <Text style={styles.expiryWarningIcon}>⏰</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.expiryWarningTitle}>{message}</Text>
          <Text style={styles.expiryWarningMessage}>
            {t('subscription.renew_now_to_continue')}
          </Text>
        </View>
      </View>
      <TouchableOpacity onPress={handleDismiss}>
        <Text style={styles.dismissButton}>✕</Text>
      </TouchableOpacity>
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
    borderRadius: 8,
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
    gap: 10
  },
  trialIcon: {
    fontSize: 20
  },
  trialTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2e7d32',
    marginBottom: 2
  },
  trialMessage: {
    fontSize: 11,
    color: '#558b2f',
    lineHeight: 14
  },

  // Subscription Status Banner
  statusBanner: {
    borderLeftWidth: 4,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    justifyContent: 'center'
  },
  statusMessage: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 16
  },
  statusTap: {
    fontSize: 10,
    color: '#5b606c',
    fontStyle: 'italic'
  },

  // Price Change Banner
  priceChangeBanner: {
    backgroundColor: '#fff3e0',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
    borderRadius: 8,
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
    gap: 10
  },
  priceChangeIcon: {
    fontSize: 16,
    marginTop: 2
  },
  priceChangeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e65100',
    marginBottom: 2
  },
  priceChangeDetails: {
    fontSize: 11,
    color: '#1a1c20',
    fontWeight: '600',
    marginBottom: 2
  },
  priceChangeTime: {
    fontSize: 10,
    color: '#5b606c',
    fontStyle: 'italic'
  },
  priceChangeAction: {
    fontSize: 14,
    color: '#ff7a1a',
    fontWeight: 'bold',
    marginLeft: 8
  },

  // Unlocked Notification Banner
  unlockedBanner: {
    backgroundColor: '#e8f5e9',
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
    borderRadius: 8,
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
    gap: 10
  },
  unlockedIcon: {
    fontSize: 20
  },
  unlockedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2e7d32',
    marginBottom: 2
  },
  unlockedMessage: {
    fontSize: 11,
    color: '#558b2f',
    lineHeight: 14
  },

  // Payment Pending Banner
  pendingBanner: {
    backgroundColor: '#e3f2fd',
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  pendingContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  pendingIcon: {
    fontSize: 16,
    marginTop: 2
  },
  pendingTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1565c0',
    marginBottom: 2
  },
  pendingDetails: {
    fontSize: 11,
    color: '#1a1c20',
    fontWeight: '600',
    marginBottom: 2
  },
  pendingMessage: {
    fontSize: 10,
    color: '#5b606c',
    lineHeight: 14
  },
  pendingDismiss: {
    marginLeft: 8
  },

  // Expiry Warning Banner
  expiryWarningBanner: {
    backgroundColor: '#fff3e0',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  expiryWarningContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  expiryWarningIcon: {
    fontSize: 16,
    marginTop: 2
  },
  expiryWarningTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e65100',
    marginBottom: 2
  },
  expiryWarningMessage: {
    fontSize: 11,
    color: '#bf360c',
    lineHeight: 14
  },

  // Common
  dismissButton: {
    fontSize: 14,
    color: '#5b606c',
    fontWeight: 'bold'
  }
});

export default {
  TrialStatusBanner,
  SubscriptionStatusBanner,
  PriceChangeBanner,
  UnlockedNotificationBanner,
  PaymentPendingBanner,
  ExpiryWarningBanner
};
