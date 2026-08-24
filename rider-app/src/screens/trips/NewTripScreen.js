// rider-app/src/screens/trips/NewTripScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Silent sync, clean UI, immediate feedback
// ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
// ✅ NETWORK AWARE: Real-time connectivity detection
// ✅ PROVEN PATTERN: Follows FuelEntryScreen/BatteryEntryScreen approach
// ✅ FIXED: Removed blocking isInitialized check and undefined error variable

import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';

const PAYMENT_METHODS = [
  { key: 'Cash', label: 'Cash', emoji: '💵' },
  { key: 'MPesa', label: 'M-Pesa', emoji: '📲' },
  { key: 'LipaLater', label: 'Lipa Later', emoji: '🕒' },
];

export default function NewTripScreen({ navigation }) {
  const { state, dispatch } = useRider();
  const { t } = useTranslation();
  
  const [amount, setAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [hoveredKey, setHoveredKey] = useState(null);
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [riderIdError, setRiderIdError] = useState(false);

  const { isConnected } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ FIXED: Load rider ID on mount with proper error handling
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ NewTrip: Loaded rider ID:', id);
          setRiderIdError(false);
        } else {
          console.warn('⚠️ No rider ID found in local storage');
          setRiderIdError(true);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
        setRiderIdError(true);
      } finally {
        setLoading(false);
      }
    };
    
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  /**
   * ✅ UPDATE CACHE: Add new trip to daily trips cache
   * This ensures DailyTradeSummaryScreen and HeroFareCard display the trip immediately
   * Uses IndexedDB for persistent local-first storage
   */
  const updateTripsCache = async (offlineRecord) => {
    try {
      const cacheKey = `trips_today_${effectiveRiderId}`;
      
      // Get existing cache from IndexedDB
      const cachedData = await indexedDbAdapter.kvGet(cacheKey);
      let items = [];
      
      if (cachedData) {
        try {
          items = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
          if (!Array.isArray(items)) items = [];
        } catch (parseErr) {
          console.warn('⚠️ Cache parse error, starting fresh');
          items = [];
        }
      }
      
      // Add new trip to front (most recent first)
      items.unshift(offlineRecord);
      
      // Save updated cache to IndexedDB
      await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(items));
      console.log(`✅ Updated trips_today cache with new trip`);
    } catch (err) {
      console.error('❌ Error updating cache:', err);
    }
  };

  const handleKeypadPress = (digit) => {
    if (digit === 'back') {
      setAmount(amount.slice(0, -1));
    } else if (digit === '.') {
      if (!amount.includes('.') && amount) {
        setAmount(amount + digit);
      }
    } else {
      if (amount.length < 10) {
        setAmount(amount + digit);
      }
    }
  };

  const handlePaymentMethodSelect = (methodKey) => {
    if (methodKey === 'LipaLater') {
      const amtValue = parseFloat(amount);
      if (!amount || amtValue <= 0) {
        Alert.alert('Error', 'Enter the fare amount first, then choose Lipa Later.');
        return;
      }
      dispatch({ type: 'CLEAR_LIPA_LATER_DRAFT' });
      navigation.navigate('LipaLaterEntry', { amount });
      return;
    }
    setSelectedMethod(methodKey);
  };

  const handleSaveTrip = async () => {
    try {
      // Validation
      const amtValue = parseFloat(amount);
      if (!amount || amtValue <= 0) {
        showCriticalError(
          t('validationError_fareAmountRequired') || 'A trip needs a fare amount greater than zero.',
          'validation'
        );
        return;
      }

      if (!selectedMethod) {
        showCriticalError(
          t('validationError_paymentMethodRequired') || 'Select a payment method to continue.',
          'validation'
        );
        return;
      }

      if (!effectiveRiderId) {
        showCriticalError(
          t('authError_riderIdNotAvailable') || 'Rider information not available. Please return to Home.',
          'auth'
        );
        console.error('❌ No effective rider ID');
        return;
      }

      setSaving(true);
      clearCriticalError();
      setSuccessMessage('');

      const payload = {
        amount: amtValue,
        payment_channel_code: selectedMethod,
        note: '',
        recorded_at: new Date().toISOString(),
      };

      const recordId = `trip_${effectiveRiderId}_${Date.now()}`;
      const offlineRecord = {
        id: recordId,
        rider_id: effectiveRiderId,
        amount: amtValue,
        paymentMethod: selectedMethod,
        method: selectedMethod,
        note: '',
        timestamp: Date.now(),
        ts: Date.now(),
        status: 'active',
        syncStatus: 'pending'
      };

      console.log('💾 Saving trip entry:', { recordId, riderId: effectiveRiderId, amount: amtValue });

      // ✅ ALWAYS save locally first using IndexedDB
      await indexedDbAdapter.kvSet(
        `trip_entry_${recordId}`,
        JSON.stringify(offlineRecord)
      );

      // Update cache immediately for instant UI feedback
      await updateTripsCache(offlineRecord);

      // Add to sync queue for background sync
      const queueSuccess = await addToSyncQueue({
        id: recordId,
        type: 'trip_entry',
        endpoint: `/trips?rider_id=${effectiveRiderId}`,
        data: payload,
        timestamp: new Date(),
      });

      if (!queueSuccess) {
        console.warn('⚠️ Failed to add to queue, but local save succeeded');
      }

      // Try to sync immediately only if online
      if (isConnected) {
        try {
          console.log('📡 Attempting to sync to API...');
          const response = await api.post(
            `/trips?rider_id=${effectiveRiderId}`,
            payload
          );

          if (response.status === 200 || response.status === 201) {
            console.log('✅ Synced successfully to API');
            // Success - show brief confirmation
            setSuccessMessage(t('success_tripRecorded') || `Trip saved! Today's total: KSh ${amtValue.toLocaleString()}.`);
            
            // Reset form and navigate after brief success message
            setTimeout(() => {
              setAmount('');
              setSelectedMethod(null);
              navigation.navigate('Home', { refreshFare: true });
            }, 800);
            return;
          }
        } catch (apiErr) {
          console.warn('⚠️ API sync failed (will retry later):', {
            status: apiErr.response?.status,
            message: apiErr.message,
          });
          // API failed but data is saved and queued - that's okay
        }
      }

      // Either offline or API sync failed - but data is safely stored
      // Show success and navigate
      setSuccessMessage(t('success_tripSaving') || 'Trip saved. Syncing...');
      
      setTimeout(() => {
        setAmount('');
        setSelectedMethod(null);
        navigation.navigate('Home', { refreshFare: true });
      }, 800);

    } catch (err) {
      console.error('❌ Save error:', err);
      showCriticalError(
        err.response?.data?.detail || t('error_saveFailed') || 'Failed to save trip. Please try again.',
        'save_error'
      );
    } finally {
      setSaving(false);
    }
  };

  // ✅ FIXED: Only show loading spinner if still loading, not if missing riderId
  if (loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Home'} />
        <Text style={styles.title}>New Trip</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  // ✅ FIXED: Show error state if rider ID couldn't be loaded after initial loading
  if (riderIdError || !effectiveRiderId) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Home'} />
        <Text style={styles.title}>New Trip</Text>
        
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>
            ⚠️ Unable to load rider information. Please return to Home and try again.
          </Text>
        </View>
        
        <TouchableOpacity 
          style={styles.primaryBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.primaryBtnText}>← Back to Home</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Home'} />
      
      {/* Smart Boda Branding Header */}
      <View style={styles.brandingHeader}>
        <View style={styles.brandingContent}>
          <Text style={styles.brandingEmoji}>🏍️</Text>
          <View style={styles.brandingText}>
            <Text style={styles.brandingTitle}>Smart Boda</Text>
            <Text style={styles.brandingSubtitle}>Track every trip</Text>
          </View>
        </View>
      </View>

      <Text style={styles.title}>New Trip</Text>

      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {successMessage && (
        <View style={styles.successBanner}>
          <Text style={styles.successBannerText}>✓ {successMessage}</Text>
        </View>
      )}

      {/* Amount Display */}
      <View style={styles.amountDisplay}>
        <Text style={styles.amountCurrency}>KSh</Text>
        <Text style={styles.amountValue}>
          {amount || '0'}
        </Text>
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {[
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
          ['.', '0', 'back'],
        ].map((row, rowIdx) =>
          row.map((digit) => (
            <TouchableOpacity
              key={`${rowIdx}-${digit}`}
              style={[
                styles.keypadButton,
                hoveredKey === digit && styles.keypadButtonHovered,
              ]}
              onPress={() => handleKeypadPress(digit)}
              onMouseEnter={() => setHoveredKey(digit)}
              onMouseLeave={() => setHoveredKey(null)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.keypadButtonText,
                hoveredKey === digit && styles.keypadButtonTextHovered,
              ]}>
                {digit === 'back' ? '⌫' : digit}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Payment Method Selection */}
      <Text style={styles.methodLabel}>
        Payment Method <Text style={styles.requiredStar}>*</Text>
      </Text>
      <View style={styles.paymentGrid}>
        {PAYMENT_METHODS.map((method) => (
          <TouchableOpacity
            key={method.key}
            style={[
              styles.channelTile,
              selectedMethod === method.key && styles.channelTileSelected,
            ]}
            onPress={() => handlePaymentMethodSelect(method.key)}
            activeOpacity={0.7}
          >
            <Text style={styles.channelLabel}>{method.emoji} {method.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[
          styles.primaryBtn,
          (saving || !amount || !selectedMethod) && styles.primaryBtnDisabled,
        ]}
        onPress={handleSaveTrip}
        disabled={saving || !amount || !selectedMethod}
        activeOpacity={0.8}
      >
        <View style={styles.btnContent}>
          {saving && (
            <ActivityIndicator 
              size="small" 
              color="#fff" 
              style={styles.btnSpinner}
            />
          )}
          <Text style={styles.primaryBtnText}>
            {saving 
              ? (t('saving') || 'Saving...') 
              : (t('saveTripButton') || 'Save Trip →')
            }
          </Text>
        </View>
      </TouchableOpacity>

      {/* Offline Hint */}
      <Text style={styles.hint}>Works fully offline — saved instantly either way.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 22,
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

  successBanner: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1.5,
    borderColor: '#a5d6a7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16
  },
  successBannerText: {
    fontSize: 12,
    color: '#2e7d32',
    fontWeight: '600'
  },

  brandingHeader: {
    marginBottom: 20,
    paddingHorizontal: 0,
  },
  brandingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandingEmoji: {
    fontSize: 28,
  },
  brandingText: {
    flex: 1,
  },
  brandingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
  },
  brandingSubtitle: {
    fontSize: 12,
    color: '#5b606c',
    marginTop: 2,
  },
  amountDisplay: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderRadius: 14,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountCurrency: {
    fontSize: 12,
    color: '#5b606c',
    marginBottom: 8,
  },
  amountValue: {
    fontFamily: 'Space Grotesk',
    fontSize: 48,
    fontWeight: '700',
    color: '#1a1c20',
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  keypadButton: {
    width: '31%',
    aspectRatio: 1.2,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadButtonHovered: {
    backgroundColor: '#ffebd9',
    borderColor: '#ff7a1a',
    borderWidth: 2,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  keypadButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
  },
  keypadButtonTextHovered: {
    color: '#ff7a1a',
    fontWeight: '800',
  },
  methodLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    color: '#5b606c',
    marginBottom: 7,
  },
  requiredStar: {
    color: '#e5650a',
  },
  paymentGrid: {
    gap: 9,
    marginBottom: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  channelTile: {
    flex: 1,
    minWidth: '30%',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 13,
    paddingVertical: 11,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelTileSelected: {
    borderColor: '#ff7a1a',
    backgroundColor: '#fff6ee',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  channelLabel: {
    fontWeight: '700',
    fontSize: 12.5,
    color: '#1a1c20',
    textAlign: 'center',
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
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnSpinner: {
    marginRight: 10
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.02
  },
  hint: {
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 20,
    fontSize: 12,
    color: '#5b606c',
  },
});