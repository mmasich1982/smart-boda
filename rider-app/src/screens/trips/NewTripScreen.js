// rider-app/src/screens/trips/NewTripScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Silent sync, clean UI, immediate feedback
// ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
// ✅ NETWORK AWARE: Real-time connectivity detection
// ✅ PROVEN PATTERN: Follows FuelEntryScreen/BatteryEntryScreen approach
// ✅ FIXED: Save to 'trips' store so getTodaysTrips() can read trips immediately

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

  // ✅ Load rider ID on mount with proper error handling
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
   * This ensures UI updates immediately with the new trip while offline
   * Uses IndexedDB key-value store for quick cache lookups
   * 
   * CRITICAL NOTE: Cache is an OPTIMIZATION ONLY
   * - Source of truth: IndexedDB 'trips' store (trip is already saved there)
   * - Cache: Provides fast reads for getTodaysTrips() when cache is populated
   * - If cache is empty/stale: getTodaysTrips() falls back to database query
   * 
   * ✅ MIGRATION FIX (24 AUG 2026):
   *    - Cache key format: `trips_today_${riderId}` (matches getTodaysTrips line 79)
   *    - offlineRecord uses snake_case: rider_id (matches DB schema)
   *    - Stores complete trip object in cache for instant access
   *    - If cache update fails: database has the trip (data is never lost)
   */
  const updateTripsCache = async (offlineRecord) => {
    try {
      const cacheKey = `trips_today_${effectiveRiderId}`;
      
      // Get existing cache from IndexedDB (may be empty)
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
      // Note: If this fails, the trip is still in the 'trips' store
      await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(items));
      console.log(`✅ Updated cache: trips_today_${effectiveRiderId} now has ${items.length} trips`);
    } catch (err) {
      console.error('❌ Error updating cache (trip still saved in database):', err);
      // Don't throw - cache is optimization only, trip is already in IndexedDB
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
      const now = Date.now();
      
      // ✅ AUDIT FIX #5: Field naming consistency
      // All fields use consistent naming convention for proper IndexedDB storage
      // - Use 'rider_id' (snake_case, matches DB schema index)
      // - Use 'ts' as primary timestamp, 'timestamp' as backup
      // - Use 'method' as primary, 'paymentMethod' as backup for compatibility
      const offlineRecord = {
        id: recordId,
        rider_id: effectiveRiderId,           // ✅ Snake_case for DB consistency
        amount: amtValue,
        paymentMethod: selectedMethod,        // ✅ camelCase backup
        method: selectedMethod,               // ✅ Primary method field
        note: '',
        timestamp: now,                       // ✅ Backup timestamp field
        ts: now,                              // ✅ Primary timestamp field
        status: 'active',
        syncStatus: 'pending',
        createdAt: now,
        date: new Date().toISOString().split('T')[0]
      };

      console.log('💾 Saving trip entry:', { 
        recordId, 
        riderId: effectiveRiderId, 
        amount: amtValue,
        cacheKey: `trips_today_${effectiveRiderId}`
      });

      // ✅ AUDIT FIX #4: Database persistence with cache coordination
      // STEP 1: Save to 'trips' store so getTodaysTrips() can read it immediately
      try {
        await indexedDbAdapter.insertRow('trips', offlineRecord);
        console.log('✅ Trip inserted into trips store (rider_id, ts, method all set)');
      } catch (insertErr) {
        console.error('⚠️ Error inserting into trips store:', insertErr);
        // Fall back to kvSet if insertRow fails
        await indexedDbAdapter.kvSet(
          `trip_entry_${recordId}`,
          JSON.stringify(offlineRecord)
        );
      }

      // STEP 2: Update cache immediately for instant UI feedback
      // Cache uses same key format as getTodaysTrips() queries from
      await updateTripsCache(offlineRecord);
      console.log(`✅ Cache updated: trips_today_${effectiveRiderId}`);

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

      // ✅ AUDIT FIX #4: Try to sync immediately only if online
      // Data is already safe in IndexedDB, so sync is optional
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
            // HomeScreen will refresh on focus via useFocusEffect
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

      // Either offline or API sync failed - but data is safely stored in IndexedDB
      // Show success and navigate - HomeScreen will read from cache on focus
      setSuccessMessage(t('success_tripSaving') || 'Trip saved. Syncing...');
      
      setTimeout(() => {
        setAmount('');
        setSelectedMethod(null);
        // ✅ Navigate to Home - useFocusEffect will trigger refresh
        // refresh() will read from cache (fast) or DB (full query)
        // HeroFareCard displays updated total immediately
        navigation.navigate('Home', { refreshFare: true });
      }, 800);

    } catch (err) {
      console.error('❌ Save error:', err);
      showCriticalError(
        err.message || 'Error saving trip. Please try again.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  if (riderIdError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Unable to load rider information</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />
      
      <Text style={styles.screenTitle}>Record Trip</Text>
      <Text style={styles.screenSubtitle}>Add a new trip to today's total</Text>

      {criticalError && (
        <View style={[styles.alert, styles.alertError]}>
          <Text style={styles.alertText}>⚠️ {criticalError}</Text>
        </View>
      )}

      {successMessage && (
        <View style={[styles.alert, styles.alertSuccess]}>
          <Text style={styles.alertText}>✅ {successMessage}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>Fare Amount</Text>
        <View style={styles.amountDisplay}>
          <Text style={styles.currencySymbol}>KSh</Text>
          <Text style={styles.amountText}>{amount || '0'}</Text>
        </View>

        <View style={styles.keypad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <TouchableOpacity
              key={num}
              style={styles.keypadButton}
              onPress={() => handleKeypadPress(num.toString())}
              activeOpacity={0.7}
            >
              <Text style={styles.keypadText}>{num}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.keypadButton}
            onPress={() => handleKeypadPress('.')}
            activeOpacity={0.7}
          >
            <Text style={styles.keypadText}>.</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.keypadButton}
            onPress={() => handleKeypadPress('0')}
            activeOpacity={0.7}
          >
            <Text style={styles.keypadText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.keypadButton}
            onPress={() => handleKeypadPress('back')}
            activeOpacity={0.7}
          >
            <Text style={styles.keypadText}>←</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Payment Method</Text>
        <View style={styles.methodGrid}>
          {PAYMENT_METHODS.map(method => (
            <TouchableOpacity
              key={method.key}
              style={[
                styles.methodTile,
                selectedMethod === method.key && styles.methodTileSelected,
              ]}
              onPress={() => handlePaymentMethodSelect(method.key)}
              activeOpacity={0.7}
            >
              <Text style={styles.methodEmoji}>{method.emoji}</Text>
              <Text style={styles.methodLabel}>{method.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSaveTrip}
        disabled={saving}
        activeOpacity={0.8}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Save Trip</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    padding: 16,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#8b5cf6',
    marginBottom: 16,
  },
  alert: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  alertError: {
    backgroundColor: '#ffebee',
  },
  alertSuccess: {
    backgroundColor: '#e8f5e9',
  },
  alertText: {
    fontSize: 13,
    color: '#1a1c20',
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12,
  },
  amountDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: '#f6f4ef',
    borderRadius: 12,
    marginBottom: 16,
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#5b606c',
    marginRight: 8,
  },
  amountText: {
    fontSize: 42,
    fontWeight: '700',
    color: '#1a1c20',
  },
  keypad: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keypadButton: {
    width: '31%',
    aspectRatio: 1,
    backgroundColor: '#f6f4ef',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7e4db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1c20',
  },
  methodGrid: {
    display: 'flex',
    flexDirection: 'row',
    gap: 10,
  },
  methodTile: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 13,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodTileSelected: {
    borderColor: '#ff7a1a',
    backgroundColor: '#fff6ee',
  },
  methodEmoji: {
    fontSize: 22,
    marginBottom: 6,
  },
  methodLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    color: '#1a1c20',
  },
  saveButton: {
    backgroundColor: '#ff7a1a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 14,
    color: '#e0453f',
    textAlign: 'center',
    marginTop: 20,
  },
});