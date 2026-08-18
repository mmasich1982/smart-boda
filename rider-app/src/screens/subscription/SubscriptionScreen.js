// rider-app/src/screens/subscription/SubscriptionScreen.js
/**
 * Complete Subscription Management Screen (RA-33)
 * Handles subscription status, plan selection, payment, and history
 * Single source of truth: cleaned.html
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import BackLink from '../../components/BackLink';
import { useToast } from '../../components/Toast';
import { useRiderId } from '../../rider/RiderContext';
import { getLocalRiderStatus } from '../../offline/db';
import api from '../../api/client';

const FREQUENCIES = {
  weekly: { emoji: '📆', label: 'Weekly', key: 'weekly' },
  biweekly: { emoji: '📆', label: 'Biweekly', key: 'biweekly' },
  monthly: { emoji: '📆', label: 'Monthly', key: 'monthly' },
};

// ── Screen 1: Subscription Status ──────────────────────────────────────
export function SubscriptionScreen({ navigation }) {
  const contextRiderId = useRiderId();
  const { showToast } = useToast();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [localRiderId, setLocalRiderId] = useState(null);

  // Load rider ID from local storage (primary) or context (fallback)
  useEffect(() => {
    async function loadRiderId() {
      try {
        const status = await getLocalRiderStatus();
        if (status?.rider_id) {
          setLocalRiderId(status.rider_id);
        }
      } catch (err) {
        console.error('Error loading rider status:', err);
      } finally {
        setLoading(false);
      }
    }
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || contextRiderId;

  useFocusEffect(
    useCallback(() => {
      if (effectiveRiderId) {
        loadSubscription();
      }
    }, [effectiveRiderId])  // ✅ FIXED: Removed 'loading' from dependency array to prevent infinite loop
  );

  const loadSubscription = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/subscription', { params: { rider_id: effectiveRiderId } });
      setSubscription(res.data);
    } catch (err) {
      console.error('Error loading subscription:', err);
      setError(err.response?.data?.detail || 'Error loading subscription');
      showToast('Error loading subscription', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Text style={styles.loading}>Loading subscription...</Text>;
  }

  if (!subscription) {
    return <Text style={styles.error}>Could not load subscription</Text>;
  }

  const daysLeft = subscription.days_left || 0;
  const isUrgent = daysLeft <= 2;
  const isLocked = subscription.locked;
  const statusWord = subscription.has_ever_paid ? 'Active' : 'Free Trial';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.heroBand}>
        <BackLink onPress={() => navigation.goBack()} label="← Home" />
        <View style={styles.heroEyebrow}>
          <Text style={styles.heroEyebrowText}>
            {subscription.has_ever_paid ? '✅ You\'re all set' : '🎁 Your free trial'}
          </Text>
        </View>
        <Text style={styles.heroTitle}>{statusWord}</Text>
        <View style={styles.daysDisplay}>
          <Text style={styles.daysNumber}>{Math.max(daysLeft, 0)}</Text>
          <Text style={styles.daysLabel}>day{daysLeft === 1 ? '' : 's'} left</Text>
        </View>
      </View>

      {isUrgent && !isLocked && (
        <View style={[styles.banner, isUrgent && daysLeft <= 1 ? styles.bannerError : styles.bannerWarn]}>
          <Text style={styles.bannerText}>
            {daysLeft <= 1
              ? '⚠️ Today is your last day! Keep your bike\'s tools running — subscribe now.'
              : `⏰ Only ${daysLeft} days left. Subscribe now to avoid interruption.`}
          </Text>
        </View>
      )}

      {isLocked && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            👉 Get back in takes just one payment, and you're back to work instantly.
          </Text>
        </View>
      )}

      {/* Plan Information Card */}
      <View style={styles.card}>
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>Plan</Text>
          <Text style={styles.kvValue}>{subscription.plan_name}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>Daily Rate</Text>
          <Text style={styles.kvValue}>💵 KSh {subscription.daily_price.toLocaleString()}/day</Text>
        </View>
        {subscription.has_ever_paid && (
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>You Pay</Text>
            <Text style={styles.kvValue}>
              {FREQUENCIES[subscription.frequency]?.emoji} {FREQUENCIES[subscription.frequency]?.label}
            </Text>
          </View>
        )}
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>{subscription.has_ever_paid ? 'Next Payment Due' : 'Trial Ends'}</Text>
          <Text style={styles.kvValue}>{new Date(subscription.expiry_at).toLocaleDateString()}</Text>
        </View>
      </View>

      {!subscription.has_ever_paid && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Why subscribe?</Text>
          <Text style={styles.benefitText}>
            ✅ Keep tracking every trip, fuel cost, and service reminder{'\n'}
            ✅ Stay connected to your SACCO{'\n'}
            ✅ From as little as KSh {subscription.daily_price}/day — less than a cup of tea
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      <TouchableOpacity
        style={[styles.button, styles.buttonPrimary]}
        onPress={() => {
          if (subscription.has_ever_paid) {
            navigation.navigate('ConfirmSubscriptionScreen', { frequency: subscription.frequency });
          } else {
            navigation.navigate('ChooseFrequencyScreen');
          }
        }}
      >
        <Text style={styles.buttonText}>
          {subscription.has_ever_paid ? '🔁 Renew Now' : '🚀 Subscribe Now'} →
        </Text>
      </TouchableOpacity>

      {subscription.has_ever_paid && (
        <TouchableOpacity
          style={styles.buttonLink}
          onPress={() => navigation.navigate('ChooseFrequencyScreen')}
        >
          <Text style={styles.buttonLinkText}>Change how often I pay</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.button, styles.buttonGhost]}
        onPress={() => navigation.navigate('PrepayScreen')}
      >
        <Text style={styles.buttonText}>📅 Pay Ahead & Skip the Hassle →</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.buttonLink}
        onPress={() => navigation.navigate('PaymentHistoryScreen')}
      >
        <Text style={styles.buttonLinkText}>View Payment History →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Screen 2: Choose Subscription Frequency ──────────────────────────────
export function ChooseFrequencyScreen({ navigation }) {
  const contextRiderId = useRiderId();
  const [subscription, setSubscription] = useState(null);
  const [chosenFrequency, setChosenFrequency] = useState('weekly');
  const [loading, setLoading] = useState(true);
  const [localRiderId, setLocalRiderId] = useState(null);

  // Load rider ID from local storage (primary) or context (fallback)
  useEffect(() => {
    async function loadRiderId() {
      try {
        const status = await getLocalRiderStatus();
        if (status?.rider_id) {
          setLocalRiderId(status.rider_id);
        }
      } catch (err) {
        console.error('Error loading rider status:', err);
      }
    }
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || contextRiderId;

  useEffect(() => {
    if (effectiveRiderId) {
      loadSubscription();
    }
  }, [effectiveRiderId]);

  const loadSubscription = async () => {
    try {
      const res = await api.get('/subscription', { params: { rider_id: effectiveRiderId } });
      setSubscription(res.data);
      setChosenFrequency(res.data.frequency || 'weekly');
    } catch (err) {
      console.error('Error loading subscription:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!subscription || loading) return <Text style={styles.loading}>Loading...</Text>;

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label="← Back" />
      <Text style={styles.title}>How Would You Like to Pay? 💳</Text>
      <Text style={styles.subtitle}>
        Pick what works best for you. Pay less often and save a little too.
      </Text>

      {/* Frequency Tiles */}
      <View style={styles.tileGrid}>
        {Object.values(FREQUENCIES).map((freq) => {
          const dailyPrice = subscription.daily_price;
          const amount = dailyPrice * freq.key === 'weekly' ? 7 : freq.key === 'biweekly' ? 14 : 30;
          
          return (
            <TouchableOpacity
              key={freq.key}
              style={[
                styles.tile,
                chosenFrequency === freq.key && styles.tileSelected,
              ]}
              onPress={() => setChosenFrequency(freq.key)}
            >
              <Text style={styles.tileEmoji}>{freq.emoji}</Text>
              <Text style={styles.tileLabel}>{freq.label}</Text>
              <Text style={styles.tileAmount}>KSh {amount.toLocaleString()}</Text>
              <Text style={styles.tileDays}>every {freq.key === 'weekly' ? '7' : freq.key === 'biweekly' ? '14' : '30'} days</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.hint}>
        Daily rate: KSh {subscription.daily_price}. Weekly, biweekly, and monthly plans work out cheaper per day.
      </Text>

      <TouchableOpacity
        style={[styles.button, styles.buttonPrimary, !chosenFrequency && styles.buttonDisabled]}
        onPress={() => navigation.navigate('ConfirmSubscriptionScreen', { frequency: chosenFrequency })}
        disabled={!chosenFrequency}
      >
        <Text style={styles.buttonText}>Continue →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Screen 3: Confirm Subscription Payment ──────────────────────────────
export function ConfirmSubscriptionScreen({ route, navigation }) {
  const contextRiderId = useRiderId();
  const { showToast } = useToast();
  const frequency = route.params?.frequency || 'weekly';
  const [subscription, setSubscription] = useState(null);
  const [mpesaCode, setMpesaCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [localRiderId, setLocalRiderId] = useState(null);

  // Load rider ID from local storage (primary) or context (fallback)
  useEffect(() => {
    async function loadRiderId() {
      try {
        const status = await getLocalRiderStatus();
        if (status?.rider_id) {
          setLocalRiderId(status.rider_id);
        }
      } catch (err) {
        console.error('Error loading rider status:', err);
      }
    }
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || contextRiderId;

  useEffect(() => {
    if (effectiveRiderId) {
      loadSubscription();
    }
  }, [effectiveRiderId]);

  const loadSubscription = async () => {
    try {
      const res = await api.get('/subscription', { params: { rider_id: effectiveRiderId } });
      setSubscription(res.data);
    } catch (err) {
      console.error('Error loading subscription:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyNumber = () => {
    const number = '0757334481';
    Alert.alert('Safaricom Number', number, [
      { text: 'Copy', onPress: () => showToast('Number copied: 0757 334 481', 'success') },
      { text: 'Close' }
    ]);
  };

  const handleSubmit = async () => {
    if (!mpesaCode.trim()) {
      showToast('Enter M-Pesa confirmation code', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.post('/subscription/pay', {}, {
        params: {
          rider_id: effectiveRiderId,
          frequency_key: frequency,
          mpesa_code: mpesaCode.toUpperCase()
        }
      });
      
      showToast('Payment received! Your subscription is active. 🎉', 'success');
      setMpesaCode('');
      navigation.navigate('Subscription');
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Payment failed';
      showToast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!subscription || loading) return <Text style={styles.loading}>Loading...</Text>;

  const freqInfo = FREQUENCIES[frequency];
  const dailyPrice = subscription.daily_price;
  const daysMap = { weekly: 7, biweekly: 14, monthly: 30 };
  const days = daysMap[frequency];
  const amount = dailyPrice * days;
  const newExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label="← Change" />
      <Text style={styles.title}>Confirm Your Plan</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{freqInfo.emoji} {freqInfo.label} Plan</Text>
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>Daily rate</Text>
          <Text style={styles.kvValue}>KSh {dailyPrice} × {days} days</Text>
        </View>
        <View style={[styles.kvRow, styles.kvRowHighlight]}>
          <Text style={styles.kvKey}>Total to pay now</Text>
          <Text style={styles.kvValueBold}>KSh {amount.toLocaleString()}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>Keeps you active until</Text>
          <Text style={styles.kvValue}>{newExpiry.toLocaleDateString()}</Text>
        </View>
      </View>

      {/* Payment Instructions */}
      <View style={styles.paymentCard}>
        <Text style={styles.paymentCardText}>📲 Please Use "Send Money" to the Safaricom number below.</Text>
        
        <TouchableOpacity style={styles.numberBox} onPress={handleCopyNumber}>
          <View>
            <Text style={styles.numberBoxLabel}>SAFARICOM NUMBER</Text>
            <Text style={styles.numberBoxValue}>0757 334 481</Text>
          </View>
          <Text style={styles.copyIcon}>📋</Text>
        </TouchableOpacity>

        <View style={styles.amountBox}>
          <Text style={styles.amountBoxLabel}>AMOUNT TO SEND</Text>
          <Text style={styles.amountBoxValue}>KSh {amount.toLocaleString()}</Text>
        </View>

        <Text style={styles.paymentHint}>✅ Tap below once you've sent the payment and we'll activate your plan right away.</Text>
      </View>

      {/* M-Pesa Code Input */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>M-Pesa Confirmation Code <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. QK71X9Y2AB"
          maxLength={15}
          value={mpesaCode}
          onChangeText={(text) => setMpesaCode(text.toUpperCase())}
          editable={!submitting}
        />
        <Text style={styles.hint}>Enter the code from the M-Pesa message you received.</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, styles.buttonPrimary, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting || !mpesaCode}
      >
        <Text style={styles.buttonText}>{submitting ? 'Processing...' : 'I\'ve Made This Payment ✅'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Screen 4: Payment History ──────────────────────────────────────────
export function PaymentHistoryScreen({ navigation }) {
  const contextRiderId = useRiderId();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [localRiderId, setLocalRiderId] = useState(null);

  // Load rider ID from local storage (primary) or context (fallback)
  useEffect(() => {
    async function loadRiderId() {
      try {
        const status = await getLocalRiderStatus();
        if (status?.rider_id) {
          setLocalRiderId(status.rider_id);
        }
      } catch (err) {
        console.error('Error loading rider status:', err);
      }
    }
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || contextRiderId;

  useFocusEffect(
    useCallback(() => {
      if (effectiveRiderId) {
        loadPayments();
      }
    }, [effectiveRiderId])
  );

  const loadPayments = async () => {
    try {
      setLoading(true);
      const res = await api.get('/subscription/payments', { params: { rider_id: effectiveRiderId } });
      setPayments(res.data.items || []);
    } catch (err) {
      console.error('Error loading payments:', err);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label="← Back" />
      <Text style={styles.title}>Payment History</Text>

      {payments.length > 0 ? (
        payments.map((p) => (
          <View key={p.id} style={styles.paymentCard}>
            <View style={styles.paymentRow}>
              <View>
                <Text style={styles.paymentLabel}>{p.channel} · {p.ref}</Text>
                <Text style={styles.paymentDate}>{new Date(p.ts).toLocaleString()}</Text>
                {p.mpesa_code && <Text style={styles.paymentCode}>M-Pesa Code: {p.mpesa_code}</Text>}
              </View>
              <View style={styles.paymentRight}>
                <Text style={[styles.badge, p.status === 'Success' && styles.badgeGreen]}>
                  {p.status}
                </Text>
                <Text style={styles.paymentAmount}>KSh {p.amount.toLocaleString()}</Text>
              </View>
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>No payments yet.</Text>
      )}
    </ScrollView>
  );
}

// ── Screen 5: Multi-Day Prepayment ──────────────────────────────────────
export function PrepayScreen({ navigation }) {
  const contextRiderId = useRiderId();
  const [subscription, setSubscription] = useState(null);
  const [days, setDays] = useState(7);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [localRiderId, setLocalRiderId] = useState(null);

  // Load rider ID from local storage (primary) or context (fallback)
  useEffect(() => {
    async function loadRiderId() {
      try {
        const status = await getLocalRiderStatus();
        if (status?.rider_id) {
          setLocalRiderId(status.rider_id);
        }
      } catch (err) {
        console.error('Error loading rider status:', err);
      }
    }
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || contextRiderId;

  useEffect(() => {
    if (effectiveRiderId) {
      loadSubscription();
    }
  }, [effectiveRiderId]);

  const loadSubscription = async () => {
    try {
      const res = await api.get('/subscription', { params: { rider_id: riderId } });
      setSubscription(res.data);
    } catch (err) {
      console.error('Error loading subscription:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!subscription || loading) return <Text style={styles.loading}>Loading...</Text>;

  const total = days * subscription.daily_price;
  const newExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label="← Back" />
      <Text style={styles.title}>Pay Ahead & Skip the Hassle</Text>

      {/* Days Stepper */}
      <View style={styles.stepperRow}>
        <TouchableOpacity
          style={styles.stepperBtn}
          onPress={() => setDays(Math.max(3, days - 1))}
        >
          <Text style={styles.stepperText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{days}</Text>
        <TouchableOpacity
          style={styles.stepperBtn}
          onPress={() => setDays(Math.min(60, days + 1))}
        >
          <Text style={styles.stepperText}>＋</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>days to pay ahead (3–60)</Text>

      <View style={styles.card}>
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>Total To Pay</Text>
          <Text style={[styles.kvValue, styles.kvValueBold]}>KSh {total.toLocaleString()}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>New Expiry Date</Text>
          <Text style={styles.kvValue}>{newExpiry.toLocaleDateString()}</Text>
        </View>
      </View>

      <View style={styles.checkboxRow}>
        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => setConfirmed(!confirmed)}
        >
          {confirmed && <Text style={styles.checkboxTick}>✓</Text>}
        </TouchableOpacity>
        <Text style={styles.checkboxLabel}>I confirm this amount and new expiry date.</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, styles.buttonPrimary, !confirmed && styles.buttonDisabled]}
        onPress={() => navigation.navigate('ConfirmPrepay', { days, total })}
        disabled={!confirmed}
      >
        <Text style={styles.buttonText}>Continue to Payment →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Screen 6: Confirm Prepayment ──────────────────────────────────────
export function ConfirmPrepayScreen({ route, navigation }) {
  const riderId = useRiderId();
  const { showToast } = useToast();
  const { days, total } = route.params;
  const [mpesaCode, setMpesaCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!mpesaCode.trim()) {
      showToast('Enter M-Pesa confirmation code', 'error');
      return;
    }

    try {
      setSubmitting(true);
      await api.post('/subscription/prepay', {}, {
        params: {
          rider_id: riderId,
          days,
          mpesa_code: mpesaCode.toUpperCase()
        }
      });
      
      showToast('Payment received! You\'re paid ahead. 🎉', 'success');
      navigation.navigate('Subscription');
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Payment failed';
      showToast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const newExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label="← Change" />
      <Text style={styles.title}>Confirm Your Prepayment</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📅 {days}-Day Prepayment</Text>
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>Total to pay now</Text>
          <Text style={[styles.kvValue, styles.kvValueBold]}>KSh {total.toLocaleString()}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>Keeps you active until</Text>
          <Text style={styles.kvValue}>{newExpiry.toLocaleDateString()}</Text>
        </View>
      </View>

      {/* Payment Instructions */}
      <View style={styles.paymentCard}>
        <Text style={styles.paymentCardText}>📲 Please Use "Send Money" to the Safaricom number below.</Text>
        
        <View style={styles.numberBox}>
          <View>
            <Text style={styles.numberBoxLabel}>SAFARICOM NUMBER</Text>
            <Text style={styles.numberBoxValue}>0757 334 481</Text>
          </View>
          <Text style={styles.copyIcon}>📋</Text>
        </View>

        <View style={styles.amountBox}>
          <Text style={styles.amountBoxLabel}>AMOUNT TO SEND</Text>
          <Text style={styles.amountBoxValue}>KSh {total.toLocaleString()}</Text>
        </View>

        <Text style={styles.paymentHint}>✅ Tap below once you've sent the payment and we'll activate it right away.</Text>
      </View>

      {/* M-Pesa Code Input */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>M-Pesa Confirmation Code <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. QK71X9Y2AB"
          maxLength={15}
          value={mpesaCode}
          onChangeText={(text) => setMpesaCode(text.toUpperCase())}
          editable={!submitting}
        />
        <Text style={styles.hint}>Enter the code from the M-Pesa message you received.</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, styles.buttonPrimary, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting || !mpesaCode}
      >
        <Text style={styles.buttonText}>{submitting ? 'Processing...' : 'I\'ve Made This Payment ✅'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    padding: 20,
  },
  loading: {
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 14,
    color: '#5b606c',
  },
  error: {
    flex: 1,
    textAlign: 'center',
    color: '#e0453f',
    fontSize: 14,
  },
  heroBand: {
    backgroundColor: '#1a1c20',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  heroEyebrow: {
    marginBottom: 8,
  },
  heroEyebrowText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  daysDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  daysNumber: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
  },
  daysLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  banner: {
    backgroundColor: '#fdf3df',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fde9c2',
    padding: 13,
    marginBottom: 16,
  },
  bannerError: {
    backgroundColor: '#fdecea',
    borderColor: '#fdc8bf',
  },
  bannerWarn: {
    backgroundColor: '#fdf3df',
    borderColor: '#fde9c2',
  },
  bannerText: {
    fontSize: 13,
    color: '#5b4a2a',
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    color: '#1a1c20',
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  kvRowHighlight: {
    borderBottomWidth: 0,
    paddingTop: 12,
    marginTop: 4,
  },
  kvKey: {
    fontSize: 13,
    color: '#5b606c',
  },
  kvValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
  },
  kvValueBold: {
    fontSize: 16,
    fontWeight: '800',
  },
  benefitText: {
    fontSize: 12.5,
    color: '#5b606c',
    lineHeight: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#5b606c',
    marginBottom: 20,
    lineHeight: 18,
  },
  tileGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  tile: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  tileSelected: {
    borderColor: '#ff7a1a',
    backgroundColor: '#fff6ee',
  },
  tileEmoji: {
    fontSize: 20,
    marginBottom: 6,
  },
  tileLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
  },
  tileAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
    marginTop: 4,
  },
  tileDays: {
    fontSize: 11,
    color: '#5b606c',
  },
  hint: {
    fontSize: 12,
    color: '#5b606c',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15.5,
    fontWeight: '700',
  },
  buttonLink: {
    padding: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  buttonLinkText: {
    color: '#ff7a1a',
    fontSize: 13,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  paymentCard: {
    backgroundColor: '#0a6e3d',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  paymentCardText: {
    color: '#fff',
    fontSize: 13,
    marginBottom: 14,
  },
  numberBox: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  numberBoxLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  numberBoxValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginTop: 4,
  },
  copyIcon: {
    fontSize: 20,
  },
  amountBox: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  amountBoxLabel: {
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  amountBoxValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
  },
  paymentHint: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#5b606c',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.04,
  },
  required: {
    color: '#e0453f',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    padding: 13,
    fontSize: 14,
    color: '#1a1c20',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#ff7a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  stepperValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1c20',
    minWidth: 60,
    textAlign: 'center',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    marginBottom: 16,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ff7a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxTick: {
    color: '#ff7a1a',
    fontWeight: '700',
    fontSize: 12,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 12,
    color: '#5b606c',
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  paymentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20',
  },
  paymentDate: {
    fontSize: 11,
    color: '#8b92a3',
    marginTop: 2,
  },
  paymentCode: {
    fontSize: 11,
    color: '#5b606c',
    marginTop: 4,
  },
  paymentRight: {
    alignItems: 'flex-end',
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#eee',
    color: '#666',
    marginBottom: 4,
  },
  badgeGreen: {
    backgroundColor: '#e6f5ef',
    color: '#1e9e6f',
  },
  paymentAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e9e6f',
  },
  empty: {
    fontSize: 13,
    color: '#8b92a3',
    paddingVertical: 12,
    textAlign: 'center',
  },
});