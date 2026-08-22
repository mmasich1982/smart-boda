// rider-app/src/screens/trips/NewTripScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Silent sync, clean UI, immediate feedback
// ✅ MULTILINGUAL: Uses i18n for all UI text
// ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
// ✅ NETWORK AWARE: Real-time connectivity detection

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Picker, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import FormField from '../../components/FormField';
import PrimaryButton from '../../components/PrimaryButton';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';
import colors from '../../theme/colors';

export default function NewTripScreen({ navigation }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ LOAD RIDER ID ON MOUNT
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ NewTrip: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  /**
   * ✅ UPDATE CACHE: Add new trip to trip_history cache
   * This ensures trip screens display the entry immediately
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
      
      // Save updated cache to IndexedDB (no artificial limits - 6-month cycle is the natural boundary)
      await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(items));
      console.log(`✅ Updated trip_history cache with new entry`);
    } catch (err) {
      console.error('❌ Error updating cache:', err);
    }
  };

  const handleSave = async () => {
    try {
      // Validation
      const amt = parseFloat(amount || '0');
      if (!amt || amt <= 0) {
        showCriticalError(
          t('validationError_enterValidAmount') || 'Please enter a valid amount greater than zero.',
          'validation'
        );
        return;
      }

      if (!paymentMethod) {
        showCriticalError(
          t('validationError_selectPaymentMethod') || 'Please select a payment method.',
          'validation'
        );
        return;
      }

      if (!effectiveRiderId) {
        showCriticalError(
          t('authError_riderIdNotAvailable') || 'Rider ID not available. Please restart the app.',
          'auth'
        );
        console.error('❌ No effective rider ID');
        return;
      }

      setSaving(true);
      clearCriticalError();
      setSuccessMessage('');

      const payload = {
        rider_id: effectiveRiderId,
        amount: amt,
        method: paymentMethod,
        note: note || '',
        created_at: new Date().toISOString(),
        status: 'active',
      };

      const recordId = `trip_${effectiveRiderId}_${Date.now()}`;
      const offlineRecord = { ...payload, id: recordId };

      console.log('💾 Saving trip:', { recordId, riderId: effectiveRiderId, amount: amt });

      // ALWAYS save locally first using IndexedDB
      await indexedDbAdapter.kvSet(
        `trip_entry_${recordId}`, 
        JSON.stringify(offlineRecord)
      );

      // Update cache immediately for instant UI feedback
      await updateTripHistoryCache(offlineRecord);

      // Add to sync queue for background sync
      const queueSuccess = await addToSyncQueue({
        id: recordId,
        type: 'trip',
        endpoint: `/trips/new?rider_id=${effectiveRiderId}`,
        data: payload,
        timestamp: new Date(),
      });

      if (!queueSuccess) {
        console.warn('⚠️ Failed to add to queue, but local save succeeded');
      }

      // Try to sync immediately only if online
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Attempting to sync to API...');
          const response = await api.post(
            `/trips/new?rider_id=${effectiveRiderId}`,
            payload
          );

          if (response.status === 200 || response.status === 201) {
            console.log('✅ Synced successfully to API');
            // Success - show brief confirmation
            setSuccessMessage(t('success_tripRecorded') || 'Trip recorded!');
            
            // Navigate after brief success message
            setTimeout(() => {
              navigation.navigate('DailyTradeSummary', { refreshData: true });
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
      setSuccessMessage(t('success_tripSyncing') || 'Trip saved. Syncing...');
      
      setTimeout(() => {
        navigation.navigate('DailyTradeSummary', { refreshData: true });
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

  if (!effectiveRiderId || !isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('recordTrip') || 'Record New Trip'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
      <Text style={styles.title}>{t('recordTrip') || 'Record New Trip'}</Text>
      <Text style={styles.subtitle}>{t('enterTripDetails') || 'Enter trip details'}</Text>

      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {successMessage && !saving && (
        <View style={styles.successBanner}>
          <Text style={styles.successBannerText}>✅ {successMessage}</Text>
        </View>
      )}

      <View style={styles.field}>
        <Text style={styles.label}>
          {t('amount') || 'Amount (KSh)'} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder={t('placeholder_amount') || 'e.g. 500'}
          placeholderTextColor="#b0a89d"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={(val) => {
            setAmount(val);
            clearCriticalError();
          }}
          editable={!saving}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>
          {t('paymentMethod') || 'Payment Method'} <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.selectContainer}>
          <Picker
            selectedValue={paymentMethod}
            onValueChange={setPaymentMethod}
            style={styles.picker}
            enabled={!saving}
          >
            <Picker.Item label={t('cash') || 'Cash'} value="Cash" />
            <Picker.Item label={t('mpesa') || 'M-Pesa'} value="MPesa" />
            <Picker.Item label={t('lipaLater') || 'Lipa Later'} value="LipaLater" />
          </Picker>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>
          {t('notes') || 'Notes'} ({t('optional') || 'optional'})
        </Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder={t('placeholder_notes') || 'Add any notes...'}
          placeholderTextColor="#b0a89d"
          multiline
          numberOfLines={3}
          value={note}
          onChangeText={setNote}
          editable={!saving}
        />
      </View>

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          (saving || !amount || !paymentMethod) && styles.primaryBtnDisabled
        ]}
        onPress={handleSave}
        disabled={saving || !amount || !paymentMethod}
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
            {saving ? (t('saving') || 'Saving...') : (t('recordTripButton') || 'Record Trip →')}
          </Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    padding: 20, 
    backgroundColor: '#f6f4ef' 
  },
  title: { 
    fontFamily: 'SpaceGrotesk-Bold', 
    fontSize: 22, 
    fontWeight: '700', 
    color: '#1a1c20', 
    marginBottom: 4 
  },
  subtitle: { 
    fontSize: 13, 
    color: colors.inkSoft || '#5b606c', 
    marginBottom: 18, 
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

  field: { 
    marginBottom: 16 
  },
  label: { 
    fontSize: 11.5, 
    fontWeight: '700', 
    textTransform: 'uppercase', 
    letterSpacing: 0.04, 
    color: '#5b606c', 
    marginBottom: 7 
  },
  required: { 
    color: '#e5650a' 
  },
  input: { 
    width: '100%', 
    padding: 13, 
    borderRadius: 12, 
    borderWidth: 1.5, 
    borderColor: '#e7e4db', 
    fontSize: 15, 
    fontFamily: 'Inter', 
    backgroundColor: '#fff', 
    color: '#1a1c20'
  },
  textarea: { 
    height: 90, 
    paddingTop: 13, 
    textAlignVertical: 'top' 
  },

  selectContainer: {
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  picker: { 
    height: 50, 
    color: '#1a1c20' 
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
  }
});