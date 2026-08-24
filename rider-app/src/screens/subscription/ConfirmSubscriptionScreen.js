// rider-app/src/screens/subscription/ConfirmSubscriptionScreen.js
// ============================================================================
// UPDATED: ConfirmSubscriptionScreen - Sync Queue Integration
// ✅ Saves payment locally first
// ✅ Adds to sync queue for incremental sync
// ✅ Updates IndexedDB subscription state
// ============================================================================

import React, { useState, useCallback, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useRider } from '../../rider/RiderContext';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import subscriptionGate from '../../utils/subscriptionGate_IndexedDBUtilities';

const ConfirmSubscriptionScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { state } = useRider();
  const riderId = state?.riderId;

  const { frequency, label, days, price, isRenewal } = route.params || {};

  const [mpesaCode, setMpesaCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [syncMessage, setSyncMessage] = useState('');

  // ✅ CONTROL: Prevent double submissions
  const isSubmittingRef = useRef(false);
  const isMountedRef = useRef(true);

  // ========================================================================
  // PAYMENT HANDLER (IndexedDB-First + Sync Queue)
  // ========================================================================

  const handlePayment = useCallback(async () => {
    if (isSubmittingRef.current || !isMountedRef.current) {
      return;
    }

    isSubmittingRef.current = true;

    try {
      // Validation
      const validation = subscriptionGate.validateMpesaCode(mpesaCode);
      if (!validation.valid) {
        setError(validation.error);
        isSubmittingRef.current = false;
        return;
      }

      if (!riderId || !frequency) {
        setError('missing_required_data');
        isSubmittingRef.current = false;
        return;
      }

      setSaving(true);
      setError(null);
      setSuccessMessage('');
      setSyncMessage('Saving payment locally...');

      // ========================================================================
      // STEP 1: Save payment locally to IndexedDB
      // ========================================================================

      const paymentRecord = {
        id: `payment_${riderId}_${Date.now()}`,
        rider_id: riderId,
        frequency,
        mpesa_code: validation.code,
        amount: price,
        days,
        submitted_at: new Date().toISOString(),
        reconciliation: 'Pending',
        sync_status: 'pending'
      };

      console.log('💾 Saving payment locally...', paymentRecord);

      await indexedDbAdapter.kvSet(
        `payment_${paymentRecord.id}`,
        JSON.stringify(paymentRecord)
      );

      setSyncMessage('Payment saved locally!');

      // ========================================================================
      // STEP 2: Update subscription cache with new state
      // ========================================================================

      console.log('📝 Updating subscription cache...');

      const now = new Date();
      const expiryDays = subscriptionGate.SUBSCRIPTION_PLANS[
        frequency.toUpperCase()
      ]?.days || 30;

      const currentSub = await subscriptionGate.getSubscriptionFromCache(riderId);
      const baseDate = currentSub?.expiry_at
        ? new Date(Math.max(new Date(currentSub.expiry_at).getTime(), Date.now()))
        : now;

      const newExpiry = new Date(
        baseDate.getTime() + expiryDays * 24 * 60 * 60 * 1000
      );

      const updatedSubscription = {
        ...currentSub,
        frequency,
        has_ever_paid: true,
        expiry_at: newExpiry.toISOString(),
        last_payment_at: now.toISOString(),
        last_payment_amount: price,
        total_paid_lifetime: (currentSub?.total_paid_lifetime || 0) + price,
        locked: false,
        lock_reason: null,
        locked_at: null,
        sync_status: 'pending' // Mark for sync
      };

      await subscriptionGate.cacheSubscription(riderId, updatedSubscription);

      setSyncMessage('Subscription updated locally!');

      // ========================================================================
      // STEP 3: Add to sync queue for backend sync
      // ========================================================================

      console.log('📤 Adding to sync queue...');

      const syncQueueId = await subscriptionGate.addToSyncQueue(
        'pay', // action
        'subscription', // table
        {
          frequency,
          mpesa_code: validation.code,
          amount: price,
          days: expiryDays,
          new_expiry_at: newExpiry.toISOString()
        },
        riderId
      );

      setSyncMessage('Added to sync queue! Will sync when online...');

      if (!isMountedRef.current) return;

      // ========================================================================
      // STEP 4: Show success message
      // ========================================================================

      setSuccessMessage(
        `✅ Payment saved locally!\n\n` +
        `M-Pesa Code: ${validation.code}\n` +
        `Frequency: ${label}\n` +
        `New Expiry: ${newExpiry.toLocaleDateString('en-KE')}\n\n` +
        `Your payment will sync to the server when you're online.`
      );

      console.log('✅ Payment processing complete');

      // Navigate back after delay
      setTimeout(() => {
        if (isMountedRef.current) {
          navigation.navigate('SubscriptionScreen');
        }
      }, 2000);

    } catch (err) {
      console.error('❌ Payment error:', err);
      if (isMountedRef.current) {
        setError(
          err.response?.data?.detail ||
          err.message ||
          t('subscription.payment_error')
        );
      }
    } finally {
      setSaving(false);
      isSubmittingRef.current = false;
    }
  }, [mpesaCode, riderId, frequency, price, label, navigation, t]);

  // ========================================================================
  // LIFECYCLE
  // ========================================================================

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 60 }}
    >
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backLink}
      >
        <Text style={styles.backLinkText}>← {t('common.back')}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{t('subscription.confirm_payment')}</Text>

      {/* ERROR BANNER */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Text style={styles.dismissText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SUCCESS BANNER */}
      {successMessage && !saving && (
        <View style={styles.successBanner}>
          <Text style={styles.successBannerText}>{successMessage}</Text>
        </View>
      )}

      {/* SYNC MESSAGE */}
      {syncMessage && saving && (
        <View style={styles.syncMessageBanner}>
          <ActivityIndicator size="small" color="#1976d2" style={styles.syncSpinner} />
          <Text style={styles.syncMessageText}>{syncMessage}</Text>
        </View>
      )}

      {/* PRICE BREAKDOWN */}
      <View style={styles.breakdownCard}>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{t('subscription.plan')}</Text>
          <Text style={styles.breakdownValue}>{label}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{t('subscription.duration')}</Text>
          <Text style={styles.breakdownValue}>
            {days} {t('common.days')}
          </Text>
        </View>
        <View
          style={[
            styles.breakdownRow,
            styles.breakdownRowHighlight
          ]}
        >
          <Text style={styles.breakdownLabelHighlight}>
            {t('subscription.amount_to_pay')}
          </Text>
          <Text style={styles.breakdownValueHighlight}>
            KES {price.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* M-PESA INSTRUCTIONS */}
      <View style={styles.instructionsCard}>
        <Text style={styles.instructionsTitle}>
          {t('subscription.how_to_pay')}
        </Text>

        <View style={styles.instructionStep}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNumber}>1</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>
              {t('subscription.dial_mpesa')}
            </Text>
            <Text style={styles.stepText}>
              {t('subscription.use_333_or_app')}
            </Text>
          </View>
        </View>

        <View style={styles.instructionStep}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNumber}>2</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>
              {t('subscription.select_send_money')}
            </Text>
            <Text style={styles.stepText}>
              {t('subscription.send_money_description')}
            </Text>
          </View>
        </View>

        <View style={styles.instructionStep}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNumber}>3</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>
              {t('subscription.enter_our_number')}
            </Text>
            <Text style={styles.stepText}>0757 334 481</Text>
          </View>
        </View>

        <View style={styles.instructionStep}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNumber}>4</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>
              {t('subscription.enter_amount_pin')}
            </Text>
            <Text style={styles.stepText}>
              KES {price.toLocaleString()} + {t('subscription.your_mpesa_pin')}
            </Text>
          </View>
        </View>

        <View style={styles.instructionStep}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNumber}>5</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>
              {t('subscription.get_confirmation')}
            </Text>
            <Text style={styles.stepText}>
              {t('subscription.mpesa_sends_code')}
            </Text>
          </View>
        </View>
      </View>

      {/* M-PESA CODE INPUT */}
      <View style={styles.field}>
        <Text style={styles.label}>
          {t('subscription.mpesa_code')}
          <Text style={styles.required}> *</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder={t('subscription.code_example')}
          placeholderTextColor="#b0a89d"
          value={mpesaCode}
          onChangeText={(val) => {
            setMpesaCode(val);
            setError(null);
          }}
          editable={!saving}
          autoCapitalize="characters"
          maxLength={20}
        />
        <Text style={styles.hint}>
          {t('subscription.enter_code_from_safaricom')}
        </Text>
      </View>

      {/* OFFLINE NOTICE */}
      <View style={styles.offlineBanner}>
        <Text style={styles.offlineIcon}>📱</Text>
        <Text style={styles.offlineText}>
          Your payment is saved locally. It will sync automatically when you're online.
        </Text>
      </View>

      {/* INFO BANNER */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoText}>
          {t('subscription.payment_verification_info')}
        </Text>
      </View>

      {/* SUBMIT BUTTON */}
      <TouchableOpacity
        style={[
          styles.primaryBtn,
          (saving || !mpesaCode) && styles.primaryBtnDisabled
        ]}
        onPress={handlePayment}
        disabled={saving || !mpesaCode}
        activeOpacity={0.8}
      >
        <View style={styles.btnContent}>
          {saving && (
            <ActivityIndicator
              size="small"
              color="#fff"
              style={styles.btnSpinner}
            />
          )}
          <Text style={styles.primaryBtnText}>
            {saving
              ? t('common.submitting')
              : t('subscription.submit_payment')}
          </Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f6f4ef'
  },

  backLink: {
    marginBottom: 16
  },
  backLinkText: {
    fontSize: 14,
    color: '#ff7a1a',
    fontWeight: '600'
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 16
  },

  errorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  errorText: {
    fontSize: 12,
    color: '#a5312c',
    fontWeight: '600',
    flex: 1
  },
  dismissText: {
    fontSize: 16,
    color: '#a5312c',
    fontWeight: '700',
    marginLeft: 12
  },

  successBanner: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1.5,
    borderColor: '#a5d6a7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  successBannerText: {
    fontSize: 12,
    color: '#2e7d32',
    fontWeight: '600',
    lineHeight: 18
  },

  syncMessageBanner: {
    backgroundColor: '#e3f2fd',
    borderWidth: 1.5,
    borderColor: '#90caf9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center'
  },
  syncSpinner: {
    marginRight: 10
  },
  syncMessageText: {
    fontSize: 12,
    color: '#1565c0',
    fontWeight: '600',
    flex: 1
  },

  breakdownCard: {
    backgroundColor: '#fff8f0',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#ffb366',
    padding: 14,
    marginBottom: 16
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10
  },
  breakdownRowHighlight: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ffb366'
  },
  breakdownLabel: {
    fontSize: 13,
    color: '#5b606c',
    fontWeight: '500'
  },
  breakdownLabelHighlight: {
    fontSize: 13,
    color: '#ff7a1a',
    fontWeight: '700'
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20'
  },
  breakdownValueHighlight: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ff7a1a'
  },

  instructionsCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 14,
    marginBottom: 16
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12
  },

  instructionStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db'
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ff7a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  stepNumber: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20',
    marginBottom: 2
  },
  stepText: {
    fontSize: 11,
    color: '#5b606c',
    lineHeight: 14
  },

  field: {
    marginBottom: 16
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: '#5b606c',
    marginBottom: 6
  },
  required: {
    color: '#e5650a'
  },
  input: {
    width: '100%',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#1a1c20',
    marginBottom: 6,
    fontWeight: '600'
  },
  hint: {
    fontSize: 11,
    color: '#5b606c',
    fontWeight: '500'
  },

  offlineBanner: {
    backgroundColor: '#fff3e0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
    flexDirection: 'row',
    gap: 10
  },
  offlineIcon: {
    fontSize: 16,
    marginTop: 2
  },
  offlineText: {
    flex: 1,
    fontSize: 12,
    color: '#e65100',
    lineHeight: 16,
    fontWeight: '500'
  },

  infoBanner: {
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    flexDirection: 'row',
    gap: 8
  },
  infoIcon: {
    fontSize: 16,
    marginTop: 2
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#1a1c20',
    lineHeight: 16
  },

  primaryBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4
  },
  primaryBtnDisabled: {
    backgroundColor: '#e9dccc',
    shadowOpacity: 0
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnSpinner: {
    marginRight: 8
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2
  }
});

export default ConfirmSubscriptionScreen;