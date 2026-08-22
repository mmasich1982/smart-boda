// rider-app/src/screens/serviceHub/MaintenanceEntryScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Silent sync, clean UI, immediate feedback
// ✅ MULTILINGUAL: Uses i18n for all UI text
// ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
// ✅ NETWORK AWARE: Real-time connectivity detection
// ✅ SIMPLIFIED: Cost entry only - no service types, oil types, or odometer tracking

import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import colors from '../../theme/colors';

export default function MaintenanceEntryScreen({ navigation }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [serviceCost, setServiceCost] = useState('');
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
          console.log('✅ MaintenanceEntry: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  /**
   * ✅ UPDATE CACHE: Add new entry to maintenance_history cache
   * This ensures MaintenanceHistoryScreen displays the entry immediately
   * Uses IndexedDB for persistent local-first storage
   */
  const updateMaintenanceHistoryCache = async (offlineRecord) => {
    try {
      const cacheKey = `maintenance_history_${effectiveRiderId}`;
      
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
      console.log(`✅ Updated maintenance_history cache with new entry`);
    } catch (err) {
      console.error('❌ Error updating cache:', err);
    }
  };

  const handleSave = async () => {
    try {
      // Validation
      if (!serviceCost || parseFloat(serviceCost) <= 0) {
        showCriticalError(
          t('validationError_enterValidCost') || 'Please enter a valid cost amount greater than zero.',
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
        cost: parseFloat(serviceCost),
        created_at: new Date().toISOString(),
      };

      const recordId = `maintenance_${effectiveRiderId}_${Date.now()}`;
      const offlineRecord = { 
        ...payload, 
        id: recordId, 
        rider_id: effectiveRiderId
      };

      console.log('💾 Saving maintenance entry:', { recordId, riderId: effectiveRiderId, cost: serviceCost });

      // ALWAYS save locally first using IndexedDB
      await indexedDbAdapter.kvSet(
        `maintenance_entry_${recordId}`, 
        JSON.stringify(offlineRecord)
      );

      // Update cache immediately for instant UI feedback
      await updateMaintenanceHistoryCache(offlineRecord);

      // Add to sync queue for background sync
      const queueSuccess = await addToSyncQueue({
        id: recordId,
        type: 'maintenance_entry',
        endpoint: `/fuel-maintenance/maintenance-entry?rider_id=${effectiveRiderId}`,
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
            `/fuel-maintenance/maintenance-entry?rider_id=${effectiveRiderId}`,
            payload
          );

          if (response.status === 200 || response.status === 201) {
            console.log('✅ Synced successfully to API');
            // Success - show brief confirmation
            setSuccessMessage(t('success_serviceCostRecorded') || 'Service cost recorded!');
            
            // Navigate after brief success message
            setTimeout(() => {
              navigation.navigate('MaintenanceHistory');
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
      setSuccessMessage(t('success_serviceCostSaving') || 'Service cost saved. Syncing...');
      
      setTimeout(() => {
        navigation.navigate('MaintenanceHistory');
      }, 800);

    } catch (err) {
      console.error('❌ Save error:', err);
      showCriticalError(
        err.response?.data?.detail || t('error_saveFailed') || 'Failed to save entry. Please try again.',
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
        <Text style={styles.title}>{t('recordMaintenance') || 'Record Service Cost'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
      <Text style={styles.title}>{t('recordMaintenance') || 'Record Service Cost'}</Text>

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
          {t('serviceCost') || 'Service Cost'} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder={t('placeholder_amount') || 'e.g. 1000'}
          placeholderTextColor="#b0a89d"
          keyboardType="decimal-pad"
          value={serviceCost}
          onChangeText={(val) => {
            setServiceCost(val);
            clearCriticalError();
          }}
          editable={!saving}
        />
        <Text style={styles.hint}>{t('enterAmountInKSh') || 'Enter amount in KSh'}</Text>
      </View>

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          (saving || !serviceCost) && styles.primaryBtnDisabled
        ]}
        onPress={handleSave}
        disabled={saving || !serviceCost}
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
              : (t('recordServiceCostButton') || 'Record Service Cost →')
            }
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

  field: { 
    marginBottom: 24 
  },
  label: { 
    fontSize: 11.5, 
    fontWeight: '700', 
    textTransform: 'uppercase', 
    letterSpacing: 0.04, 
    color: colors.inkSoft || '#5b606c', 
    marginBottom: 8 
  },
  required: { 
    color: '#e5650a' 
  },
  input: { 
    width: '100%', 
    padding: 14, 
    borderRadius: 12, 
    borderWidth: 1.5, 
    borderColor: '#e7e4db', 
    fontSize: 16, 
    backgroundColor: '#fff', 
    color: '#1a1c20',
    marginBottom: 8
  },
  hint: { 
    fontSize: 11.5, 
    color: colors.inkSoft || '#5b606c', 
    fontWeight: '500' 
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