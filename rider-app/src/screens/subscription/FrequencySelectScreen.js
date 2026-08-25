// rider-app/src/screens/subscription/FrequencySelectScreen.js
// ============================================================================
// ✅ FIXED: Dependency Management & Infinite Loop Resolution
// ✅ MIGRATION: LocalStore → IndexedDBAdapter
// ✅ ONLY: Bi-Weekly (500 KES) and Monthly (1000 KES)
// ============================================================================
// CRITICAL FIXES:
// 1. Removed loadCurrentFrequency from useFocusEffect dependencies
// 2. Used refs to track rider ID and initialization state
// 3. Separated concerns: data loading logic from lifecycle hooks
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useRider } from '../../rider/RiderContext';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import api from '../../api/client';

const FrequencySelectScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { state } = useRider();
  const riderId = state?.riderId;

  // ========================================================================
  // STATE
  // ========================================================================
  const [selectedFrequency, setSelectedFrequency] = useState('biweekly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ========================================================================
  // CONTROL MECHANISMS
  // ========================================================================
  const hasLoadedRef = useRef(false);
  const isMountedRef = useRef(true);
  const riderIdRef = useRef(riderId); // Track rider ID in ref

  // Update rider ID ref when it changes
  useEffect(() => {
    riderIdRef.current = riderId;
  }, [riderId]);

  // ✅ ONLY TWO PLANS
  const FREQUENCIES = [
    {
      key: 'biweekly',
      label: t('subscription.biweekly_plan'),
      emoji: '📆',
      days: 14,
      price: 500,
      pricePerDay: 35.71
    },
    {
      key: 'monthly',
      label: t('subscription.monthly_plan'),
      emoji: '📆',
      days: 30,
      price: 1000,
      pricePerDay: 33.33
    }
  ];

  // ========================================================================
  // LOAD CURRENT FREQUENCY
  // ========================================================================
  // ✅ FIXED: This function does NOT depend on riderId directly
  // It uses riderIdRef which is stable
  const loadCurrentFrequency = useCallback(async () => {
    if (!riderIdRef.current || !isMountedRef.current) {
      console.log('⚠️ Skip load: no riderId or component unmounted');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Try API first
      try {
        console.log('📡 Loading frequency from API...');
        const response = await api.get('/subscription', {
          params: { rider_id: riderIdRef.current }
        });

        if (response?.data?.subscription?.frequency) {
          const freq = response.data.subscription.frequency;
          if (['biweekly', 'monthly'].includes(freq)) {
            if (isMountedRef.current) {
              setSelectedFrequency(freq);
            }
            return; // Success, exit
          }
        }
      } catch (apiErr) {
        console.warn('⚠️ API load failed:', apiErr.message);
      }

      // Fallback to cache
      if (!isMountedRef.current) return;

      try {
        console.log('📂 Loading frequency from cache...');
        const cached = await indexedDbAdapter.kvGet(
          `subscription_${riderIdRef.current}`
        );
        if (cached) {
          const { data } = JSON.parse(cached);
          if (data?.frequency && ['biweekly', 'monthly'].includes(data.frequency)) {
            if (isMountedRef.current) {
              setSelectedFrequency(data.frequency);
            }
          }
        }
      } catch (cacheErr) {
        console.warn('⚠️ Cache load failed:', cacheErr.message);
      }
    } catch (err) {
      console.error('❌ Error loading frequency:', err);
      if (isMountedRef.current) {
        setError('error_loading');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []); // ✅ FIXED: Empty dependency array - uses riderIdRef instead

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

  // ✅ FIXED: Reset loaded flag when rider ID changes
  useEffect(() => {
    hasLoadedRef.current = false;
  }, [riderId]);

  // ✅ FIXED: Load on screen focus without infinite loop dependency
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current && riderIdRef.current) {
        console.log('📌 Screen focused, loading frequency...');
        hasLoadedRef.current = true;
        loadCurrentFrequency();
      }

      return () => {
        // Don't reset on unfocus - keep loaded state
      };
    }, [loadCurrentFrequency]) // loadCurrentFrequency is now stable
  );

  // ========================================================================
  // HANDLE CONTINUE
  // ========================================================================

  const handleContinue = () => {
    if (!selectedFrequency) {
      setError('select_frequency');
      return;
    }

    const selectedFreq = FREQUENCIES.find(f => f.key === selectedFrequency);

    navigation.navigate('ConfirmSubscriptionScreen', {
      frequency: selectedFrequency,
      label: selectedFreq.label,
      days: selectedFreq.days,
      price: selectedFreq.price,
      isRenewal: state?.subscription?.has_ever_paid || false
    });
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 60 }}
    >
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backLink}
      >
        <Text style={styles.backLinkText}>← {t('common.back')}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{t('subscription.select_frequency')}</Text>
      <Text style={styles.subtitle}>
        {t('subscription.choose_payment_plan')}
      </Text>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>
            {t(`common.${error}`)}
          </Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Text style={styles.dismissText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* FREQUENCY CARDS */}
      <View style={styles.frequencyContainer}>
        {FREQUENCIES.map((freq) => {
          const isSelected = selectedFrequency === freq.key;

          return (
            <TouchableOpacity
              key={freq.key}
              style={[
                styles.frequencyCard,
                isSelected && styles.frequencyCardSelected
              ]}
              onPress={() => {
                setSelectedFrequency(freq.key);
                setError(null);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.frequencyHeader}>
                <Text style={styles.frequencyEmoji}>{freq.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.frequencyLabel}>{freq.label}</Text>
                  <Text style={styles.frequencyDays}>
                    {freq.days} {t('common.days')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radioButton,
                    isSelected && styles.radioButtonSelected
                  ]}
                >
                  {isSelected && (
                    <Text style={styles.radioButtonDot}>●</Text>
                  )}
                </View>
              </View>

              <View style={styles.frequencyPricing}>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>
                    {t('subscription.amount')}
                  </Text>
                  <Text style={styles.priceAmount}>
                    KES {freq.price.toLocaleString()}
                  </Text>
                </View>
                <Text style={styles.pricePerDay}>
                  ≈ KES {freq.pricePerDay.toFixed(2)}/{t('common.day')}
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
          {t('subscription.payment_via_mpesa')}
        </Text>
      </View>

      {/* CONTINUE BUTTON */}
      <TouchableOpacity
        style={styles.continueBtn}
        onPress={handleContinue}
      >
        <Text style={styles.continueBtnText}>
          {t('common.continue')} →
        </Text>
      </TouchableOpacity>
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
    backgroundColor: '#f6f4ef'
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
    marginBottom: 6
  },
  subtitle: {
    fontSize: 13,
    color: '#5b606c',
    marginBottom: 16,
    lineHeight: 18
  },

  errorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  errorText: {
    fontSize: 12,
    color: '#a5312c',
    fontWeight: '600',
    flex: 1
  },
  dismissText: {
    fontSize: 16,
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
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e7e4db',
    padding: 14,
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
    fontSize: 24,
    marginRight: 12
  },
  frequencyLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1c20'
  },
  frequencyDays: {
    fontSize: 12,
    color: '#5b606c',
    marginTop: 2
  },

  radioButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
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
    fontSize: 11,
    color: '#fff',
    fontWeight: 'bold'
  },

  frequencyPricing: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e7e4db'
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  priceLabel: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '600'
  },
  priceAmount: {
    fontSize: 16,
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
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ff7a1a',
    justifyContent: 'center',
    alignItems: 'center'
  },
  checkmark: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff'
  },

  infoBanner: {
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    flexDirection: 'row',
    gap: 10,
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
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2
  }
});

export default FrequencySelectScreen;