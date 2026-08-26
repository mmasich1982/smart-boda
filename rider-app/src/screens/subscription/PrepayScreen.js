// rider-app/src/screens/subscription/PrepayScreen.js
// ✅ REFACTORED: IndexedDB-FIRST + subscriptionUtils alignment
// ✅ BUSINESS LOGIC: Multi-day prepayment (60-365 days), stepper control
// ✅ UI/UX: Matches index.html design system (stepper, cards, buttons)
// ✅ OFFLINE-FIRST: All data persisted via IndexedDB adapter
// ✅ UPDATED: Default prepay days changed from 7 to 60

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  CheckBox
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useRider } from '../../rider/RiderContext';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { getLocalRiderId } from '../../offline/db';
import api from '../../api/client';
import {
  getActiveSubscription,
  getSubscriptionState,
  unlockAccount,
  SUBSCRIPTION_PLANS
} from '../../offline/subscriptionUtils';
import { addToSyncQueue } from '../../offline/syncQueue';

const DAILY_RATE = 35; // KSh per day (configurable)
const MIN_PREPAY_DAYS = 60;
const MAX_PREPAY_DAYS = 365;

const PrepayScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { state } = useRider();

  // ========================================================================
  // STATE
  // ========================================================================
  const [localRiderId, setLocalRiderId] = useState(null);
  const [prepayDays, setPrepayDays] = useState(60);
  const [mpesaCode, setMpesaCode] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [screenState, setScreenState] = useState('select'); // 'select' | 'confirm'
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // ========================================================================
  // CONTROL MECHANISMS
  // ========================================================================
  const isMountedRef = useRef(true);

  // ========================================================================
  // LOAD RIDER ID (Local-First)
  // ========================================================================
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ PrepayScreen: Loaded local rider ID:', id);
        } else if (state?.riderId) {
          setLocalRiderId(state.riderId);
          console.log('✅ PrepayScreen: Using context rider ID:', state.riderId);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };

    loadRiderId();
  }, [state?.riderId]);

  // ========================================================================
  // INITIALIZE COMPONENT MOUNT/UNMOUNT
  // ========================================================================
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ========================================================================
  // ADJUST PREPAY DAYS (STEPPER)
  // ✅ CONSTRAINT: Cannot reduce below 60 days minimum
  // ========================================================================
  const handleAdjustDays = (delta) => {
    const newValue = Math.max(MIN_PREPAY_DAYS, Math.min(MAX_PREPAY_DAYS, prepayDays + delta));
    setPrepayDays(newValue);
  };

  // ========================================================================
  // CALCULATE TOTAL AND NEW EXPIRY
  // ========================================================================
  const totalAmount = prepayDays * DAILY_RATE;
  const currentExpiryMs = route.params?.currentExpiryAt
    ? new Date(route.params.currentExpiryAt).getTime()
    : Date.now();
  const newExpiryDate = new Date(Math.max(currentExpiryMs, Date.now()) + prepayDays * 24 * 60 * 60 * 1000);

  // ========================================================================
  // HANDLE CONTINUE FROM SELECTION
  // ========================================================================
  const handleContinueFromSelect = () => {
    if (!confirmChecked) {
      Alert.alert('Confirmation Required', 'Please confirm the prepayment amount and new expiry date.');
      return;
    }
    setScreenState('confirm');
  };

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
  // HANDLE PREPAY PAYMENT SUBMISSION
  // ========================================================================
  const handleSubmitPrepay = useCallback(async () => {
    const validatedCode = validateMpesaCode();
    if (!validatedCode || !localRiderId) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('📝 Submitting prepay payment...');

      // ✅ Calculate new subscription expiry
      const currentExpiryMs = Math.max(
        route.params?.currentExpiryAt ? new Date(route.params.currentExpiryAt).getTime() : Date.now(),
        Date.now()
      );
      const newExpiryMs = currentExpiryMs + prepayDays * 24 * 60 * 60 * 1000;

      // ✅ Update subscription with new expiry
      const key = `subscription_${localRiderId}`;
      const cached = await indexedDbAdapter.kvGet(key);
      let subscription = null;

      if (cached) {
        subscription = typeof cached === 'string' ? JSON.parse(cached) : cached;
        subscription.expiryDate = new Date(newExpiryMs).toISOString();
        subscription.expiry_ms = newExpiryMs;
        subscription.syncStatus = 'pending';
        subscription.updatedAt = new Date().toISOString();
      } else {
        // No existing subscription, create minimal record
        subscription = {
          id: `sub_${localRiderId}_${Date.now()}`,
          rider_id: localRiderId,
          plan: 'prepay',
          amount: totalAmount,
          currency: 'KES',
          status: 'active',
          expiryDate: new Date(newExpiryMs).toISOString(),
          expiry_ms: newExpiryMs,
          createdAt: new Date().toISOString(),
          ts: Date.now(),
          timestamp: Date.now(),
          syncStatus: 'pending',
        };
      }

      await indexedDbAdapter.kvSet(key, JSON.stringify(subscription));

      // ✅ Log the prepay payment record
      const paymentRecord = {
        id: `payment_${localRiderId}_${Date.now()}`,
        riderId: localRiderId,
        type: 'prepayment',
        amount: totalAmount,
        days: prepayDays,
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
        const historyCached = await indexedDbAdapter.kvGet(historyKey);
        if (historyCached) {
          history = typeof historyCached === 'string' ? JSON.parse(historyCached) : historyCached;
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
        console.log('🔓 Account unlocked after prepay');
      }

      // ✅ Queue for backend sync
      await addToSyncQueue({
        id: paymentRecord.id,
        type: 'prepay_payment',
        endpoint: `/subscriptions/prepay?rider_id=${localRiderId}`,
        data: paymentRecord,
        timestamp: new Date(),
      });

      console.log('✅ Prepay payment logged');

      // ✅ Navigate to success state
      Alert.alert(
        'Payment Received! 🎉',
        `You're paid ahead until ${newExpiryDate.toLocaleDateString('en-KE')}. No worries, we'll remind you when you're getting close.`,
        [
          {
            text: 'Continue',
            onPress: () => {
              setMpesaCode('');
              navigation.navigate('Home');
            },
          },
        ]
      );
    } catch (err) {
      console.error('❌ Error submitting prepay:', err);
      setError('Failed to process prepayment. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [localRiderId, prepayDays, totalAmount, route.params, navigation]);

  // ========================================================================
  // SCREEN 1: SELECT DAYS
  // ========================================================================
  if (screenState === 'select') {
    return (
      <ScrollView style={styles.container}>
        {/* BACK LINK */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backLink}
        >
          <Text style={styles.backLinkText}>← {t('common.back') || 'Back'}</Text>
        </TouchableOpacity>

        {/* TITLE */}
        <Text style={styles.title}>Pay Ahead & Skip the Hassle</Text>
        <Text style={styles.subtitle}>Add extra days to your subscription and forget about renewals</Text>

        {/* STEPPER */}
        <View style={styles.stepperContainer}>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() => handleAdjustDays(-1)}
            disabled={prepayDays <= MIN_PREPAY_DAYS}
            activeOpacity={0.7}
          >
            <Text style={styles.stepperButtonText}>−</Text>
          </TouchableOpacity>

          <Text style={styles.stepperValue}>{prepayDays}</Text>

          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() => handleAdjustDays(1)}
            disabled={prepayDays >= MAX_PREPAY_DAYS}
            activeOpacity={0.7}
          >
            <Text style={styles.stepperButtonText}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.stepperHint}>
          Minimum: {MIN_PREPAY_DAYS} days · Maximum: {MAX_PREPAY_DAYS} days
        </Text>

        {/* BREAKDOWN CARD */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Payment Breakdown</Text>
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Days to Add</Text>
            <Text style={styles.kvValue}>{prepayDays}</Text>
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Daily Rate</Text>
            <Text style={styles.kvValue}>KSh {DAILY_RATE}</Text>
          </View>

          <View style={[styles.kvRow, styles.kvRowBold]}>
            <Text style={styles.kvLabelBold}>Total Amount</Text>
            <Text style={styles.kvValueBold}>KSh {totalAmount.toLocaleString()}</Text>
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>New Expiry</Text>
            <Text style={styles.kvValue}>
              {newExpiryDate.toLocaleDateString('en-KE')}
            </Text>
          </View>
        </View>

        {/* CONFIRMATION CHECKBOX */}
        <View style={styles.checkboxContainer}>
          <View style={styles.checkboxRow}>
            <CheckBox
              value={confirmChecked}
              onValueChange={setConfirmChecked}
              style={{ width: 20, height: 20 }}
            />
            <Text style={styles.checkboxLabel}>
              I confirm the amount and new expiry date
            </Text>
          </View>
        </View>

        {/* ACTION BUTTON */}
        <TouchableOpacity
          style={[styles.buttonPrimary, !confirmChecked && styles.buttonDisabled]}
          onPress={handleContinueFromSelect}
          disabled={!confirmChecked}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonPrimaryText}>Continue →</Text>
        </TouchableOpacity>

        {/* SPACER */}
        <View style={{ height: 20 }} />
      </ScrollView>
    );
  }

  // ========================================================================
  // SCREEN 2: CONFIRM PAYMENT
  // ========================================================================
  return (
    <ScrollView style={styles.container}>
      {/* BACK LINK */}
      <TouchableOpacity
        onPress={() => setScreenState('select')}
        style={styles.backLink}
      >
        <Text style={styles.backLinkText}>← {t('common.back') || 'Back'}</Text>
      </TouchableOpacity>

      {/* TITLE */}
      <Text style={styles.title}>Complete Payment</Text>
      <Text style={styles.subtitle}>Confirm your prepayment details and send via M-Pesa</Text>

      {/* ERROR BANNER */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* PAYMENT BREAKDOWN CARD */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Your Prepayment</Text>
        </View>

        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Days Added</Text>
          <Text style={styles.kvValue}>{prepayDays} days</Text>
        </View>

        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Cost per Day</Text>
          <Text style={styles.kvValue}>KSh {DAILY_RATE}</Text>
        </View>

        <View style={[styles.kvRow, styles.kvRowBold]}>
          <Text style={styles.kvLabelBold}>Total to Pay</Text>
          <Text style={styles.kvValueBold}>KSh {totalAmount.toLocaleString()}</Text>
        </View>

        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>New Expiry</Text>
          <Text style={styles.kvValue}>
            {newExpiryDate.toLocaleDateString('en-KE')}
          </Text>
        </View>
      </View>

      {/* M-PESA INSTRUCTIONS CARD */}
      <View style={styles.mpesaCard}>
        <Text style={styles.mpesaCardTitle}>💚 How to Pay with M-Pesa</Text>
        <Text style={styles.mpesaCardText}>
          1. Go to M-Pesa menu on your phone{'\n'}
          2. Choose "Lipa na M-Pesa Online" or "Send Money"{'\n'}
          3. Enter the payment number below{'\n'}
          4. Enter the amount: KSh {totalAmount.toLocaleString()}{'\n'}
          5. Paste the confirmation code here
        </Text>

        <View style={styles.paymentNumberBox}>
          <View>
            <Text style={styles.paymentNumberLabel}>Payment Number</Text>
            <Text style={styles.paymentNumber}>400500</Text>
          </View>
          <Text style={styles.copyIcon}>📋</Text>
        </View>

        <View style={styles.paymentAmountBox}>
          <Text style={styles.paymentAmountLabel}>Amount to Send</Text>
          <Text style={styles.paymentAmount}>KSh {totalAmount.toLocaleString()}</Text>
        </View>

        <Text style={styles.mpesaCardNote}>
          You'll get a confirmation code from M-Pesa in seconds. Paste it below.
        </Text>
      </View>

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
          placeholder="e.g., ABC123DEF"
          placeholderTextColor="#8b8c8e"
          value={mpesaCode}
          onChangeText={setMpesaCode}
          editable={!loading}
          maxLength={12}
        />
        {fieldErrors.mpesaCode && (
          <Text style={styles.errorMessage}>{fieldErrors.mpesaCode}</Text>
        )}
        <Text style={styles.fieldHint}>
          Find this in your M-Pesa confirmation message. It's usually 8-10 characters.
        </Text>
      </View>

      {/* SUBMIT BUTTON */}
      <TouchableOpacity
        style={[styles.buttonPrimary, loading && styles.buttonDisabled]}
        onPress={handleSubmitPrepay}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.buttonPrimaryText}>Confirm & Pay →</Text>
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
    paddingTop: 14,
  },

  // Back Link
  backLink: {
    marginBottom: 20,
  },
  backLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ff7a1a',
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

  // Stepper
  stepperContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginBottom: 8,
  },
  stepperButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ff7a1a',
  },
  stepperValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1a1c20',
    minWidth: 60,
    textAlign: 'center',
  },
  stepperHint: {
    fontSize: 12,
    color: '#5b606c',
    textAlign: 'center',
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

  // Checkbox
  checkboxContainer: {
    marginBottom: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 12,
    gap: 10,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    color: '#1a1c20',
    fontWeight: '500',
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

export default PrepayScreen;