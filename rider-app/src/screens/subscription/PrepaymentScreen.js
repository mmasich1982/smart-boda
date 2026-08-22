// rider-app/src/screens/subscription/PrepaymentScreen.js
// ✅ OFFLINE FIRST - RA-33-C Multi-Day Prepayment Screen
// ✅ INDEXED DB: All data persisted locally with IndexedDB adapter
// ✅ MULTILINGUAL: Full localization support via i18n
// Allow users to pay ahead for 3-60 days at current daily rate

import React, { useState, useEffect, useContext } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Slider
} from 'react-native';
import BackLink from '../../components/BackLink';
import { AppContext } from '../../context/AppContext';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import { useTranslation } from '../../i18n/LocalizationProvider';
import api from '../../api/client';

const PrepaymentScreen = ({ navigation }) => {
  const { state } = useContext(AppContext);
  const { t } = useTranslation();

  const [days, setDays] = useState(7);
  const [pricingData, setPricingData] = useState(null);
  const [loading, setLoading] = useState(true);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  const riderId = state?.riderId;

  // ✅ SPEC RA-33-C: Prepayment range 3-60 days
  const MIN_PREPAY_DAYS = 3;
  const MAX_PREPAY_DAYS = 60;

  // ========================================================================
  // OFFLINE FIRST: Load pricing from cache, then API
  // ========================================================================

  useEffect(() => {
    if (!isInitialized) return;
    loadPricingData();
  }, [isInitialized]);

  const loadPricingData = async () => {
    try {
      setLoading(true);
      clearCriticalError();

      // Try API first if online
      if (isConnected && isInitialized) {
        try {
          const response = await api.get('/api/riders/subscription/pricing-config');

          if (response.ok && response.data) {
            setPricingData(response.data);

            // Cache it using IndexedDB
            await indexedDbAdapter.kvSet(
              `pricing_config_${riderId}`,
              JSON.stringify(response.data)
            );
            console.log('✅ Loaded pricing from API');
            return;
          }
        } catch (apiErr) {
          console.warn('⚠️ API load failed, using cache');
        }
      }

      // Fallback: Use cached pricing
      loadPricingFromCache();
    } catch (err) {
      console.error('❌ Error loading pricing:', err);
      showCriticalError(t('error_pricingLoadFailed') || 'Failed to load pricing data', 'data_load');
    } finally {
      setLoading(false);
    }
  };

  const loadPricingFromCache = async () => {
    try {
      const cached = await indexedDbAdapter.kvGet(`pricing_config_${riderId}`);
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
        setPricingData(data);
        console.log('✅ Loaded pricing from cache');
      } else {
        // Use default pricing
        setPricingData({
          biweekly_price: 500,
          monthly_price: 1000
        });
        console.log('✅ Using default pricing');
      }
    } catch (err) {
      console.error('❌ Cache load error:', err);
      // Use hardcoded defaults as fallback
      setPricingData({
        biweekly_price: 500,
        monthly_price: 1000
      });
    }
  };

  // ========================================================================
  // Calculate Prepayment Amount
  // ========================================================================

  const dailyRate = 35; // Default daily rate
  const totalAmount = dailyRate * days;

  const getDayPricing = () => {
    return {
      days,
      dailyRate,
      totalAmount,
      perDayBreakdown: (totalAmount / days).toFixed(0)
    };
  };

  // ========================================================================
  // Handle Continue to Payment
  // ========================================================================

  const handleContinueToPayment = () => {
    if (days < MIN_PREPAY_DAYS || days > MAX_PREPAY_DAYS) {
      showCriticalError(
        t('error_prepaymentRangeInvalid') || `Prepayment must be between ${MIN_PREPAY_DAYS} and ${MAX_PREPAY_DAYS} days`,
        'validation'
      );
      return;
    }

    clearCriticalError();

    const pricing = getDayPricing();
    navigation.navigate('ConfirmSubscription', {
      frequency: 'prepay',
      label: `${days}-${t('dayLabel') || 'Day'} ${t('prepayment') || 'Prepayment'}`,
      days: days,
      price: totalAmount,
      isPrepayment: true
    });
  };

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('prepayYourSubscription') || 'Prepay Your Subscription'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  if (loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('prepayYourSubscription') || 'Prepay Your Subscription'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  const pricing = getDayPricing();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
      <Text style={styles.title}>{t('prepayYourSubscription') || 'Prepay Your Subscription'}</Text>

      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* INFO BANNER */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoText}>
          {t('prepaymentInfoText') || 'Pay ahead for 3 to 60 days at our current daily rate. More flexibility, same great service!'}
        </Text>
      </View>

      {/* DAYS SELECTOR CARD */}
      <View style={styles.selectorCard}>
        <Text style={styles.selectorLabel}>{t('howManyDaysPrepay') || 'How many days would you like to prepay?'}</Text>

        {/* Large Days Display */}
        <View style={styles.daysDisplay}>
          <Text style={styles.daysNumber}>{days}</Text>
          <Text style={styles.daysLabel}>{t('days') || 'days'}</Text>
        </View>

        {/* Slider */}
        <View style={styles.sliderContainer}>
          <Text style={styles.rangeLabel}>{MIN_PREPAY_DAYS}</Text>
          <Slider
            style={styles.slider}
            minimumValue={MIN_PREPAY_DAYS}
            maximumValue={MAX_PREPAY_DAYS}
            step={1}
            value={days}
            onValueChange={setDays}
            minimumTrackTintColor="#ff7a1a"
            maximumTrackTintColor="#e7e4db"
            thumbTintColor="#ff7a1a"
          />
          <Text style={styles.rangeLabel}>{MAX_PREPAY_DAYS}</Text>
        </View>

        {/* Quick Select Buttons */}
        <View style={styles.quickSelectContainer}>
          <TouchableOpacity
            style={[
              styles.quickSelectBtn,
              days === 7 && styles.quickSelectBtnActive
            ]}
            onPress={() => setDays(7)}
          >
            <Text
              style={[
                styles.quickSelectBtnText,
                days === 7 && styles.quickSelectBtnTextActive
              ]}
            >
              {t('oneWeek') || '1 Week'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickSelectBtn,
              days === 14 && styles.quickSelectBtnActive
            ]}
            onPress={() => setDays(14)}
          >
            <Text
              style={[
                styles.quickSelectBtnText,
                days === 14 && styles.quickSelectBtnTextActive
              ]}
            >
              {t('twoWeeks') || '2 Weeks'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickSelectBtn,
              days === 30 && styles.quickSelectBtnActive
            ]}
            onPress={() => setDays(30)}
          >
            <Text
              style={[
                styles.quickSelectBtnText,
                days === 30 && styles.quickSelectBtnTextActive
              ]}
            >
              {t('oneMonth') || '1 Month'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickSelectBtn,
              days === 60 && styles.quickSelectBtnActive
            ]}
            onPress={() => setDays(60)}
          >
            <Text
              style={[
                styles.quickSelectBtnText,
                days === 60 && styles.quickSelectBtnTextActive
              ]}
            >
              {t('twoMonths') || '2 Months'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* PRICING BREAKDOWN */}
      <View style={styles.pricingCard}>
        <Text style={styles.pricingTitle}>💰 {t('pricingBreakdown') || 'Pricing Breakdown'}</Text>

        <View style={styles.pricingRow}>
          <Text style={styles.pricingLabel}>{t('dailyRate') || 'Daily Rate'}</Text>
          <Text style={styles.pricingValue}>KSh {pricing.dailyRate}</Text>
        </View>

        <View style={styles.pricingRow}>
          <Text style={styles.pricingLabel}>{t('duration') || 'Duration'}</Text>
          <Text style={styles.pricingValue}>{pricing.days} {t('days') || 'days'}</Text>
        </View>

        <View style={[styles.pricingRow, styles.pricingRowHighlight]}>
          <Text style={styles.pricingLabelHighlight}>{t('totalAmount') || 'Total Amount'}</Text>
          <Text style={styles.pricingAmountHighlight}>KSh {pricing.totalAmount}</Text>
        </View>

        <View style={styles.pricingFooter}>
          <Text style={styles.pricingFooterText}>
            {t('equalsPerDay') || 'Equals'} {pricing.perDayBreakdown} KSh {t('perDay') || 'per day'}
          </Text>
        </View>
      </View>

      {/* FEATURES */}
      <View style={styles.featuresCard}>
        <Text style={styles.featuresTitle}>✅ {t('whatYouGet') || 'What You Get'}</Text>

        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>🎯</Text>
          <Text style={styles.featureText}>{t('uninterruptedAccess') || 'Uninterrupted access to all features'}</Text>
        </View>

        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>🔔</Text>
          <Text style={styles.featureText}>{t('automationRenewalReminder') || 'Automatic renewal reminder before expiry'}</Text>
        </View>

        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>📊</Text>
          <Text style={styles.featureText}>{t('fullTripHistoryAnalytics') || 'Full trip history and analytics'}</Text>
        </View>

        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>💬</Text>
          <Text style={styles.featureText}>{t('prioritySupport') || 'Priority support'}</Text>
        </View>
      </View>

      {/* INFO SECTION */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>💡 {t('howItWorks') || 'How It Works'}</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>1. {t('chooseDuration') || 'Choose Duration'}}:</Text> {t('selectHowManyDays') || 'Select how many days you want to prepay for.'}
          </Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>2. {{t('reviewPrice') || 'Review Price'}}:</Text> {t('seeYourTotalCost') || 'See your total cost at our current daily rate.'}
          </Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>3. {{t('sendMpesa') || 'Send M-Pesa'}}:</Text> {{t('sendPaymentVia') || 'Send payment via M-Pesa to our number.'}}
          </Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>4. {{t('submitCode') || 'Submit Code'}}:</Text> {{t('enterMpesaCode') || 'Enter your M-Pesa confirmation code and you are done!'}}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    padding: 20
  },

  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 20
  },

  criticalErrorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },

  criticalErrorText: {
    fontSize: 12,
    color: '#a5312c',
    fontWeight: '600',
    flex: 1
  },

  dismissText: {
    fontSize: 11,
    color: '#a5312c',
    fontWeight: '700',
    marginLeft: 12
  },

  infoBanner: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    flexDirection: 'row',
    gap: 12
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

  selectorCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#e7e4db'
  },

  selectorLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 20,
    textAlign: 'center'
  },

  daysDisplay: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 20,
    backgroundColor: '#fff8f0',
    borderRadius: 12
  },

  daysNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: '#ff7a1a',
    lineHeight: 52
  },

  daysLabel: {
    fontSize: 16,
    color: '#5b606c',
    marginTop: 4
  },

  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12
  },

  slider: {
    flex: 1,
    height: 40
  },

  rangeLabel: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '600',
    minWidth: 30
  },

  quickSelectContainer: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap'
  },

  quickSelectBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    backgroundColor: '#fff',
    flex: 1,
    minWidth: '48%'
  },

  quickSelectBtnActive: {
    backgroundColor: '#ff7a1a',
    borderColor: '#ff7a1a'
  },

  quickSelectBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5b606c',
    textAlign: 'center'
  },

  quickSelectBtnTextActive: {
    color: '#fff'
  },

  pricingCard: {
    backgroundColor: '#fff8f0',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ffb366',
    padding: 16,
    marginBottom: 20
  },

  pricingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 16
  },

  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10
  },

  pricingRowHighlight: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ffb366'
  },

  pricingLabel: {
    fontSize: 14,
    color: '#5b606c',
    fontWeight: '500'
  },

  pricingLabelHighlight: {
    fontSize: 14,
    color: '#ff7a1a',
    fontWeight: '700'
  },

  pricingValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1c20'
  },

  pricingAmountHighlight: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ff7a1a'
  },

  pricingFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ffb366'
  },

  pricingFooterText: {
    fontSize: 12,
    color: '#5b606c',
    fontStyle: 'italic',
    textAlign: 'center'
  },

  featuresCard: {
    backgroundColor: '#e8f5e9',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#a5d6a7',
    padding: 16,
    marginBottom: 20
  },

  featuresTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2e7d32',
    marginBottom: 16
  },

  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12
  },

  featureIcon: {
    fontSize: 20
  },

  featureText: {
    flex: 1,
    fontSize: 13,
    color: '#1a1c20',
    lineHeight: 18
  },

  infoSection: {
    marginBottom: 20
  },

  infoTitle: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 10
  },

  infoCard: {
    backgroundColor: '#e3f2fd',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2'
  },

  infoText: {
    fontSize: 12,
    color: '#1a1c20',
    lineHeight: 16
  },

  infoBold: {
    fontWeight: '700'
  }
});

export default PrepaymentScreen;
