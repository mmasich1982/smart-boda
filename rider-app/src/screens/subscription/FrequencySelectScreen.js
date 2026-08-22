// rider-app/src/screens/subscription/FrequencySelectScreen.js
// ✅ HYBRID SYNC ARCHITECTURE:
// - Localization Provider for multilingual support
// - Network Status hooks for real-time connectivity detection
// - IndexedDB Adapter for offline-first persistent storage
// - Bi-Weekly (KSh 500) and Monthly (KSh 1,000) ONLY
// - Offline-first with local cache and silent sync
// - UI/UX design preserved exactly

import React, { useState, useEffect, useContext } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';

const FrequencySelectScreen = ({ navigation, route }) => {
  const { state } = useRider();
  const { t } = useTranslation();
  const { isRenewal } = route.params || {};
  
  const [selectedFrequency, setSelectedFrequency] = useState('biweekly');
  const [pricingData, setPricingData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  const riderId = state?.riderId;

  // ✅ FREQUENCIES: Bi-Weekly and Monthly ONLY
  const FREQUENCIES = [
    {
      key: 'biweekly',
      label: t('biweekly') || 'Bi-Weekly',
      emoji: '🗓️',
      days: 14,
      price: 500,
      description: t('biweeklyDesc') || 'Perfect for regular users'
    },
    {
      key: 'monthly',
      label: t('monthly') || 'Monthly',
      emoji: '🌙',
      days: 30,
      price: 1000,
      description: t('monthlyDesc') || 'Best value subscription'
    }
  ];

  // ✅ LOAD PRICING DATA FROM INDEXEDDB WITH API FALLBACK
  useEffect(() => {
    async function loadPricingData() {
      const cacheKey = 'subscription_pricing';
      
      try {
        // 1. Load from IndexedDB cache immediately
        const cached = await indexedDbAdapter.kvGet(cacheKey);
        if (cached) {
          const parsedPricing = typeof cached === 'string' ? JSON.parse(cached) : cached;
          setPricingData(parsedPricing);
          console.log('✅ Loaded pricing from IndexedDB cache');
        }

        // 2. Fetch fresh pricing from API if online
        if (isConnected && isInitialized) {
          try {
            const res = await api.get('/subscription/pricing');
            const freshPricing = res.data?.pricing || {};
            setPricingData(freshPricing);
            // 3. Cache the fresh data in IndexedDB
            await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(freshPricing));
            console.log('✅ Updated pricing cache from API');
          } catch (apiErr) {
            console.log('⚠️ Pricing API unavailable, using cached data');
          }
        }
      } catch (err) {
        console.error('Error loading pricing:', err);
      } finally {
        setLoading(false);
      }
    }

    loadPricingData();
  }, [isConnected, isInitialized]);

  const getFrequencyData = (key) => {
    return FREQUENCIES.find((freq) => freq.key === key);
  };

  const handleSelectFrequency = async (frequency) => {
    clearCriticalError();

    if (!riderId) {
      showCriticalError(
        t('error_riderIdNotAvailable') || 'Rider ID not available. Please restart the app.',
        'auth'
      );
      return;
    }

    const frequencyData = getFrequencyData(frequency);
    
    // Store frequency selection in IndexedDB for cache
    try {
      const cacheKey = `selected_frequency_${riderId}`;
      await indexedDbAdapter.kvSet(cacheKey, JSON.stringify({
        frequency: frequency,
        selected_at: new Date().toISOString(),
      }));
      console.log('✅ Saved frequency selection to cache');
    } catch (err) {
      console.warn('⚠️ Failed to cache frequency selection:', err);
    }

    // Navigate to confirmation screen
    navigation.navigate('ConfirmSubscription', {
      frequency: frequency,
      label: frequencyData?.label,
      days: frequencyData?.days,
      price: frequencyData?.price,
      isRenewal: isRenewal
    });
  };

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('selectPlan') || 'Select Plan'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
      <Text style={styles.title}>
        {isRenewal ? (t('renewSubscription') || 'Renew Subscription') : (t('selectPlan') || 'Select Plan')}
      </Text>
      <Text style={styles.subtitle}>
        {t('subscriptionSubtitle') || 'Choose a plan that works best for you'}
      </Text>

      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* FREQUENCY CARDS */}
      {FREQUENCIES.map((frequency) => (
        <TouchableOpacity
          key={frequency.key}
          style={[
            styles.frequencyCard,
            selectedFrequency === frequency.key && styles.frequencyCardSelected
          ]}
          onPress={() => setSelectedFrequency(frequency.key)}
          activeOpacity={0.8}
        >
          {/* SELECTION INDICATOR */}
          <View
            style={[
              styles.selectionCircle,
              selectedFrequency === frequency.key && styles.selectionCircleSelected
            ]}
          >
            {selectedFrequency === frequency.key && (
              <Text style={styles.selectionCheckmark}>✓</Text>
            )}
          </View>

          {/* CONTENT */}
          <View style={styles.frequencyContent}>
            <View style={styles.frequencyHeader}>
              <Text style={styles.frequencyEmoji}>{frequency.emoji}</Text>
              <View style={styles.frequencyInfo}>
                <Text style={styles.frequencyLabel}>{frequency.label}</Text>
                <Text style={styles.frequencyDesc}>{frequency.description}</Text>
              </View>
            </View>

            <View style={styles.frequencyPrice}>
              <Text style={styles.priceAmount}>KSh {frequency.price}</Text>
              <Text style={styles.pricePeriod}>
                / {frequency.days} {t('days') || 'days'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}

      {/* BENEFITS SECTION */}
      <View style={styles.benefitsSection}>
        <Text style={styles.benefitsTitle}>{t('subscriptionBenefits') || 'Subscription Benefits'}</Text>
        
        <View style={styles.benefitItem}>
          <Text style={styles.benefitCheck}>✓</Text>
          <Text style={styles.benefitText}>{t('benefit_unlimitedTrips') || 'Unlimited trip recordings'}</Text>
        </View>

        <View style={styles.benefitItem}>
          <Text style={styles.benefitCheck}>✓</Text>
          <Text style={styles.benefitText}>{t('benefit_prioritySupport') || 'Priority customer support'}</Text>
        </View>

        <View style={styles.benefitItem}>
          <Text style={styles.benefitCheck}>✓</Text>
          <Text style={styles.benefitText}>{t('benefit_advancedReports') || 'Advanced financial reports'}</Text>
        </View>

        <View style={styles.benefitItem}>
          <Text style={styles.benefitCheck}>✓</Text>
          <Text style={styles.benefitText}>{t('benefit_noAds') || 'Ad-free experience'}</Text>
        </View>
      </View>

      {/* INFO BANNER */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoText}>
          {t('info_subscriptionRenewal') || 'Your subscription will auto-renew on the same day each period unless you cancel.'}
        </Text>
      </View>

      {/* CONTINUE BUTTON */}
      <TouchableOpacity
        style={[
          styles.primaryBtn,
          !selectedFrequency && styles.primaryBtnDisabled
        ]}
        onPress={() => {
          if (selectedFrequency) {
            handleSelectFrequency(selectedFrequency);
          }
        }}
        disabled={!selectedFrequency}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryBtnText}>
          {t('continueButton') || 'Continue →'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f6f4ef'
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 13,
    color: '#5b606c',
    marginBottom: 24,
    lineHeight: 20
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

  frequencyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e7e4db',
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center'
  },
  frequencyCardSelected: {
    borderColor: '#ff7a1a',
    backgroundColor: '#fff8f0'
  },

  selectionCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e7e4db',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14
  },
  selectionCircleSelected: {
    borderColor: '#ff7a1a',
    backgroundColor: '#ff7a1a'
  },
  selectionCheckmark: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12
  },

  frequencyContent: {
    flex: 1
  },
  frequencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  frequencyEmoji: {
    fontSize: 24,
    marginRight: 12
  },
  frequencyInfo: {
    flex: 1
  },
  frequencyLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 2
  },
  frequencyDesc: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '400'
  },

  frequencyPrice: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2
  },
  priceAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ff7a1a'
  },
  pricePeriod: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '500'
  },

  benefitsSection: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 16,
    marginBottom: 20
  },
  benefitsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12
  },

  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ece5'
  },
  benefitCheck: {
    fontSize: 16,
    color: '#1e9e6f',
    fontWeight: '700',
    marginRight: 10
  },
  benefitText: {
    fontSize: 12,
    color: '#1a1c20',
    fontWeight: '500',
    flex: 1,
    lineHeight: 16
  },

  infoBanner: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
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
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },
  primaryBtnDisabled: {
    backgroundColor: '#e9dccc',
    shadowOpacity: 0
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.02
  }
});

export default FrequencySelectScreen;
