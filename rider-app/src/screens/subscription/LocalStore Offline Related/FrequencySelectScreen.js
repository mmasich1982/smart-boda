// rider-app/src/screens/subscription/FrequencySelectScreen.js
// ✅ OFFLINE FIRST - Bi-Weekly (KSh 500) and Monthly (KSh 1,000) ONLY
// Following fuel screen pattern with local cache and silent sync

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
import { AppContext } from '../../context/AppContext';
import LocalStore from '../../offline/LocalStore';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';

const FrequencySelectScreen = ({ navigation, route }) => {
  const { state } = useContext(AppContext);
  const { isRenewal } = route.params || {};
  
  const [selectedFrequency, setSelectedFrequency] = useState('biweekly');
  const [pricingData, setPricingData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  const riderId = state?.riderId;

  // ✅ REVISED: Only two frequencies
  const FREQUENCIES = [
    {
      key: 'biweekly',
      label: 'Bi-Weekly',
      emoji: '🗓️',
      days: 14,
      price: 500
    },
    {
      key: 'monthly',
      label: 'Monthly',
      emoji: '🌙',
      days: 30,
      price: 1000
    }
  ];

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
            
            // Cache it
            LocalStore.set(
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
      showCriticalError('Failed to load pricing data', 'data_load');
    } finally {
      setLoading(false);
    }
  };

  const loadPricingFromCache = () => {
    try {
      const cached = LocalStore.get(`pricing_config_${riderId}`);
      if (cached) {
        const data = JSON.parse(cached);
        setPricingData(data);
        console.log('✅ Loaded pricing from cache');
      } else {
        // Use defaults if no cache
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
  // Handle Frequency Selection & Continue
  // ========================================================================
  
  const handleContinue = () => {
    if (!selectedFrequency) {
      showCriticalError('Please select a frequency', 'validation');
      return;
    }

    clearCriticalError();
    
    const selectedFreq = FREQUENCIES.find(f => f.key === selectedFrequency);
    const price = selectedFrequency === 'biweekly' 
      ? (pricingData?.biweekly_price || 500)
      : (pricingData?.monthly_price || 1000);

    navigation.navigate('ConfirmSubscription', {
      frequency: selectedFrequency,
      label: selectedFreq.label,
      days: selectedFreq.days,
      price: price,
      isRenewal: isRenewal
    });
  };

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label="← Back" />
        <Text style={styles.title}>Choose Your Plan</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  if (loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label="← Back" />
        <Text style={styles.title}>Choose Your Plan</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      <BackLink onPress={() => navigation.goBack()} label="← Back" />
      <Text style={styles.title}>Choose Your Plan</Text>

      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.subtitle}>
        {isRenewal ? 'Renew your subscription' : 'Start your paid subscription'}
      </Text>

      {/* FREQUENCY CARDS */}
      <View style={styles.frequencyContainer}>
        {FREQUENCIES.map((freq) => {
          const isSelected = selectedFrequency === freq.key;
          const price = freq.key === 'biweekly' 
            ? (pricingData?.biweekly_price || 500)
            : (pricingData?.monthly_price || 1000);

          return (
            <TouchableOpacity
              key={freq.key}
              style={[
                styles.frequencyCard,
                isSelected && styles.frequencyCardSelected
              ]}
              onPress={() => {
                setSelectedFrequency(freq.key);
                clearCriticalError();
              }}
            >
              <View style={styles.frequencyHeader}>
                <Text style={styles.frequencyEmoji}>{freq.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.frequencyLabel}>{freq.label}</Text>
                  <Text style={styles.frequencyDays}>{freq.days} days</Text>
                </View>
                <View style={[
                  styles.radioButton,
                  isSelected && styles.radioButtonSelected
                ]}>
                  {isSelected && <Text style={styles.radioButtonDot}>●</Text>}
                </View>
              </View>

              <View style={styles.frequencyPricing}>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Price</Text>
                  <Text style={styles.priceAmount}>KSh {price}</Text>
                </View>
                <Text style={styles.pricePerDay}>
                  ≈ KSh {(price / freq.days).toFixed(0)}/day
                </Text>
              </View>

              {isSelected && (
                <View style={styles.selectedCheckmark}>
                  <Text style={styles.checkmark}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* INFO BANNER */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoText}>
          Payment will be via M-Pesa. Longer plans offer better daily value.
        </Text>
      </View>

      {/* CONTINUE BUTTON */}
      <TouchableOpacity
        style={styles.continueBtn}
        onPress={handleContinue}
      >
        <Text style={styles.continueBtnText}>Continue →</Text>
      </TouchableOpacity>
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
    marginBottom: 8
  },
  subtitle: {
    fontSize: 14,
    color: '#5b606c',
    marginBottom: 20,
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

  frequencyContainer: {
    gap: 12,
    marginBottom: 24
  },

  frequencyCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#e7e4db',
    padding: 16,
    overflow: 'hidden'
  },
  frequencyCardSelected: {
    backgroundColor: '#fff8f0',
    borderColor: '#ff7a1a'
  },

  frequencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  frequencyEmoji: {
    fontSize: 28,
    marginRight: 12
  },
  frequencyLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20'
  },
  frequencyDays: {
    fontSize: 12,
    color: '#5b606c',
    marginTop: 2
  },

  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e7e4db',
    justifyContent: 'center',
    alignItems: 'center'
  },
  radioButtonSelected: {
    borderColor: '#ff7a1a',
    backgroundColor: '#ff7a1a'
  },
  radioButtonDot: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold'
  },

  frequencyPricing: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e7e4db'
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  priceLabel: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '600'
  },
  priceAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ff7a1a'
  },
  pricePerDay: {
    fontSize: 11,
    color: '#5b606c',
    fontStyle: 'italic'
  },

  selectedCheckmark: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ff7a1a',
    justifyContent: 'center',
    alignItems: 'center'
  },
  checkmark: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff'
  },

  infoBanner: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20
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

  continueBtn: {
    backgroundColor: '#ff7a1a',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.02
  }
});

export default FrequencySelectScreen;
