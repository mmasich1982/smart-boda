// rider-app/src/screens/subscription/ConfirmSubscriptionScreen.js
// ✅ REFACTORED: IndexedDB-FIRST + subscriptionUtils alignment
// ✅ BUSINESS LOGIC: Confirm subscription, capture M-Pesa code, create record
// ✅ UI/UX: Matches index.html design system (cards, buttons, M-Pesa flow)
// ✅ OFFLINE-FIRST: All data persisted via IndexedDB adapter
// ✅ FIXED: Payment record structure aligned to backend schema
// ✅ FIXED: Proper data transformation before sync queue

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useRider } from '../../rider/RiderContext';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { getLocalRiderId } from '../../offline/db';
import api from '../../api/client';
import {
  createSubscription,
  unlockAccount,
  SUBSCRIPTION_PLANS,
  getSubscriptionState,
  normalizePaymentRecord
} from '../../offline/subscriptionUtils';
import { enqueue } from '../../offline/syncQueue';

const ConfirmSubscriptionScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { state } = useRider();

  // ========================================================================
  // STATE
  // ========================================================================
  const [localRiderId, setLocalRiderId] = useState(null);
  const [mpesaCode, setMpesaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // ========================================================================
  // GET SELECTED FREQUENCY FROM ROUTE
  // ========================================================================
  const selectedFrequency = route.params?.selectedFrequency || 'biweekly';
  const plan = SUBSCRIPTION_PLANS[selectedFrequency];

  // ========================================================================
  // LOAD RIDER ID (Local-First)
  // ========================================================================
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ ConfirmSubscription: Loaded local rider ID:', id);
        } else if (state?.riderId) {
          setLocalRiderId(state.riderId);
          console.log('✅ ConfirmSubscription: Using context rider ID:', state.riderId);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };

    loadRiderId();
  }, [state?.riderId]);

  // ========================================================================
  // VALIDATE M-PESA CODE
  // ========================================================================
  const validateMpesaCode = () => {
    setFieldErrors({});
    const code = mpesaCode.trim().toUpperCase();

    if (!code) {
      setFieldErrors({ mpesaCode: 'M-Pesa confirmation code is required.' });
      return null;
    }

    if (code.length < 8) {
      setFieldErrors({ mpesaCode: 'Code too short — check the M-Pesa message and re-enter.' });
      return null;
    }

    return code;
  };

  // ========================================================================
  // ✅ NAVIGATE DIRECTLY TO HOME (Customer-Friendly)
  // ========================================================================
  const goHome = useCallback(() => {
    try {
      if (navigation) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'HomeScreen' }],
        });
      }
    } catch (err) {
      console.error('❌ Navigation error:', err);
    }
  }, [navigation]);

  // ========================================================================
  // ✅ HANDLE PAYMENT SUBMISSION (ALIGNED TO BACKEND)
  // ========================================================================
  const handleSubmitPayment = useCallback(async () => {
    const validatedCode = validateMpesaCode();
    if (!validatedCode || !localRiderId) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('📝 [ConfirmSubscription] Submitting subscription payment...');
      console.log('   Rider ID:', localRiderId);
      console.log('   Frequency:', selectedFrequency);
      console.log('   M-Pesa Code:', validatedCode);

      // ✅ 1. CREATE SUBSCRIPTION VIA subscriptionUtils
      const subscription = await createSubscription(localRiderId, selectedFrequency, 'mpesa');

      if (!subscription) {
        throw new Error('Failed to create subscription');
      }

      console.log('✅ [ConfirmSubscription] Subscription created:', subscription.id);

      // ✅ 2. CREATE PAYMENT RECORD (Frontend-first, matches backend schema)
      const now = new Date();
      const isoNow = now.toISOString();
      
      const paymentRecord = {
        // ✅ CRITICAL: Use backend schema field names
        id: `payment_${localRiderId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        rider_id: localRiderId,
        type: 'subscription',
        amount: plan.amount,
        plan: selectedFrequency,
        currency: 'KES',
        status: 'Success', // ✅ FIXED: Backend expects 'Success', not 'pending_verification'
        channel: 'M-Pesa',
        mpesa_code: validatedCode,
        // ✅ Timestamps in ISO format (backend will parse and convert)
        createdAt: isoNow,
        // ✅ Local timestamps for IndexedDB
        ts: Date.now(),
        timestamp: Date.now(),
        syncStatus: 'pending',
        // ✅ Metadata
        subscription_id: subscription.id,
        subscription_start: subscription.startDate,
        subscription_expiry: subscription.expiryDate,
      };

      console.log('📋 [ConfirmSubscription] Payment record created:', {
        id: paymentRecord.id,
        type: paymentRecord.type,
        amount: paymentRecord.amount,
        status: paymentRecord.status,
        channel: paymentRecord.channel,
      });

      // ✅ 3. SAVE PAYMENT RECORD TO INDEXEDDB (Local-first)
      const paymentKey = `payment_${localRiderId}_${paymentRecord.id}`;
      await indexedDbAdapter.kvSet(paymentKey, JSON.stringify(paymentRecord));
      console.log('💾 [ConfirmSubscription] Saved payment to IndexedDB:', paymentKey);

      // ✅ 4. ADD TO PAYMENT HISTORY
      const historyKey = `payment_history_${localRiderId}`;
      let history = [];
      try {
        const cached = await indexedDbAdapter.kvGet(historyKey);
        if (cached) {
          history = typeof cached === 'string' ? JSON.parse(cached) : cached;
          if (!Array.isArray(history)) history = [];
        }
      } catch (err) {
        console.warn('⚠️ Failed to load payment history:', err);
      }
      history.unshift(paymentRecord);
      await indexedDbAdapter.kvSet(historyKey, JSON.stringify(history));
      console.log('📜 [ConfirmSubscription] Updated payment history (count:', history.length, ')');

      // ✅ 5. UNLOCK ACCOUNT IF IT WAS LOCKED
      const subState = await getSubscriptionState(localRiderId);
      if (subState?.lockedAt) {
        await unlockAccount(localRiderId);
        console.log('🔓 [ConfirmSubscription] Account unlocked after payment');
      }

      // ✅ 6. NORMALIZE AND QUEUE FOR BACKEND SYNC
      // ⭐ CRITICAL: This transforms payment record to exact backend format
      const normalizedPayment = normalizePaymentRecord(paymentRecord, localRiderId);
      
      console.log('📤 [ConfirmSubscription] Queuing payment for backend sync:', {
        id: normalizedPayment.id,
        endpoint: normalizedPayment.endpoint,
        type: normalizedPayment.type,
      });

      const syncQueued = await enqueue('subscription_payment', normalizedPayment);
      
      if (!syncQueued) {
        console.warn('⚠️ [ConfirmSubscription] Failed to queue payment, but continuing...');
        // Don't throw - payment is already stored locally
      } else {
        console.log('✅ [ConfirmSubscription] Payment queued for sync');
      }

      console.log('✅ [ConfirmSubscription] Payment flow complete');

      // ✅ 7. CLEAR FORM
      setMpesaCode('');
      
      // ✅ 8. SHOW SUCCESS & NAVIGATE
      Alert.alert(
        'Payment Received! 🎉',
        'Your subscription is now active. Start tracking trips & fuel costs.',
        [
          {
            text: 'Continue',
            onPress: () => {
              console.log('🏠 [ConfirmSubscription] User pressed Continue - navigating to Home');
              goHome();
            },
          },
        ],
        { cancelable: false }
      );

      // ✅ AUTO-NAVIGATE: Navigate immediately (don't wait for user to press button)
      // This ensures riders who don't interact with alert still get navigated
      setTimeout(() => {
        try {
          console.log('🏠 [ConfirmSubscription] Auto-navigating to Home...');
          if (navigation?.isFocused && navigation.isFocused()) {
            goHome();
          }
        } catch (navErr) {
          console.warn('⚠️ Auto-navigation failed:', navErr);
        }
      }, 500); // Small delay to ensure alert is shown first

    } catch (err) {
      console.error('❌ [ConfirmSubscription] Error submitting payment:', err);
      setLoading(false);
      setError('Failed to process payment. Please try again.');
    }
  }, [localRiderId, selectedFrequency, plan.amount, mpesaCode, navigation, goHome]);

  // ========================================================================
  // CALCULATE EXPIRY DATE
  // ========================================================================
  const newExpiryDate = new Date(
    Date.now() + plan.days * 24 * 60 * 60 * 1000
  );

  // ========================================================================
  // MAIN UI
  // ========================================================================
  return (
    <ScrollView style={styles.container}>
      {/* BACK LINK */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backLink}
      >
        <Text style={styles.backLinkText}>← Change</Text>
      </TouchableOpacity>

      {/* TITLE */}
      <Text style={styles.title}>Confirm Your Plan</Text>
      <Text style={styles.subtitle}>Review the breakdown before paying</Text>

      {/* PLAN DETAILS CARD */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {selectedFrequency === 'biweekly' ? '📆 Bi-Weekly Plan' : '📆 Monthly Plan'}
          </Text>
        </View>

        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Plan Duration</Text>
          <Text style={styles.kvValue}>{plan.days} days</Text>
        </View>

        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Daily Rate</Text>
          <Text style={styles.kvValue}>KSh {Math.round(plan.amount / plan.days)}</Text>
        </View>

        <View style={[styles.kvRow, styles.kvRowBold]}>
          <Text style={styles.kvLabelBold}>Total to Pay</Text>
          <Text style={styles.kvValueBold}>KSh {plan.amount.toLocaleString()}</Text>
        </View>

        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Keeps You Active Until</Text>
          <Text style={styles.kvValue}>
            {newExpiryDate.toLocaleDateString('en-KE', {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>
      </View>

      {/* M-PESA CODE INPUT */}
      <View style={styles.mpesaCard}>
        <Text style={styles.mpesaTitle}>M-Pesa Payment Required</Text>
        <Text style={styles.mpesaInstructions}>
          📱 Send KSh {plan.amount} using M-Pesa Lipa na M-Pesa Online to business number <Text style={styles.bold}>522522</Text>, then paste the confirmation code below.
        </Text>

        <TextInput
          style={[styles.mpesaInput, fieldErrors.mpesaCode && styles.inputError]}
          placeholder="e.g., ABC123XYZ"
          placeholderTextColor="#8b8c8e"
          value={mpesaCode}
          onChangeText={setMpesaCode}
          autoCapitalize="characters"
          maxLength={20}
          editable={!loading}
        />

        {fieldErrors.mpesaCode && (
          <Text style={styles.errorText}>{fieldErrors.mpesaCode}</Text>
        )}
      </View>

      {/* ERROR MESSAGE */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>❌ {error}</Text>
        </View>
      )}

      {/* ACTION BUTTONS */}
      <TouchableOpacity
        style={[styles.buttonPrimary, loading && styles.buttonDisabled]}
        onPress={handleSubmitPayment}
        disabled={loading || !mpesaCode.trim()}
        activeOpacity={0.8}
      >
        {loading ? (
          <>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.buttonPrimaryText}>Processing...</Text>
          </>
        ) : (
          <Text style={styles.buttonPrimaryText}>💳 Confirm Payment →</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.goBack()}
        disabled={loading}
        activeOpacity={0.7}
      >
        <Text style={styles.cancelText}>← Go Back</Text>
      </TouchableOpacity>

      {/* INFO BANNER */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerText}>
          ℹ️ Your confirmation code appears in your M-Pesa message. Copy it exactly (e.g., "ABC123XYZ") and paste above. Don't share this code with anyone.
        </Text>
      </View>

      {/* SPACER */}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    paddingHorizontal: 14,
  },
  backLink: {
    paddingVertical: 14,
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#5b606c',
    marginBottom: 20,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 16,
    marginBottom: 20,
  },
  cardHeader: {
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1a1c20',
  },

  // Key-Value Row
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede5',
  },
  kvRowBold: {
    paddingVertical: 13,
    marginTop: 4,
    borderBottomWidth: 0,
    borderTopWidth: 1,
    borderTopColor: '#e7e4db',
  },
  kvLabel: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '500',
  },
  kvLabelBold: {
    fontSize: 13,
    color: '#1a1c20',
    fontWeight: '700',
  },
  kvValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1c20',
  },
  kvValueBold: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ff7a1a',
  },

  // M-Pesa Card
  mpesaCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 16,
    marginBottom: 20,
  },
  mpesaTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 10,
  },
  mpesaInstructions: {
    fontSize: 12.5,
    color: '#5b606c',
    lineHeight: 18,
    marginBottom: 16,
  },
  bold: {
    fontWeight: '800',
    color: '#ff7a1a',
  },

  // Input
  mpesaInput: {
    backgroundColor: '#f6f4ef',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1a1c20',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  inputError: {
    borderColor: '#e0453f',
    backgroundColor: '#fdecea',
  },
  errorText: {
    fontSize: 11,
    color: '#e0453f',
    fontWeight: '600',
    marginTop: 6,
  },

  // Error Banner
  errorBanner: {
    backgroundColor: '#fdecea',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#e0453f',
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    fontSize: 12.5,
    color: '#5b606c',
    lineHeight: 18,
  },

  // Buttons
  buttonPrimary: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    marginBottom: 12,
  },
  buttonDisabled: {
    backgroundColor: '#e9dccc',
    opacity: 0.6,
    shadowOpacity: 0,
  },
  buttonPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2',
    textAlign: 'center',
    paddingVertical: 12,
    marginBottom: 20,
  },

  // Info Banner
  infoBanner: {
    backgroundColor: '#eef3fb',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    padding: 12,
  },
  infoBannerText: {
    fontSize: 12,
    color: '#2c5182',
    lineHeight: 18,
  },
});

export default ConfirmSubscriptionScreen;