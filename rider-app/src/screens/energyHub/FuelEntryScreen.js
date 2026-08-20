// rider-app/src/screens/energyHub/FuelEntryScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Silent sync, clean UI, immediate feedback
// No status banners - just "Saving..." and success/error only when needed

import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';

export default function FuelEntryScreen({ bikeProfile, navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [totalCost, setTotalCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  const isElectric = bikeProfile?.fuelType === 'electric';
  const title = isElectric ? 'Record Battery Cost' : 'Record Fuel Cost';

  // Load rider ID on mount
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ FuelEntry: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  /**
   * ✅ UPDATE CACHE: Add new entry to fuel_history cache
   * This ensures FuelHistoryScreen displays the entry immediately
   */
  const updateFuelHistoryCache = (offlineRecord) => {
    try {
      const cacheKey = `fuel_history_${effectiveRiderId}`;
      
      // Get existing cache
      const cachedDataStr = LocalStore.get(cacheKey);
      let items = [];
      
      if (cachedDataStr) {
        try {
          items = JSON.parse(cachedDataStr);
          if (!Array.isArray(items)) items = [];
        } catch (parseErr) {
          console.warn('⚠️ Cache parse error, starting fresh');
          items = [];
        }
      }
      
      // Add new entry to front (most recent first)
      items.unshift(offlineRecord);
      
      // Limit cache to 100 entries (API also limits to 100)
      items = items.slice(0, 100);
      
      // Save updated cache
      const success = LocalStore.set(cacheKey, JSON.stringify(items));
      if (success) {
        console.log(`✅ Updated fuel_history cache with new entry`);
      }
    } catch (err) {
      console.error('❌ Error updating cache:', err);
    }
  };

  const handleSave = async () => {
    try {
      // Validation
      if (!totalCost || parseFloat(totalCost) <= 0) {
        showCriticalError('Please enter a valid cost amount', 'validation');
        return;
      }

      if (!effectiveRiderId) {
        showCriticalError('Rider ID not available. Please restart the app.', 'auth');
        console.error('❌ No effective rider ID');
        return;
      }

      setSaving(true);
      clearCriticalError();
      setSuccessMessage('');

      const payload = {
        mode: isElectric ? 'charging' : 'petrol',
        cost: parseFloat(totalCost),
        created_at: new Date().toISOString(),
      };

      const recordId = `fuel_${effectiveRiderId}_${Date.now()}`;
      const offlineRecord = { ...payload, id: recordId, rider_id: effectiveRiderId };

      console.log('💾 Saving entry:', { recordId, riderId: effectiveRiderId, cost: totalCost });

      // ALWAYS save locally first
      const localSaveSuccess = LocalStore.set(
        `fuel_entry_${recordId}`, 
        JSON.stringify(offlineRecord)
      );
      
      if (!localSaveSuccess) {
        showCriticalError('Failed to save locally. Storage may be full.', 'storage');
        setSaving(false);
        return;
      }

      // Update cache immediately for instant UI feedback
      updateFuelHistoryCache(offlineRecord);

      // Add to sync queue for background sync
      const queueSuccess = await addToSyncQueue({
        id: recordId,
        type: 'fuel_entry',
        endpoint: `/fuel-maintenance/fuel-entry?rider_id=${effectiveRiderId}`,
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
            `/fuel-maintenance/fuel-entry?rider_id=${effectiveRiderId}`,
            payload
          );

          if (response.status === 200 || response.status === 201) {
            console.log('✅ Synced successfully to API');
            // Success - show brief confirmation
            setSuccessMessage(`${isElectric ? 'Battery' : 'Fuel'} cost recorded!`);
            
            // Navigate after brief success message
            setTimeout(() => {
              navigation.navigate('FuelHistory');
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
      setSuccessMessage(`${isElectric ? 'Battery' : 'Fuel'} cost saved. Syncing...`);
      
      setTimeout(() => {
        navigation.navigate('FuelHistory');
      }, 800);

    } catch (err) {
      console.error('❌ Save error:', err);
      showCriticalError(
        err.response?.data?.detail || 'Failed to save entry. Please try again.',
        'save_error'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!effectiveRiderId || !isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label="← Back" />
        <Text style={styles.title}>{title}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label="← Back" />
      <Text style={styles.title}>{title}</Text>

      {/* CRITICAL ERROR ONLY - Never show "working offline" message */}
      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SUCCESS MESSAGE - Brief, then disappear */}
      {successMessage && !saving && (
        <View style={styles.successBanner}>
          <Text style={styles.successBannerText}>✅ {successMessage}</Text>
        </View>
      )}

      {/* Input Field - Clean, no clutter */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Total Cost <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 630"
          placeholderTextColor="#b0a89d"
          keyboardType="decimal-pad"
          value={totalCost}
          onChangeText={(val) => {
            setTotalCost(val);
            clearCriticalError();
          }}
          editable={!saving}
        />
        <Text style={styles.hint}>Enter amount in KSh</Text>
      </View>

      {/* Primary Button with loading state */}
      <TouchableOpacity
        style={[
          styles.primaryBtn,
          (saving || !totalCost) && styles.primaryBtnDisabled
        ]}
        onPress={handleSave}
        disabled={saving || !totalCost}
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
            {saving ? 'Saving...' : `Record ${isElectric ? 'Battery' : 'Fuel'} Cost →`}
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
  
  // CRITICAL ERROR ONLY
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

  // Success message
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

  // Input field
  field: { 
    marginBottom: 24 
  },
  label: { 
    fontSize: 11.5, 
    fontWeight: '700', 
    textTransform: 'uppercase', 
    letterSpacing: 0.04, 
    color: '#5b606c', 
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
    color: '#5b606c', 
    fontWeight: '500' 
  },

  // Primary button
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