// rider-app/src/screens/trips/TripDetailScreen.js
// ✅ FULLY DEFENSIVE: Trip Detail Screen with complete error handling
// ✅ FIXED: Proper state management for correctionReasonItems and paymentMethodItems
// Every .map() is guarded, every undefined is checked

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

// ============================================================================
// MODULE-LEVEL CONSTANTS - DEFENSIVE INITIALIZATION
// ============================================================================

const PAYMENT_METHODS = [
  { key: 'Cash', label: 'Cash', emoji: '💵' },
  { key: 'MPesa', label: 'M-Pesa', emoji: '📱' },
];

const CORRECTION_REASONS = [
  'Typo',
  'Wrong Payment Method Selected',
  'Duplicate Entry',
  'Other',
];

// Pre-create these at module level so they're always available
const DEFAULT_CORRECTION_ITEMS = [
  { key: 'Typo', label: 'Typo' },
  { key: 'Wrong Payment Method Selected', label: 'Wrong Payment Method Selected' },
  { key: 'Duplicate Entry', label: 'Duplicate Entry' },
  { key: 'Other', label: 'Other' },
];

const DEFAULT_PAYMENT_METHODS = [
  { key: 'Cash', label: 'Cash', emoji: '💵' },
  { key: 'MPesa', label: 'M-Pesa', emoji: '📱' },
];

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
  
  // ✅ FIXED: Manage items as state instead of creating during render
  const [correctionReasonItems, setCorrectionReasonItems] = useState(DEFAULT_CORRECTION_ITEMS);
  const [paymentMethodItems, setPaymentMethodItems] = useState(DEFAULT_PAYMENT_METHODS);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ Initialize correction and payment items on mount
  useEffect(() => {
    try {
      // Build correction reason items
      if (CORRECTION_REASONS && Array.isArray(CORRECTION_REASONS) && CORRECTION_REASONS.length > 0) {
        const items = CORRECTION_REASONS.map((r) => ({
          key: r,
          label: r,
        }));
        setCorrectionReasonItems(items);
        console.log('✅ correctionReasonItems initialized:', items.length);
      }
    } catch (err) {
      console.error('❌ Error initializing correctionReasonItems:', err);
      setCorrectionReasonItems(DEFAULT_CORRECTION_ITEMS);
    }

    try {
      // Set payment method items
      if (PAYMENT_METHODS && Array.isArray(PAYMENT_METHODS) && PAYMENT_METHODS.length > 0) {
        setPaymentMethodItems(PAYMENT_METHODS);
        console.log('✅ paymentMethodItems initialized:', PAYMENT_METHODS.length);
      }
    } catch (err) {
      console.error('❌ Error initializing paymentMethodItems:', err);
      setPaymentMethodItems(DEFAULT_PAYMENT_METHODS);
    }
  }, []);

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

  // ✅ Load trip when both riderId and tripId are available
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

  // ✅ FIXED: Load trip from trip_history cache
  const loadTrip = async () => {
    try {
      setLoading(true);
      setTripNotFound(false);
      clearCriticalError();

      const cacheKey = `trip_history_${riderId}`;
      console.log('🔍 Loading trip from cache:', { cacheKey, tripId });
      
      const cachedData = await indexedDbAdapter.kvGet(cacheKey);
      let tripsList = [];

      if (cachedData) {
        try {
          tripsList = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
          if (!Array.isArray(tripsList)) {
            console.warn('⚠️ Cache data is not an array:', typeof tripsList);
            tripsList = [];
          }
        } catch (parseErr) {
          console.warn('⚠️ Cache parse error:', parseErr);
          tripsList = [];
        }
      }

      console.log('📊 Cache contains', tripsList.length, 'trips');

      // Find trip by ID in the cache array
      const foundTrip = tripsList.find(t => t && t.id === tripId);

      if (foundTrip) {
        console.log('✅ Trip loaded from cache:', tripId);
        setTrip(foundTrip);
        setDraftAmount((foundTrip.amount || 0).toString());
        setDraftMethod(foundTrip.paymentMethod || foundTrip.method || '');
        setDraftReason(foundTrip.correctionReason || '');
        setTripNotFound(false);
      } else {
        console.error('❌ Trip not found in cache:', { tripId, cacheLength: tripsList.length });
        if (tripsList.length > 0) {
          console.log('📋 Available trip IDs:', tripsList.map(t => t?.id).join(', '));
        }
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
    const ts = trip.ts || trip.timestamp || 0;
    const now = Date.now();
    return (now - ts) / (1000 * 60 * 60);
  };

  const isEditable = trip ? hoursSinceTrip() < CORRECTION_WINDOW_HOURS : false;
  const remainingHours = trip ? Math.max(0, CORRECTION_WINDOW_HOURS - hoursSinceTrip()) : 0;

  // ✅ Update trip in cache (safely)
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
          console.warn('⚠️ Cache parse error in update');
          items = [];
        }
      }

      // Safely update the trip in cache
      if (Array.isArray(items) && items.length > 0) {
        const updatedItems = items
          .filter(t => t && t.id) // Filter out any null/undefined entries
          .map(t => (t.id === updatedTrip.id ? updatedTrip : t));
        await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(updatedItems));
      } else {
        // Cache is empty, just save this trip
        await indexedDbAdapter.kvSet(cacheKey, JSON.stringify([updatedTrip]));
      }
      
      // Also save to trip_entry for future access
      const recordKey = `trip_entry_${tripId}`;
      await indexedDbAdapter.kvSet(recordKey, JSON.stringify(updatedTrip));
      
      console.log('✅ Updated trip cache and entry');
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

      await updateTripHistoryCache(correctedTrip);

      const payload = {
        amount: amt,
        payment_channel_code: draftMethod || trip.paymentMethod,
        correctionReason: draftReason,
        correctedAt: new Date().toISOString(),
      };

      await addToSyncQueue({
        id: tripId,
        type: 'trip_correction',
        endpoint: `/trips/${tripId}?rider_id=${riderId}`,
        data: payload,
        timestamp: new Date(),
      });

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

      const voidedTrip = {
        ...trip,
        status: 'voided',
        voidReason: draftReason,
        voidTimestamp: Date.now(),
        syncStatus: 'pending',
      };

      await updateTripHistoryCache(voidedTrip);

      const payload = {
        voidReason: draftReason,
        voidedAt: new Date().toISOString(),
      };

      await addToSyncQueue({
        id: tripId,
        type: 'trip_void',
        endpoint: `/trips/${tripId}?rider_id=${riderId}`,
        data: payload,
        timestamp: new Date(),
      });

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

  // ✅ Safe field access
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
          <Text style={styles.kvValue}>KSh {originalAmount.toLocaleString()}</Text>
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
        {paymentMethodItems && Array.isArray(paymentMethodItems) && paymentMethodItems.length > 0 ? (
          paymentMethodItems.map((method) => (
            <TouchableOpacity
              key={method.key}
              style={[styles.methodTile, draftMethod === method.key && styles.methodTileSelected]}
              onPress={() => setDraftMethod(method.key)}
              disabled={!isEditable}
            >
              <Text style={styles.methodEmoji}>{method.emoji}</Text>
              <Text style={styles.methodLabel}>{method.label}</Text>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.loadingText}>Loading payment methods...</Text>
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>
          Correction Reason <Text style={styles.required}>*</Text>
        </Text>
        {correctionReasonItems && Array.isArray(correctionReasonItems) && correctionReasonItems.length > 0 ? (
          <DropdownField
            selectedValue={draftReason}
            onValueChange={(value) => setDraftReason(value)}
            items={correctionReasonItems}
            placeholder="Select..."
            enabled={isEditable}
          />
        ) : (
          <Text style={styles.loadingText}>Loading correction reasons...</Text>
        )}
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