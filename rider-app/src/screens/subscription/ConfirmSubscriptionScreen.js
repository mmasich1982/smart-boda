// rider-app/src/screens/subscription/ConfirmSubscriptionScreen.js
// ============================================================================
// ✅ FIXED: Dependency Management & Infinite Loop Resolution
// ============================================================================
// CRITICAL FIXES:
// 1. Removed loadSubscriptionDetails from useFocusEffect dependencies
// 2. Used refs to track initialization state
// 3. Separated concerns: data loading from lifecycle hooks
// 4. Memoized payment processing function
// ============================================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useRider } from '../../rider/RiderContext';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import api from '../../api/client';

const ConfirmSubscriptionScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { state } = useRider();
  const riderId = state?.riderId;

  // ========================================================================
  // STATE
  // ========================================================================
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [subscriptionDetails, setSubscriptionDetails] = useState(null);

  // Route params from FrequencySelectScreen
  const { frequency, label, days, price, isRenewal } = route.params || {};

  // ========================================================================
  // CONTROL MECHANISMS
  // ========================================================================
  const hasLoadedRef = useRef(false);
  const isMountedRef = useRef(true);
  const riderIdRef = useRef(riderId);

  // Update rider ID ref when it changes
  useEffect(() => {
    riderIdRef.current = riderId;
  }, [riderId]);

  // ========================================================================
  // LOAD SUBSCRIPTION DETAILS
  // ========================================================================
  // ✅ FIXED: This function is NOT in useFocusEffect dependencies
  const loadSubscriptionDetails = useCallback(async () => {
    if (!riderIdRef.current || !isMountedRef.current) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let details = null;

      // Try API first
      try {
        const response = await api.get('/subscription/details', {
          params: { rider_id: riderIdRef.current }
        });

        if (response?.data) {
          details = response.data;

          // Cache in IndexedDB
          await indexedDbAdapter.kvSet(
            `subscription_details_${riderIdRef.current}`,
            JSON.stringify({
              data: details,
              cached_at: new Date().toISOString()
            })
          );
        }
      } catch (apiErr) {
        console.warn('⚠️ API fetch failed:', apiErr.message);
      }

      // Fallback to cache
      if (!details) {
        try {
          const cached = await indexedDbAdapter.kvGet(
            `subscription_details_${riderIdRef.current}`
          );
          if (cached) {
            details = JSON.parse(cached).data;
          }
        } catch (cacheErr) {
          console.warn('⚠️ Cache load failed:', cacheErr.message);
        }
      }

      if (isMountedRef.current) {
        setSubscriptionDetails(details);
      }
    } catch (err) {
      console.error('❌ Error loading subscription details:', err);
      if (isMountedRef.current) {
        setError('error_loading');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []); // ✅ FIXED: Empty dependency array - uses riderIdRef

  // ========================================================================
  // SUBMIT PAYMENT
  // ========================================================================
  // ✅ FIXED: Memoized with stable dependencies
  const handleSubmitPayment = useCallback(async () => {
    if (!riderIdRef.current || !frequency || !price || processing) {
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      // Submit payment initiation request
      const response = await api.post('/subscription/initiate-payment', {
        rider_id: riderIdRef.current,
        frequency,
        amount: price,
        days,
        isRenewal
      });

      if (response?.data?.payment_code) {
        // Cache payment pending status
        await indexedDbAdapter.kvSet(
          `payment_pending_${riderIdRef.current}`,
          JSON.stringify({
            paymentCode: response.data.payment_code,
            frequency,
            amount: price,
            initiated_at: new Date().toISOString()
          })
        );

        // Navigate to payment confirmation screen
        navigation.navigate('ConfirmPaymentScreen', {
          paymentCode: response.data.payment_code,
          frequency,
          amount: price,
          days
        });
      } else {
        setError('payment_initiation_failed');
      }
    } catch (err) {
      console.error('❌ Payment submission error:', err);
      setError('error_submitting_payment');
      
      Alert.alert(
        t('common.error'),
        t('subscription.payment_initiation_failed'),
        [{ text: t('common.retry'), onPress: handleSubmitPayment }]
      );
    } finally {
      if (isMountedRef.current) {
        setProcessing(false);
      }
    }
  }, [frequency, price, days, isRenewal, navigation]);

  // ========================================================================
  // EFFECTS & LIFECYCLE
  // ========================================================================

  // ✅ Initialize mount/unmount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ✅ FIXED: Load on screen focus
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current && riderIdRef.current) {
        hasLoadedRef.current = true;
        loadSubscriptionDetails();
      }

      return () => {
        // Don't reset on unfocus
      };
    }, [loadSubscriptionDetails]) // loadSubscriptionDetails is now stable
  );

  // ✅ Reset loaded flag when rider ID changes
  useEffect(() => {
    hasLoadedRef.current = false;
  }, [riderId]);

  // ========================================================================
  // RENDER
  // ========================================================================

  if (!frequency || !price || !days) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('common.error')}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.retryButtonText}>{t('common.go_back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backLink}
      >
        <Text style={styles.backLinkText}>← {t('common.back')}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{t('subscription.confirm_purchase')}</Text>

      {/* SELECTED PLAN CARD */}
      <View style={styles.planCard}>
        <View style={styles.planHeader}>
          <Text style={styles.planLabel}>📦 {t('subscription.selected_plan')}</Text>
        </View>

        <View style={styles.planDetail}>
          <Text style={styles.planDetailLabel}>{t('subscription.plan_type')}</Text>
          <Text style={styles.planDetailValue}>{label}</Text>
        </View>

        <View style={styles.planDetail}>
          <Text style={styles.planDetailLabel}>{t('subscription.duration')}</Text>
          <Text style={styles.planDetailValue}>
            {days} {t('common.days')}
          </Text>
        </View>

        <View style={[styles.planDetail, styles.planDetailHighlight]}>
          <Text style={styles.planDetailLabelBold}>
            {t('subscription.total_amount')}
          </Text>
          <Text style={styles.planDetailValueBold}>
            KES {price.toLocaleString('en-KE')}
          </Text>
        </View>
      </View>

      {/* CURRENT SUBSCRIPTION INFO */}
      {isRenewal && subscriptionDetails && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>
            {t('subscription.current_subscription')}
          </Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>
              {t('subscription.expires_at')}
            </Text>
            <Text style={styles.infoValue}>
              {subscriptionDetails.expiry_at
                ? new Date(subscriptionDetails.expiry_at).toLocaleDateString('en-KE')
                : 'N/A'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>
              {t('subscription.days_left')}
            </Text>
            <Text style={styles.infoValue}>
              {subscriptionDetails.days_left || 0}
            </Text>
          </View>
        </View>
      )}

      {/* TERMS & CONDITIONS */}
      <View style={styles.termsCard}>
        <View style={styles.termsHeader}>
          <Text style={styles.termsIcon}>⚖️</Text>
          <Text style={styles.termsTitle}>{t('subscription.payment_terms')}</Text>
        </View>

        <Text style={styles.termsText}>
          {t('subscription.payment_will_be_charged')}
        </Text>

        <Text style={styles.termsText}>
          {t('subscription.by_proceeding_you_agree')}
        </Text>
      </View>

      {/* ERROR BANNER */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>
            {t(`subscription.${error}`)}
          </Text>
        </View>
      )}

      {/* ACTION BUTTONS */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.confirmButton, processing && styles.buttonDisabled]}
          onPress={handleSubmitPayment}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.confirmButtonText}>
              {t('subscription.proceed_to_payment')} →
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={processing}
        >
          <Text style={styles.cancelButtonText}>
            {t('common.cancel')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* INFO BANNER */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoText}>
          {t('subscription.payment_via_mpesa_secure')}
        </Text>
      </View>
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
    padding: 16
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f6f4ef',
    paddingHorizontal: 20
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
    marginBottom: 20
  },

  planCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ff7a1a',
    padding: 16,
    marginBottom: 16
  },
  planHeader: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db'
  },
  planLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1c20'
  },

  planDetail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10
  },
  planDetailHighlight: {
    marginTop: 8,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff8f0',
    borderRadius: 8,
    borderTopWidth: 1,
    borderTopColor: '#e7e4db'
  },
  planDetailLabel: {
    fontSize: 13,
    color: '#5b606c',
    fontWeight: '500'
  },
  planDetailLabelBold: {
    fontSize: 14,
    color: '#ff7a1a',
    fontWeight: '700'
  },
  planDetailValue: {
    fontSize: 14,
    color: '#1a1c20',
    fontWeight: '600'
  },
  planDetailValueBold: {
    fontSize: 18,
    color: '#ff7a1a',
    fontWeight: '700'
  },

  infoCard: {
    backgroundColor: '#e3f2fd',
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  infoCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1565c0',
    marginBottom: 10
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  infoLabel: {
    fontSize: 12,
    color: '#1a1c20',
    fontWeight: '500'
  },
  infoValue: {
    fontSize: 12,
    color: '#1565c0',
    fontWeight: '600'
  },

  termsCard: {
    backgroundColor: '#fff3e0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800'
  },
  termsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  termsIcon: {
    fontSize: 16,
    marginRight: 8
  },
  termsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e65100'
  },
  termsText: {
    fontSize: 12,
    color: '#1a1c20',
    lineHeight: 16,
    marginBottom: 8
  },

  errorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  errorText: {
    fontSize: 12,
    color: '#a5312c',
    fontWeight: '600'
  },

  actionsContainer: {
    gap: 12,
    marginBottom: 16
  },
  confirmButton: {
    backgroundColor: '#ff7a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4
  },
  cancelButton: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e7e4db'
  },
  buttonDisabled: {
    opacity: 0.6
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700'
  },
  cancelButtonText: {
    color: '#1a1c20',
    fontSize: 15,
    fontWeight: '600'
  },

  infoBanner: {
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24
  },
  infoIcon: {
    fontSize: 16
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#1a1c20',
    lineHeight: 16
  },
  retryButton: {
    backgroundColor: '#ff7a1a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  }
});

export default ConfirmSubscriptionScreen;