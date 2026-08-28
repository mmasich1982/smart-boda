// rider-app/src/screens/subscription/ConfirmSubscriptionScreen.js
// ✅ REFACTORED: IndexedDB-FIRST + subscriptionUtils alignment
// ✅ BUSINESS LOGIC: Confirm subscription, capture M-Pesa code, create record
// ✅ UI/UX: Matches index.html design system (cards, buttons, M-Pesa flow)
// ✅ OFFLINE-FIRST: All data persisted via IndexedDB adapter
// ✅ FIXED: Payment sync data structure aligned with backend expectations

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
  getSubscriptionState
} from '../../offline/subscriptionUtils';
import { addToSyncQueue, processPendingSync } from '../../offline/syncQueue';

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
        console.log('🏠 [ConfirmSubscription] Navigating to Home after payment...');
        // ✅ Use reset to ensure we go directly home and clear the stack
        navigation.reset({
          index: 0,
          routes: [{ name: 'Home' }],
        });
      } else {
        console.warn('⚠️ Navigation not available');
      }
    } catch (err) {
      console.error('❌ Navigation error:', err);
    }
  }, [navigation]);

  // ========================================================================
  // HANDLE PAYMENT SUBMISSION
  // ========================================================================
  const handleSubmitPayment = useCallback(async () => {
    const validatedCode = validateMpesaCode();
    if (!validatedCode || !localRiderId) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('📝 Submitting subscription payment...');

      // ✅ Create subscription record via subscriptionUtils
      const subscription = await createSubscription(localRiderId, selectedFrequency, 'mpesa');

      if (!subscription) {
        throw new Error('Failed to create subscription');
      }

      // ✅ FIXED: Generate unique payment ID with consistent format
      const paymentId = `payment_${localRiderId}_${Date.now()}`;
      const currentTimestamp = new Date().toISOString();
      const currentTimestampMs = Date.now();

      // ✅ FIXED: Payment record structure aligned with backend expectations
      const paymentRecord = {
        id: paymentId,
        type: 'subscription',
        amount: plan.amount,
        currency: 'KES',
        status: 'pending_verification',
        channel: 'Manual (Lipa na M-Pesa / Pochi / Send Money)',
        mpesa_code: validatedCode,
        plan: selectedFrequency,
        createdAt: currentTimestamp,
        ts: currentTimestampMs,
        timestamp: currentTimestampMs,
        syncStatus: 'pending',
      };

      // ✅ Save payment record to IndexedDB
      const paymentKey = `payment_${localRiderId}_${paymentId}`;
      await indexedDbAdapter.kvSet(paymentKey, JSON.stringify(paymentRecord));

      // ✅ Add to payment history
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

      // ✅ Check if account was locked and unlock it
      const subState = await getSubscriptionState(localRiderId);
      if (subState?.lockedAt) {
        await unlockAccount(localRiderId);
        console.log('🔓 Account unlocked after payment');
      }

      // ✅ SURGICAL FIX: Queue for backend sync with CORRECT endpoint and riderId
      // The data sent must match what subscriptions.js POST /subscriptions/payment expects
      // Endpoint MUST include rider_id as query parameter for backend route handler
      const syncQueueRecord = {
        id: paymentId,
        type: 'subscription_payment',
        endpoint: `/subscriptions/payment?rider_id=${localRiderId}`,
        data: paymentRecord,
        timestamp: currentTimestamp,
        riderId: localRiderId, // Also include riderId for processPendingSync() URL reconstruction
      };
      
      console.log('🔄 [ConfirmSubscription] Queuing payment for sync:');
      console.log('   Payment ID:', paymentId);
      console.log('   Rider ID:', localRiderId);
      console.log('   Endpoint:', syncQueueRecord.endpoint);
      console.log('   Amount:', plan.amount);
      console.log('   Plan:', selectedFrequency);
      
      await addToSyncQueue(syncQueueRecord);

      console.log('✅ Subscription created & payment queued for sync');

      // ✅ CRITICAL FIX: Trigger immediate sync attempt
      // This ensures payment is sent to backend as soon as network is available
      setTimeout(() => {
        processPendingSync().catch(err => {
          console.error('⚠️ Sync attempt failed (will retry on next check):', err.message);
        });
      }, 100);

      // ✅ CRITICAL FIX: Navigate immediately after payment success
      // This prevents duplicate payment capture and ensures user goes to Home
      setMpesaCode('');
      
      // Show success confirmation, but navigate immediately (don't wait for user)
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
          console.log('🏠 [ConfirmSubscription] Automatically navigating to Home...');
          if (navigation?.isFocused && navigation.isFocused()) {
            goHome();
          }
        } catch (navErr) {
          console.warn('⚠️ Auto-navigation failed:', navErr);
        }
      }, 500); // Small delay to ensure alert is shown first

    } catch (err) {
      console.error('❌ Error submitting payment:', err);
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
            {newExpiryDate.toLocaleDateString('en-KE')}
          </Text>
        </View>
      </View>

      {/* M-PESA PAYMENT CARD */}
      <View style={styles.mpesaCard}>
        <Text style={styles.mpesaCardTitle}>📲 Payment Instructions</Text>
        <Text style={styles.mpesaCardText}>
          Please use "Send Money" to the Safaricom number below.
        </Text>

        <View style={styles.paymentNumberBox}>
          <View>
            <Text style={styles.paymentNumberLabel}>Business / Paybill Number</Text>
            <Text style={styles.paymentNumber}>0757 334 481</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              // Copy to clipboard logic
              console.log('📋 Copy number to clipboard');
            }}
          >
            <Text style={styles.copyIcon}>📋</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.paymentAmountBox}>
          <Text style={styles.paymentAmountLabel}>Amount to Send</Text>
          <Text style={styles.paymentAmount}>KSh {plan.amount}</Text>
        </View>

        <Text style={styles.mpesaCardNote}>
          You'll receive an M-Pesa confirmation message. Copy the code and paste it below to complete your subscription.
        </Text>
      </View>

      {/* ERROR BANNER */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* M-PESA CODE INPUT */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>
          M-Pesa Confirmation Code
          <Text style={styles.fieldRequired}> *</Text>
        </Text>
        <TextInput
          style={[styles.textInput, fieldErrors.mpesaCode && styles.textInputError]}
          placeholder="E.g., ABC123XYZ"
          placeholderTextColor="#b4b0a6"
          value={mpesaCode}
          onChangeText={setMpesaCode}
          maxLength={50}
          keyboardType="default"
          onSubmitEditing={() => {
            if (!loading) {
              handleSubmitPayment();
            }
          }}
          editable={!loading}
        />
        {fieldErrors.mpesaCode && (
          <Text style={styles.errorMessage}>{fieldErrors.mpesaCode}</Text>
        )}
        <Text style={styles.fieldHint}>
          Enter the code from the M-Pesa message you received.
        </Text>
      </View>

      {/* SUBMIT BUTTON */}
      <TouchableOpacity
        style={[styles.buttonPrimary, loading && styles.buttonDisabled]}
        onPress={handleSubmitPayment}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.buttonPrimaryText}>I've Made This Payment ✅</Text>
        )}
      </TouchableOpacity>

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

  // Back Link
  backLink: {
    marginTop: 16,
    marginBottom: 16,
  },
  backLinkText: {
    fontSize: 13,
    color: '#1a1c20',
    fontWeight: '600',
  },

  // Title & Subtitle
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#5b606c',
    lineHeight: 19,
    marginBottom: 20,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
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
    backgroundColor: '#e6f5ef',
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#1e9e6f',
    padding: 16,
    marginBottom: 20,
  },
  mpesaCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e9e6f',
    marginBottom: 8,
  },
  mpesaCardText: {
    fontSize: 12.5,
    color: '#146142',
    lineHeight: 18,
    marginBottom: 14,
  },
  paymentNumberBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#1e9e6f',
    borderStyle: 'dashed',
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  paymentNumberLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#146142',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  paymentNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e9e6f',
    letterSpacing: 0.5,
  },
  copyIcon: {
    fontSize: 20,
  },
  paymentAmountBox: {
    backgroundColor: 'rgba(30, 158, 111, 0.1)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  paymentAmountLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#146142',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  paymentAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e9e6f',
  },
  mpesaCardNote: {
    fontSize: 11.5,
    color: '#146142',
    textAlign: 'center',
    lineHeight: 16,
  },

  // Error Banner
  errorBanner: {
    backgroundColor: '#fdecea',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#e0453f',
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 12,
    color: '#a5312c',
    fontWeight: '600',
  },

  // Field Group
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20',
    marginBottom: 8,
  },
  fieldRequired: {
    color: '#e0453f',
    fontWeight: '700',
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1a1c20',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  textInputError: {
    borderColor: '#e0453f',
    backgroundColor: '#fff9f8',
  },
  errorMessage: {
    fontSize: 11.5,
    color: '#a5312c',
    fontWeight: '600',
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: 11.5,
    color: '#8b8c8e',
    lineHeight: 16,
  },

  // Primary Button
  buttonPrimary: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    minHeight: 50,
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
});

export default ConfirmSubscriptionScreen;