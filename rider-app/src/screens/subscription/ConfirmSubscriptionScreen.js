// rider-app/src/screens/subscription/ConfirmSubscriptionScreen.js
// ✅ REFACTORED: IndexedDB-FIRST + subscriptionUtils alignment
// ✅ BUSINESS LOGIC: Confirm subscription, capture M-Pesa code, create record
// ✅ UI/UX: Matches index.html design system (cards, buttons, M-Pesa flow)
// ✅ OFFLINE-FIRST: All data persisted via IndexedDB adapter

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
import { addToSyncQueue } from '../../offline/syncQueue';

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

      // ✅ Log the payment record with M-Pesa code
      const paymentRecord = {
        id: `payment_${localRiderId}_${Date.now()}`,
        riderId: localRiderId,
        type: 'subscription',
        amount: plan.amount,
        plan: selectedFrequency,
        currency: 'KES',
        status: 'pending_verification',
        channel: 'Manual (Lipa na M-Pesa / Pochi / Send Money)',
        mpesaCode: validatedCode,
        createdAt: new Date().toISOString(),
        ts: Date.now(),
        timestamp: Date.now(),
        syncStatus: 'pending',
      };

      // ✅ Save payment record to IndexedDB
      const paymentKey = `payment_${localRiderId}_${paymentRecord.id}`;
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

      // ✅ Queue for backend sync
      await addToSyncQueue({
        id: paymentRecord.id,
        type: 'subscription_payment',
        endpoint: `/subscriptions/payment?rider_id=${localRiderId}`,
        data: paymentRecord,
        timestamp: new Date(),
      });

      console.log('✅ Subscription created & payment logged');
	  
	  // ✅ FIXED: Back navigation goes directly to Home (customer-friendly)
  const handleBackPress = useCallback(() => {
    try {
      if (navigation && navigation.navigate) {
        // Navigate directly to Home instead of goBack (customer prefers this)
        navigation.navigate('Home');
      } else {
        console.warn('⚠️ Navigation not available');
      }
    } catch (err) {
      console.error('❌ Navigation error:', err);
    }
  }, [navigation]);

      // ✅ Navigate to success state
      Alert.alert(
        'Payment Received! 🎉',
        'Your subscription is now active. Start tracking trips & fuel costs.',
        [
          {
            text: 'Continue',
            onPress: () => {
              setMpesaCode('');
              navigation.navigate('handleBackPress');
            },
          },
        ]
      );
    } catch (err) {
      console.error('❌ Error submitting payment:', err);
      setError('Failed to process payment. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [localRiderId, selectedFrequency, plan.amount, mpesaCode, navigation]);

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
            <Text style={styles.paymentNumberLabel}>Safaricom Number</Text>
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
          <Text style={styles.paymentAmountLabel}>Amount To Send</Text>
          <Text style={styles.paymentAmount}>KSh {plan.amount.toLocaleString()}</Text>
        </View>

        <Text style={styles.mpesaCardNote}>
          ✅ Tap below once you've sent the payment and we'll activate your plan right away.
        </Text>
      </View>

      {/* ERROR MESSAGE */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {/* M-PESA CODE INPUT */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>
          M-Pesa Confirmation Code <Text style={styles.fieldRequired}>*</Text>
        </Text>
        <TextInput
          style={[
            styles.textInput,
            fieldErrors.mpesaCode && styles.textInputError
          ]}
          placeholder="e.g. QK71X9Y2AB"
          placeholderTextColor="#c9c2b6"
          maxLength={15}
          value={mpesaCode}
          onChangeText={(text) => {
            setMpesaCode(text.toUpperCase());
            if (fieldErrors.mpesaCode) {
              setFieldErrors({ ...fieldErrors, mpesaCode: null });
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