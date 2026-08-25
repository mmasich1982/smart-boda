// rider-app/src/screens/trips/TripDetailScreen.js
// ✅ REFACTORED: IndexedDB-first architecture (mirrors FuelEntryScreen)
// ✅ SEAMLESS ONLINE/OFFLINE: Silent sync, clean UI, immediate feedback
// ✅ UNIFIED ARCHITECTURE: Removed tripsRepository - uses only IndexedDB kvSet/kvGet
// ✅ INSTANT UPDATES: Corrections saved to IndexedDB with immediate UI feedback
// ✅ NETWORK AWARE: Real-time connectivity detection
// ✅ UI/UX: 100% preserved from original
// ✅ FIX: Defensive null checks and fallback constants to prevent .map() errors

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Switch } from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import DropdownField from '../../components/DropdownField';
import InlineWarning from '../../components/InlineWarning';
import PrimaryButton from '../../components/PrimaryButton';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import { CORRECTION_WINDOW_HOURS } from '../../constants/tripConstants';

const PAYMENT_METHODS = [
  { key: 'Cash', label: 'Cash', emoji: '💵' },
  { key: 'MPesa', label: 'M-Pesa', emoji: '📱' },
];

// ✅ CORRECTION REASONS: Defined inline to avoid import failures
// These are the only reasons available for correcting or voiding trips
const CORRECTION_REASONS = [
  'Wrong amount entered',
  'Duplicate trip',
  'Wrong payment method',
  'Trip cancelled',
  'Other',
];

// ✅ Convert to dropdown items format at module level (safe, not in render)
const CORRECTION_REASON_ITEMS = CORRECTION_REASONS.map((reason) => ({
  label: reason,
  value: reason,
}));

/**
 * ✅ REFACTORED: Trip Detail Screen for correction/void (RA-04-B)
 * ✅ UNIFIED ARCHITECTURE: IndexedDB-first with no repository dependencies
 * ✅ INSTANT UPDATES: Corrections saved to IndexedDB with cache updates
 * ✅ OFFLINE PERSISTENCE: All changes stored locally first
 * ✅ FIX: Defensive null/undefined checks prevent .map() errors
 *
 * KEY CHANGES FROM ORIGINAL:
 * • Removed all tripsRepository imports and dependencies
 * • Uses indexedDbAdapter.kvGet() to load trip from trip_entry_ key
 * • Uses indexedDbAdapter.kvSet() to save corrections
 * • Uses addToSyncQueue() for background API sync
 * • Trip cache automatically updated via DailyTradeSummaryScreen's focus refresh
 * • Void operations persist to IndexedDB immediately
 * • ✅ Added fallback CORRECTION_REASONS constant
 * • ✅ Added safe guards for undefined values
 * • ✅ Improved error handling for missing trip data
 *
 * STORAGE PATTERN:
 * - trip_entry_${tripId}: Individual trip record
 * - trip_history_${riderId}: Cache updated by DailyTradeSummaryScreen on focus
 * - sync queue: Background sync when online
 */
export default function TripDetailScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { tripId } = route?.params || {};

  const [trip, setTrip] = useState(null);
  const [riderId, setRiderId] = useState(null);
  const [draftAmount, setDraftAmount] = useState('');
  const [draftMethod, setDraftMethod] = useState('');
  const [draftReason, setDraftReason] = useState('');
  const [voidConfirmed, setVoidConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tripNotFound, setTripNotFound] = useState(false);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ Load riderId on mount
  useEffect(() => {
    async function initRiderId() {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setRiderId(id);
          console.log('✅ TripDetail: Loaded rider ID:', id);
        } else {
          showToast('Rider ID not found', 'error');
        }
      } catch (err) {
        console.error('❌ Error loading riderId:', err);
        showToast('Error loading rider information', 'error');
      }
    }
    initRiderId();
  }, [showToast]);

  // ✅ Validate tripId before attempting to load
  useEffect(() => {
    if (!tripId) {
      console.error('❌ TripDetailScreen: tripId is missing', { tripId, params: route?.params });
      setTripNotFound(true);
      setLoading(false);
      showToast('Trip ID not found', 'error');
      return;
    }

    if (riderId && tripId) {
      loadTrip();
    }
  }, [riderId, tripId]);

  const loadTrip = async () => {
    try {
      setLoading(true);
      setTripNotFound(false);
      clearCriticalError();

      // ✅ Load trip from IndexedDB
      const recordKey = `trip_entry_${tripId}`;
      console.log('🔍 Loading trip from IndexedDB:', { recordKey, tripId });
      const tripData = await indexedDbAdapter.kvGet(recordKey);

      if (tripData) {
        const parsedTrip = typeof tripData === 'string' ? JSON.parse(tripData) : tripData;
        setTrip(parsedTrip);
        setDraftAmount(parsedTrip.amount?.toString() || '');
        setDraftMethod(parsedTrip.paymentMethod || parsedTrip.method || '');
        setDraftReason(parsedTrip.correctionReason || '');
        setTripNotFound(false);
        console.log('✅ Trip loaded from IndexedDB:', tripId);
      } else {
        console.error('❌ Trip not found in IndexedDB:', recordKey);
        setTripNotFound(true);
        showToast('Trip not found', 'error');
        setTimeout(() => {
          navigation.goBack();
        }, 1500);
      }
    } catch (err) {
      console.error('❌ Load trip error:', err);
      setTripNotFound(true);
      showCriticalError('Error loading trip', 'load_error');
    } finally {
      setLoading(false);
    }
  };

  const hoursSinceTrip = () => {
    if (!trip) return 0;
    const now = Date.now();
    const ts = trip.ts || trip.timestamp;
    return (now - ts) / (1000 * 60 * 60);
  };

  const isEditable = trip ? hoursSinceTrip() < CORRECTION_WINDOW_HOURS : false;
  const remainingHours = trip ? Math.max(0, CORRECTION_WINDOW_HOURS - hoursSinceTrip()) : 0;

  /**
   * ✅ UPDATE CACHE: Add new trip to trip_history cache
   * Ensures DailyTradeSummaryScreen sees the updated trip
   */
  const updateTripHistoryCache = async (updatedTrip) => {
    try {
      const cacheKey = `trip_history_${riderId}`;
      const cachedData = await indexedDbAdapter.kvGet(cacheKey);
      let items = [];

      if (cachedData) {
        try {
          items = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
          if (!Array.isArray(items)) items = [];
        } catch (parseErr) {
          console.warn('⚠️ Cache parse error');
          items = [];
        }
      }

      // Update the trip in cache
      const updatedItems = items.map(t => t.id === updatedTrip.id ? updatedTrip : t);
      await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(updatedItems));
      console.log('✅ Updated trip_history cache with correction');
    } catch (err) {
      console.error('❌ Error updating cache:', err);
    }
  };

  const handleSaveCorrection = async () => {
    if (!draftReason) {
      showCriticalError(t('error_selectCorrectionReason') || 'Select a Correction Reason to continue', 'validation');
      return;
    }

    const amt = parseFloat(draftAmount);
    if (!amt || amt <= 0) {
      showCriticalError(
        t('error_correctedAmountGreaterThanZero') || 'Corrected amount must be greater than zero',
        'validation'
      );
      return;
    }

    try {
      setSaving(true);
      clearCriticalError();

      // ✅ Build corrected trip record
      const correctedTrip = {
        ...trip,
        originalAmount: trip.originalAmount || trip.amount,
        amount: amt,
        paymentMethod: draftMethod || trip.paymentMethod,
        method: draftMethod || trip.method,
        correctionReason: draftReason,
        correctionTimestamp: Date.now(),
        syncStatus: 'pending',
      };

      // ✅ Save correction to IndexedDB (fuel pattern)
      const recordKey = `trip_entry_${tripId}`;
      await indexedDbAdapter.kvSet(recordKey, JSON.stringify(correctedTrip));
      console.log('✅ Correction saved to IndexedDB');

      // ✅ Update cache for immediate UI feedback
      await updateTripHistoryCache(correctedTrip);

      // ✅ Queue for background sync
      const payload = {
        amount: amt,
        payment_channel_code: draftMethod || trip.paymentMethod,
        correctionReason: draftReason,
        correctedAt: new Date().toISOString(),
      };

      const queueSuccess = await addToSyncQueue({
        id: tripId,
        type: 'trip_correction',
        endpoint: `/trips/${tripId}?rider_id=${riderId}`,
        data: payload,
        timestamp: new Date(),
      });

      if (!queueSuccess) {
        console.warn('⚠️ Failed to add to queue, but local save succeeded');
      }

      // ✅ Try immediate sync if online (optional - data already safe)
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Attempting to sync correction...');
          const response = await api.put(`/trips/${tripId}?rider_id=${riderId}`, payload);
          if (response.status === 200 || response.status === 201) {
            console.log('✅ Correction synced to API');
          }
        } catch (apiErr) {
          console.warn('⚠️ API sync failed (will retry):', apiErr.message);
        }
      }

      // ✅ Success feedback and navigation
      showToast(`Trip updated. Today's total updated.`, 'success');
      setTimeout(() => {
        navigation.navigate('DailyTradeSummary', { refreshData: true });
      }, 800);
    } catch (err) {
      console.error('❌ Save correction error:', err);
      showCriticalError('Error saving correction', 'save_error');
    } finally {
      setSaving(false);
    }
  };

  const handleVoidTrip = async () => {
    if (!draftReason) {
      showCriticalError(t('error_selectReasonBeforeVoid') || 'Select a Correction Reason before voiding', 'validation');
      return;
    }

    if (!voidConfirmed) {
      showCriticalError(
        t('error_confirmVoidAction') || 'Please confirm the Void action — this is a second, deliberate step',
        'validation'
      );
      return;
    }

    try {
      setSaving(true);
      clearCriticalError();

      // ✅ Build voided trip record
      const voidedTrip = {
        ...trip,
        status: 'voided',
        voidReason: draftReason,
        voidTimestamp: Date.now(),
        syncStatus: 'pending',
      };

      // ✅ Save void to IndexedDB
      const recordKey = `trip_entry_${tripId}`;
      await indexedDbAdapter.kvSet(recordKey, JSON.stringify(voidedTrip));
      console.log('✅ Void saved to IndexedDB');

      // ✅ Update cache for immediate UI feedback
      await updateTripHistoryCache(voidedTrip);

      // ✅ Queue for background sync
      const payload = {
        voidReason: draftReason,
        voidedAt: new Date().toISOString(),
      };

      const queueSuccess = await addToSyncQueue({
        id: tripId,
        type: 'trip_void',
        endpoint: `/trips/${tripId}?rider_id=${riderId}`,
        data: payload,
        timestamp: new Date(),
      });

      if (!queueSuccess) {
        console.warn('⚠️ Failed to add void to queue, but local save succeeded');
      }

      // ✅ Try immediate sync if online
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Attempting to sync void...');
          const response = await api.put(`/trips/${tripId}?rider_id=${riderId}`, payload);
          if (response.status === 200 || response.status === 201) {
            console.log('✅ Void synced to API');
          }
        } catch (apiErr) {
          console.warn('⚠️ API sync failed (will retry):', apiErr.message);
        }
      }

      // ✅ Success feedback and navigation
      showToast('Trip voided. Today\'s total updated.', 'success');
      setTimeout(() => {
        navigation.navigate('DailyTradeSummary', { refreshData: true });
      }, 800);
    } catch (err) {
      console.error('❌ Void trip error:', err);
      showCriticalError('Error voiding trip', 'void_error');
    } finally {
      setSaving(false);
    }
  };

  // ✅ Show loading state
  if (loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink label="← Back" onPress={() => navigation.goBack()} />
        <Text style={styles.loadingText}>Loading trip details...</Text>
      </ScrollView>
    );
  }

  // ✅ Show error state if trip not found
  if (tripNotFound || !trip) {
    return (
      <ScrollView style={styles.container}>
        <BackLink label="← Back" onPress={() => navigation.goBack()} />
        <Text style={styles.screenTitle}>Trip Not Found</Text>
        <Text style={styles.loadingText}>The trip you're looking for could not be found. Returning to summary...</Text>
      </ScrollView>
    );
  }

  // ✅ Safe access to trip fields with fallbacks
  const tripAmount = trip?.amount || 0;
  const originalAmount = trip?.originalAmount || trip?.amount || 0;
  const tripMethod = trip?.paymentMethod || trip?.method || 'Unknown';
  const isLipaLaterTrip = tripMethod === 'LipaLater';

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />

      <Text style={styles.screenTitle}>Trip Details</Text>
      <Text style={styles.screenSub}>⏱️ {isEditable ? `${remainingHours.toFixed(1)} hours to correct` : 'Outside correction window'}</Text>

      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>Original amount</Text>
          <Text style={styles.kvValue}>
            KSh {originalAmount.toLocaleString()}
          </Text>
        </View>
        {trip.originalAmount !== undefined && (
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Current (corrected)</Text>
            <Text style={styles.kvValue}>KSh {tripAmount.toLocaleString()}</Text>
          </View>
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Corrected Fare Amount</Text>
        <TextInput
          style={styles.textInput}
          keyboardType="decimal-pad"
          value={draftAmount}
          onChangeText={setDraftAmount}
          placeholder="0"
          editable={isEditable}
        />
      </View>

      {isLipaLaterTrip && (
        <InlineWarning
          icon="🕒"
          message={`This trip is Lipa Later for ${trip.lipaLater?.customerName || 'this customer'}. To change the method away from Lipa Later, pick Cash or M-Pesa below — the customer record will be removed.`}
          type="info"
        />
      )}

      <Text style={styles.methodLabel}>Corrected Payment Method</Text>
      <View style={styles.methodGrid}>
        {PAYMENT_METHODS.map((method) => (
          <TouchableOpacity
            key={method.key}
            style={[styles.methodTile, draftMethod === method.key && styles.methodTileSelected]}
            onPress={() => setDraftMethod(method.key)}
            disabled={!isEditable}
          >
            <Text style={styles.methodEmoji}>{method.emoji}</Text>
            <Text style={styles.methodLabel}>{method.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>
          Correction Reason <Text style={styles.required}>*</Text>
        </Text>
        <DropdownField
          selectedValue={draftReason}
          onValueChange={setDraftReason}
          items={CORRECTION_REASON_ITEMS}
          placeholder="Select..."
          enabled={isEditable}
        />
      </View>

      <PrimaryButton
        label="Save Correction →"
        onPress={handleSaveCorrection}
        disabled={saving || !draftReason || !isEditable}
        style={styles.saveButton}
      />

      <View style={[styles.card, styles.voidCard]}>
        <Text style={styles.voidTitle}>⚠️ Void This Trip</Text>

        <View style={styles.checkboxRow}>
          <Switch
            value={voidConfirmed}
            onValueChange={setVoidConfirmed}
            style={styles.switch}
            disabled={!isEditable}
          />
          <Text style={styles.checkboxText}>
            I confirm this trip should be permanently removed from today's total.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.voidButton, (saving || !isEditable) && styles.buttonDisabled]}
          onPress={handleVoidTrip}
          disabled={saving || !isEditable}
        >
          <Text style={styles.voidButtonText}>Void Trip</Text>
        </TouchableOpacity>
      </View>
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
  screenSub: {
    fontSize: 12,
    color: '#8b5cf6',
    marginBottom: 16,
  },
  criticalErrorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  criticalErrorText: {
    fontSize: 12,
    color: '#a5312c',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  kvRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
    borderStyle: 'dashed',
  },
  kvKey: {
    fontSize: 12.5,
    color: '#5b606c',
  },
  kvValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1a1c20',
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 8,
  },
  required: {
    color: '#e0453f',
  },
  textInput: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#1a1c20',
  },
  methodLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    color: '#5b606c',
    marginBottom: 7,
  },
  methodGrid: {
    display: 'flex',
    flexDirection: 'row',
    gap: 9,
    marginBottom: 16,
  },
  methodTile: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 13,
    padding: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodTileSelected: {
    borderColor: '#ff7a1a',
    backgroundColor: '#fff6ee',
  },
  methodEmoji: {
    fontSize: 20,
    marginBottom: 6,
  },
  saveButton: {
    marginBottom: 10,
  },
  voidCard: {
    borderColor: '#e0453f',
    backgroundColor: '#fff9f8',
  },
  voidTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e0453f',
    marginBottom: 12,
  },
  checkboxRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  switch: {
    transform: [{ scale: 0.8 }],
  },
  checkboxText: {
    fontSize: 12.5,
    color: '#1a1c20',
    flex: 1,
  },
  voidButton: {
    backgroundColor: '#e0453f',
    borderRadius: 12,
    padding: 13,
    alignItems: 'center',
  },
  voidButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  loadingText: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    marginTop: 20,
  },
});