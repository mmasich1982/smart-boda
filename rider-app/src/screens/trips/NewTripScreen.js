// rider-app/src/screens/trips/NewTripScreen.js
// ✅ UPDATED: Lipa Later support with IndexedDB-first architecture
// ✅ SEAMLESS ONLINE/OFFLINE: Silent sync, clean UI, immediate feedback
// ✅ UNIFIED ARCHITECTURE: Removed tripsRepository - uses only IndexedDB kvSet
// ✅ INSTANT UPDATES: Trip cache updated immediately, HomeScreen displays data on focus
// ✅ NETWORK AWARE: Real-time connectivity detection
// ✅ PAYMENT FLOW:
//    - Cash/M-Pesa: Save trip → Auto-redirect to Home
//    - Lipa Later: Navigate to LipaLaterDetailsScreen with amount
// ✅ UI/UX: 100% preserved, payment buttons sized to match keypad

import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import NumericKeypad from '../../components/NumericKeypad';
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
  { key: 'LipaLater', label: 'Lipa Later', emoji: '📅' },
];

/**
 * ✅ UPDATED: New Trip Screen with Lipa Later
 * ✅ UNIFIED ARCHITECTURE: IndexedDB-first with no repository dependencies
 * ✅ INSTANT UPDATES: Trip cache updated immediately for HomeScreen display
 * ✅ OFFLINE PERSISTENCE: All data stored in IndexedDB with background sync
 *
 * PAYMENT FLOW:
 * • Cash/M-Pesa: Record trip immediately, save to cache, return to Home
 * • Lipa Later: Navigate to LipaLaterDetailsScreen with amount for customer capture
 *
 * KEY CHANGES FROM ORIGINAL:
 * • Added Lipa Later as third payment method
 * • Conditional navigation based on payment method
 * • Reduced payment button sizes to match numeric keypad
 * • Removed all tripsRepository imports and dependencies
 * • Uses indexedDbAdapter.kvSet() for direct IndexedDB storage
 * • Uses addToSyncQueue() for background API sync
 * • Trip cache (trip_history_${riderId}) updated on save
 * • Individual trip records stored as trip_entry_${tripId}
 * • HomeScreen reads from cache directly on focus
 *
 * CACHE STRUCTURE:
 * - trip_entry_${tripId}: Individual trip record
 * - trip_history_${riderId}: Array of all trips (cached for fast access)
 * - sync_queue: Background sync queue for API uploads
 */
export default function NewTripScreen({ navigation }) {
  const { state } = useRider();
  const { t } = useTranslation();

  const [amount, setAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [riderIdError, setRiderIdError] = useState(false);

  const { isConnected, isInitialized } = useNetworkStatus();
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

  const handlePaymentMethodSelect = (methodKey) => {
    setSelectedMethod(methodKey);
  };

  /**
   * ✅ UPDATE CACHE: Add new trip to trip_history cache
   * This ensures HomeScreen and DailyTradeSummaryScreen display the trip immediately
   * Uses IndexedDB for persistent local-first storage
   */
  const updateTripHistoryCache = async (offlineRecord) => {
    try {
      const cacheKey = `trip_history_${effectiveRiderId}`;

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

      // Add new entry to front (most recent first)
      items.unshift(offlineRecord);

      // Save updated cache to IndexedDB
      await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(items));
      console.log(`✅ Updated trip_history cache with new entry`);
    } catch (err) {
      console.error('❌ Error updating cache:', err);
    }
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

      // ✅ CONDITIONAL FLOW: Lipa Later vs Cash/M-Pesa
      if (selectedMethod === 'LipaLater') {
        // Navigate to Lipa Later Details screen to capture customer info
        console.log('📱 Routing to Lipa Later Details with amount:', amtValue);
        navigation.navigate('LipaLaterDetailsScreen', { amount: amtValue.toString() });
        return;
      }

      // ✅ CASH / M-PESA FLOW: Save trip immediately and return to Home
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

      // ✅ UNIFIED ARCHITECTURE: Using fuel pattern for consistency
      // All fields use consistent naming convention for proper IndexedDB storage
      const offlineRecord = {
        id: recordId,
        rider_id: effectiveRiderId,
        amount: amtValue,
        paymentMethod: selectedMethod,
        method: selectedMethod,
        note: '',
        timestamp: now,
        ts: now,
        status: 'active',
        syncStatus: 'pending',
        createdAt: now,
        date: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
      };

      console.log('💾 Saving trip entry:', {
        recordId,
        riderId: effectiveRiderId,
        amount: amtValue,
        method: selectedMethod,
        cacheKey: `trip_history_${effectiveRiderId}`,
      });

      // ✅ DIRECT INDEXEDDB PERSISTENCE (fuel pattern)
      // Save directly to IndexedDB using kvSet with trip_entry_ prefix
      await indexedDbAdapter.kvSet(
        `trip_entry_${recordId}`,
        JSON.stringify(offlineRecord)
      );
      console.log('✅ Trip saved to IndexedDB with trip_entry_ prefix');

      // Update cache immediately for instant UI feedback
      await updateTripHistoryCache(offlineRecord);

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

      // ✅ Try to sync immediately only if online
      // Data is already safe in IndexedDB, so sync is optional
      if (isConnected && isInitialized) {
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
              navigation.navigate('Dashboard', { refreshFare: true });
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
        navigation.navigate('Dashboard', { refreshFare: true });
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
      <BackLink label="← Home" onPress={() => navigation.navigate('Dashboard')} />

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
        <NumericKeypad 
          value={amount} 
          onChange={setAmount}
          currencyLabel="KSh"
          maxLength={10}
        />
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

  // ✅ UPDATED: Reduced button sizes to match numeric keypad dimensions
  methodGrid: {
    display: 'flex',
    flexDirection: 'row',
    gap: 8,
  },
  methodTile: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodTileSelected: {
    borderColor: '#ff7a1a',
    backgroundColor: '#fff6ee',
  },
  methodEmoji: {
    fontSize: 18,
    marginBottom: 4,
  },
  methodLabel: {
    fontSize: 10,
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