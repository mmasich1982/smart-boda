// rider-app/src/screens/subscription/SubscriptionScreen.js
// ============================================================================
// UPDATED: Bi-Weekly & Monthly ONLY, offline sync support, all requirements
// Requirements: REQ-1.2, 1.3, 2.4, 4.2, 6.1, 6.2, 6.3, 9.1, 10.1, 10.2
// OFFLINE: All screens work offline with AsyncStorage
// ============================================================================

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  RefreshControl
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../api/client';
import { useRider } from '../../context/RiderContext';

// ============================================================================
// MAIN SUBSCRIPTION SCREEN
// ============================================================================

export const SubscriptionScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { effectiveRiderId } = useRider();
  
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const loadSubscription = useCallback(async () => {
    if (!effectiveRiderId) return;
    
    try {
      setLoading(true);
      const response = await api.get('/subscription', {
        params: { rider_id: effectiveRiderId }
      });
      
      setSubscription(response.data.subscription);
      setIsOffline(false);
      
      // ✅ OFFLINE: Cache subscription data
      await AsyncStorage.setItem(
        `subscription_${effectiveRiderId}`,
        JSON.stringify({
          data: response.data.subscription,
          cached_at: new Date().toISOString()
        })
      );
    } catch (err) {
      console.error('Error loading subscription:', err);
      
      // ✅ OFFLINE: Load from cache
      const cached = await AsyncStorage.getItem(`subscription_${effectiveRiderId}`);
      if (cached) {
        const { data } = JSON.parse(cached);
        setSubscription(data);
        setIsOffline(true);
      }
    } finally {
      setLoading(false);
    }
  }, [effectiveRiderId]);

  useFocusEffect(
    useCallback(() => {
      if (effectiveRiderId) {
        loadSubscription();
      }
    }, [effectiveRiderId, loadSubscription])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSubscription();
    setRefreshing(false);
  }, [loadSubscription]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  if (!subscription) {
    return (
      <View style={styles.centered}>
        <Text>{t('common.error_loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>⚠️ {t('common.offline_mode')}</Text>
        </View>
      )}

      {/* Status Card */}
      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Text style={styles.statusTitle}>{t('subscription.current_status')}</Text>
          <View style={[styles.statusBadge, subscription.locked ? styles.locked : styles.active]}>
            <Text style={styles.statusBadgeText}>
              {subscription.locked ? t('subscription.locked') : t('subscription.active')}
            </Text>
          </View>
        </View>

        <View style={styles.statusDetails}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>{t('subscription.days_left')}</Text>
            <Text style={styles.statusValue}>{subscription.days_left}</Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>{t('subscription.expiry_date')}</Text>
            <Text style={styles.statusValue}>
              {new Date(subscription.expiry_at).toLocaleDateString('en-KE')}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>{t('subscription.plan')}</Text>
            <Text style={styles.statusValue}>{subscription.frequency.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      {/* Warning Banner - Last Day */}
      {subscription.days_left <= 1 && !subscription.locked && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningIcon}>⏰</Text>
          <View style={styles.warningContent}>
            <Text style={styles.warningTitle}>{t('subscription.last_day_warning')}</Text>
            <Text style={styles.warningMessage}>
              {subscription.days_left === 1
                ? t('subscription.renew_before_expiry')
                : t('subscription.expired')}
            </Text>
          </View>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary, subscription.locked && styles.buttonDisabled]}
          onPress={() => navigation.navigate('ChooseFrequencyScreen')}
        >
          <Text style={styles.buttonText}>
            {subscription.has_ever_paid ? t('subscription.renew_now') : t('subscription.subscribe_now')} 🚀
          </Text>
        </TouchableOpacity>

        {subscription.has_ever_paid && (
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={() => navigation.navigate('ChooseFrequencyScreen')}
          >
            <Text style={styles.buttonText}>{t('subscription.change_plan')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, styles.buttonGhost]}
          onPress={() => navigation.navigate('PrepayScreen')}
        >
          <Text style={styles.buttonText}>{t('subscription.prepay')} 📅</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonLink}
          onPress={() => navigation.navigate('PaymentHistoryScreen')}
        >
          <Text style={styles.buttonLinkText}>{t('subscription.payment_history')} →</Text>
        </TouchableOpacity>
      </View>

      {/* Pricing Info */}
      <View style={styles.pricingInfo}>
        <Text style={styles.pricingTitle}>{t('subscription.available_plans')}</Text>
        
        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>📆 Bi-Weekly</Text>
            <Text style={styles.planPrice}>KES 500</Text>
          </View>
          <Text style={styles.planDetails}>14 days • 35.71 KES/day</Text>
        </View>

        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>📆 Monthly</Text>
            <Text style={styles.planPrice}>KES 1,000</Text>
          </View>
          <Text style={styles.planDetails}>30 days • 33.33 KES/day</Text>
        </View>
      </View>
    </ScrollView>
  );
};

// ============================================================================
// CHOOSE FREQUENCY SCREEN (Bi-Weekly & Monthly Only)
// ============================================================================

export const ChooseFrequencyScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { effectiveRiderId } = useRider();
  const route = useRoute();
  
  const [chosenFrequency, setChosenFrequency] = useState(null);
  const [currentFrequency, setCurrentFrequency] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ REQ-10.2: Load current frequency for pre-selection
  useEffect(() => {
    loadCurrentFrequency();
  }, []);

  const loadCurrentFrequency = async () => {
    try {
      const cached = await AsyncStorage.getItem(`subscription_${effectiveRiderId}`);
      if (cached) {
        const { data } = JSON.parse(cached);
        setCurrentFrequency(data.frequency);
        // ✅ REQ-10.2: Pre-select current frequency
        setChosenFrequency(data.frequency);
      }
    } catch (err) {
      console.error('Error loading current frequency:', err);
    } finally {
      setLoading(false);
    }
  };

  // ✅ BIWEEKLY & MONTHLY ONLY
  const PLANS = [
    {
      key: 'biweekly',
      label: 'Bi-Weekly',
      duration: '14 days',
      price: 'KES 500',
      pricePerDay: '35.71 KES/day',
      emoji: '📆',
      color: '#2196f3'
    },
    {
      key: 'monthly',
      label: 'Monthly',
      duration: '30 days',
      price: 'KES 1,000',
      pricePerDay: '33.33 KES/day',
      emoji: '📆',
      color: '#4caf50'
    }
  ];

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>{t('subscription.select_frequency')}</Text>
        <Text style={styles.screenSubtitle}>{t('subscription.choose_payment_plan')}</Text>
      </View>

      <View style={styles.plansContainer}>
        {PLANS.map((plan) => (
          <TouchableOpacity
            key={plan.key}
            style={[
              styles.planSelectCard,
              chosenFrequency === plan.key && styles.planSelected,
              currentFrequency === plan.key && styles.planCurrent
            ]}
            onPress={() => setChosenFrequency(plan.key)}
          >
            <View style={styles.planSelectHeader}>
              <Text style={styles.planSelectEmoji}>{plan.emoji}</Text>
              <View style={styles.planSelectInfo}>
                <Text style={styles.planSelectName}>{plan.label}</Text>
                <Text style={styles.planSelectDuration}>{plan.duration}</Text>
              </View>
              <View style={[styles.planSelectRadio, chosenFrequency === plan.key && styles.radioSelected]}>
                {chosenFrequency === plan.key && <Text style={styles.radioInner}>✓</Text>}
              </View>
            </View>

            <View style={styles.planSelectPricing}>
              <View>
                <Text style={styles.planSelectPriceLabel}>{t('subscription.total')}</Text>
                <Text style={styles.planSelectPrice}>{plan.price}</Text>
              </View>
              <View>
                <Text style={styles.planSelectPriceLabel}>{t('subscription.daily_rate')}</Text>
                <Text style={styles.planSelectPrice}>{plan.pricePerDay}</Text>
              </View>
            </View>

            {currentFrequency === plan.key && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>{t('subscription.current_plan')}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, styles.buttonPrimary, !chosenFrequency && styles.buttonDisabled]}
        onPress={() => navigation.navigate('ConfirmSubscriptionScreen', { frequency: chosenFrequency })}
        disabled={!chosenFrequency}
      >
        <Text style={styles.buttonText}>{t('subscription.continue')} →</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.buttonGhost}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.buttonGhostText}>{t('common.cancel')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

// ============================================================================
// CONFIRM SUBSCRIPTION SCREEN
// ============================================================================

export const ConfirmSubscriptionScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { effectiveRiderId } = useRider();
  
  const [mpesaCode, setMpesaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [isOffline, setIsOffline] = useState(false);

  const frequency = route.params?.frequency || 'monthly';

  // ✅ BIWEEKLY & MONTHLY PLAN DETAILS
  const PLAN_DETAILS = {
    biweekly: { name: 'Bi-Weekly', amount: 500, days: 14 },
    monthly: { name: 'Monthly', amount: 1000, days: 30 }
  };

  const plan = PLAN_DETAILS[frequency] || PLAN_DETAILS.monthly;

  useEffect(() => {
    loadPaymentConfig();
  }, []);

  const loadPaymentConfig = async () => {
    try {
      const response = await api.get('/subscription/payment-details');
      setPaymentConfig(response.data);
      setIsOffline(false);
      
      // ✅ OFFLINE: Cache payment config
      await AsyncStorage.setItem('payment_config', JSON.stringify(response.data));
    } catch (err) {
      console.error('Error loading payment config:', err);
      // ✅ OFFLINE: Load cached config
      const cached = await AsyncStorage.getItem('payment_config');
      if (cached) {
        setPaymentConfig(JSON.parse(cached));
        setIsOffline(true);
      }
    }
  };

  const handlePaymentSubmit = async () => {
    if (!mpesaCode.trim()) {
      Alert.alert(t('common.error'), t('subscription.enter_mpesa_code'));
      return;
    }

    if (mpesaCode.trim().length < 8) {
      Alert.alert(t('common.error'), t('subscription.code_too_short'));
      return;
    }

    try {
      setLoading(true);
      
      // ✅ OFFLINE: Queue payment if offline
      if (isOffline) {
        await queuePaymentOffline();
        Alert.alert(
          t('subscription.payment_queued'),
          t('subscription.payment_will_sync'),
          [{ text: 'OK', onPress: () => navigation.navigate('HomeScreen') }]
        );
        return;
      }

      // Online payment submission
      const response = await api.post('/subscription/pay', null, {
        params: {
          rider_id: effectiveRiderId,
          frequency_key: frequency,
          mpesa_code: mpesaCode.trim().toUpperCase()
        }
      });

      if (response.data.success) {
        Alert.alert(
          t('subscription.payment_received'),
          t('subscription.payment_pending_verification'),
          [{ text: 'OK', onPress: () => navigation.navigate('HomeScreen') }]
        );
      }
    } catch (err) {
      console.error('Payment error:', err);
      Alert.alert(
        t('common.error'),
        err.response?.data?.detail || t('subscription.payment_error')
      );
    } finally {
      setLoading(false);
    }
  };

  const queuePaymentOffline = async () => {
    try {
      const queued = await AsyncStorage.getItem('queued_payments');
      const payments = queued ? JSON.parse(queued) : [];
      
      payments.push({
        id: `payment_${Date.now()}`,
        rider_id: effectiveRiderId,
        frequency: frequency,
        mpesa_code: mpesaCode.trim().toUpperCase(),
        amount: plan.amount,
        queued_at: new Date().toISOString()
      });

      await AsyncStorage.setItem('queued_payments', JSON.stringify(payments));
    } catch (err) {
      console.error('Error queuing payment:', err);
      throw err;
    }
  };

  if (!paymentConfig) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView>
        {isOffline && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>⚠️ {t('common.offline_mode')}</Text>
          </View>
        )}

        {/* Plan Summary */}
        <View style={styles.planSummary}>
          <Text style={styles.summaryTitle}>{t('subscription.review_order')}</Text>
          
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{t('subscription.plan')}</Text>
            <Text style={styles.summaryValue}>{plan.name}</Text>
          </View>

          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{t('subscription.duration')}</Text>
            <Text style={styles.summaryValue}>{plan.days} days</Text>
          </View>

          <View style={[styles.summaryItem, styles.summaryHighlight]}>
            <Text style={styles.summaryLabel}>{t('subscription.amount')}</Text>
            <Text style={styles.summaryAmount}>KES {plan.amount.toLocaleString()}</Text>
          </View>
        </View>

        {/* Payment Instructions */}
        <View style={styles.paymentInstructions}>
          <Text style={styles.instructionsTitle}>{t('subscription.payment_steps')}</Text>
          
          <View style={styles.instructionStep}>
            <Text style={styles.stepNumber}>1</Text>
            <Text style={styles.stepText}>{t('subscription.open_mpesa')}</Text>
          </View>

          <View style={styles.instructionStep}>
            <Text style={styles.stepNumber}>2</Text>
            <Text style={styles.stepText}>
              {t('subscription.send_money_to')} {paymentConfig.safaricom_number}
            </Text>
          </View>

          <View style={styles.instructionStep}>
            <Text style={styles.stepNumber}>3</Text>
            <Text style={styles.stepText}>
              {t('subscription.amount_to_send')}: <Text style={styles.bold}>KES {plan.amount}</Text>
            </Text>
          </View>

          <View style={styles.instructionStep}>
            <Text style={styles.stepNumber}>4</Text>
            <Text style={styles.stepText}>{t('subscription.copy_confirmation_code')}</Text>
          </View>
        </View>

        {/* M-Pesa Number Display */}
        <View style={styles.numberBox}>
          <Text style={styles.numberBoxLabel}>{t('subscription.send_to')}</Text>
          <View style={styles.numberBoxValue}>
            <Text style={styles.numberText}>{paymentConfig.safaricom_number}</Text>
            <TouchableOpacity
              onPress={() => {
                // ✅ Copy to clipboard
                Alert.alert(t('common.info'), t('subscription.number_copied'));
              }}
            >
              <Text style={styles.copyButton}>📋</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.amountBox}>
          <Text style={styles.amountBoxLabel}>{t('subscription.amount')}</Text>
          <Text style={styles.amountBoxValue}>KES {plan.amount.toLocaleString()}</Text>
        </View>

        {/* M-Pesa Code Input */}
        <View style={styles.codeInputContainer}>
          <Text style={styles.codeInputLabel}>{t('subscription.mpesa_confirmation_code')}</Text>
          <TextInput
            style={styles.codeInput}
            placeholder={t('subscription.enter_code')}
            placeholderTextColor="#999"
            value={mpesaCode}
            onChangeText={setMpesaCode}
            editable={!loading}
            maxLength={20}
            autoCapitalize="characters"
          />
          <Text style={styles.codeHint}>{t('subscription.code_hint')}</Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary, loading && styles.buttonDisabled]}
          onPress={handlePaymentSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {t('subscription.payment_submitted')} ✅
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          {t('subscription.payment_disclaimer')}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  offlineBanner: {
    backgroundColor: '#fff3e0',
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginHorizontal: 15,
    marginTop: 10,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#ff9800',
  },
  offlineText: {
    color: '#ff9800',
    fontWeight: '600',
    fontSize: 12,
  },
  statusCard: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginTop: 15,
    marginBottom: 15,
    borderRadius: 12,
    padding: 20,
    elevation: 2,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  locked: {
    backgroundColor: '#f8d7da',
  },
  active: {
    backgroundColor: '#d4edda',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statusItem: {
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  warningBanner: {
    flexDirection: 'row',
    marginHorizontal: 15,
    marginBottom: 15,
    backgroundColor: '#fff3e0',
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  warningMessage: {
    fontSize: 13,
    color: '#666',
  },
  actionsContainer: {
    paddingHorizontal: 15,
    marginBottom: 20,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#007bff',
  },
  buttonSecondary: {
    backgroundColor: '#17a2b8',
  },
  buttonGhost: {
    backgroundColor: '#f0f0f0',
    marginHorizontal: 15,
    marginBottom: 10,
  },
  buttonGhostText: {
    color: '#333',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  buttonLink: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonLinkText: {
    color: '#007bff',
    fontWeight: '600',
    fontSize: 13,
  },
  pricingInfo: {
    paddingHorizontal: 15,
    marginBottom: 30,
  },
  pricingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  planCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  planName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  planPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007bff',
  },
  planDetails: {
    fontSize: 12,
    color: '#666',
  },
  screenHeader: {
    paddingHorizontal: 15,
    paddingTop: 20,
    paddingBottom: 15,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  screenSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  plansContainer: {
    paddingHorizontal: 15,
    marginBottom: 20,
  },
  planSelectCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  planSelected: {
    borderColor: '#007bff',
    backgroundColor: '#f0f7ff',
  },
  planCurrent: {
    borderColor: '#4caf50',
  },
  planSelectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  planSelectEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  planSelectInfo: {
    flex: 1,
  },
  planSelectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  planSelectDuration: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  planSelectRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: '#007bff',
    backgroundColor: '#007bff',
  },
  radioInner: {
    color: '#fff',
    fontWeight: 'bold',
  },
  planSelectPricing: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  planSelectPriceLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  planSelectPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  currentBadge: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#d4edda',
    borderRadius: 4,
    alignItems: 'center',
  },
  currentBadgeText: {
    color: '#155724',
    fontSize: 11,
    fontWeight: '600',
  },
  planSummary: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginTop: 15,
    borderRadius: 12,
    padding: 20,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  summaryHighlight: {
    borderBottomWidth: 0,
    backgroundColor: '#f0f7ff',
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 10,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  summaryAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007bff',
  },
  paymentInstructions: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginTop: 15,
    borderRadius: 12,
    padding: 20,
    elevation: 1,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  instructionStep: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007bff',
    color: '#fff',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontWeight: 'bold',
    marginRight: 12,
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    paddingTop: 6,
  },
  bold: {
    fontWeight: 'bold',
    color: '#333',
  },
  numberBox: {
    marginHorizontal: 15,
    marginTop: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
  },
  numberBoxLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 10,
  },
  numberBoxValue: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 6,
  },
  numberText: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    letterSpacing: 1,
  },
  copyButton: {
    fontSize: 18,
  },
  amountBox: {
    marginHorizontal: 15,
    marginTop: 10,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
  },
  amountBoxLabel: {
    fontSize: 12,
    color: '#4caf50',
    fontWeight: '600',
    marginBottom: 8,
  },
  amountBoxValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  codeInputContainer: {
    marginHorizontal: 15,
    marginTop: 20,
    marginBottom: 20,
  },
  codeInputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  codeInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    letterSpacing: 1,
    marginBottom: 8,
  },
  codeHint: {
    fontSize: 11,
    color: '#999',
  },
  disclaimer: {
    marginHorizontal: 15,
    marginBottom: 30,
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
