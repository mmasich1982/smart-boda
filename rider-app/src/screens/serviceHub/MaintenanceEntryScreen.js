// rider-app/src/screens/serviceHub/MaintenanceEntryScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Silent sync, clean UI, immediate feedback
// ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
// ✅ NETWORK AWARE: Real-time connectivity detection
// ✅ FIXED: Infinite loop resolved with proper dependency management

import React, { useState, useEffect, useRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';

export default function MaintenanceEntryScreen({ navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [oilTypes, setOilTypes] = useState([]);
  const [cost, setCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  // ✅ Track if we've already loaded oil types on mount
  const hasLoadedOilTypesRef = useRef(false);
  
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // Load rider ID on mount
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

  // ✅ LOAD OIL TYPES - Single execution on mount
  useEffect(() => {
    if (hasLoadedOilTypesRef.current) {
      return; // ✅ Exit if already loaded
    }

    let isMounted = true;

    const loadOilTypes = async () => {
      try {
        // Try cache first using IndexedDB
        const cached = await indexedDbAdapter.kvGet('oil_types_cache');
        if (cached) {
          try {
            const types = typeof cached === 'string' ? JSON.parse(cached) : cached;
            if (isMounted) {
              setOilTypes(types);
              console.log('✅ Loaded oil types from cache');
            }
          } catch (e) {
            console.warn('Cache parse error, fetching fresh');
          }
        }

        // Try to fetch fresh data if online
        if (isConnected && isInitialized && isMounted) {
          try {
            const response = await api.get('/fuel-maintenance/oil-types');
            const types = response.data?.oil_types || [];
            if (isMounted) {
              setOilTypes(types);
              // Cache using IndexedDB
              await indexedDbAdapter.kvSet('oil_types_cache', JSON.stringify(types));
              console.log('✅ Fetched and cached oil types');
            }
          } catch (err) {
            console.warn('⚠️ Failed to fetch oil types:', err.message);
            // Use cached data if available
          }
        }
      } catch (err) {
        console.error('❌ Error loading oil types:', err);
      }
    };

    loadOilTypes();
    hasLoadedOilTypesRef.current = true; // ✅ Mark as loaded

    return () => {
      isMounted = false;
    };
  }, [isConnected, isInitialized]);

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
      if (!cost || parseFloat(cost) <= 0) {
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

      const now = Date.now();
      const payload = {
        cost: parseFloat(cost),
        created_at: new Date().toISOString(),
      };

      const recordId = `maintenance_${effectiveRiderId}_${now}`;
      // ✅ CRITICAL: Include timestamp fields for MoneyMasteryScreen period filtering
      const offlineRecord = {
        ...payload,
        id: recordId,
        rider_id: effectiveRiderId,
        ts: now,                                    // ✅ Primary timestamp (ms) for period filtering
        timestamp: now,                             // ✅ Backup timestamp (ms)
        date: new Date().toISOString().split('T')[0], // ✅ Date string for grouping
        status: 'active',                           // ✅ Status tracking
        syncStatus: 'pending',                      // ✅ Sync tracking
      };

      console.log('💾 Saving entry:', { recordId, riderId: effectiveRiderId, cost });

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
            setSuccessMessage(`Service cost recorded!`);
            
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
      setSuccessMessage(`Service cost saved. Syncing...`);
      
      setTimeout(() => {
        navigation.navigate('MaintenanceHistory');
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

  // ✅ FIXED: Proper back navigation with error handling
  const handleBackPress = () => {
    try {
      if (navigation && navigation.canGoBack && navigation.canGoBack()) {
        navigation.goBack();
      } else if (navigation && navigation.navigate) {
        navigation.navigate('Home');
      } else {
        console.warn('⚠️ Navigation not available');
      }
    } catch (err) {
      console.error('❌ Navigation error:', err);
      if (navigation && navigation.navigate) {
        navigation.navigate('Home');
      }
    }
  };

  if (!effectiveRiderId || !isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={handleBackPress} label="← Back" />
        <Text style={styles.title}>Record Service Cost</Text>
        <ActivityIndicator size="large" color="#ffc107" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={handleBackPress} label="← Back" />
      <Text style={styles.title}>Record Service Cost</Text>

      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {successMessage && !saving && (
        <View style={styles.successBanner}>
          <Text style={styles.successBannerText}>✅ {successMessage}</Text>
        </View>
      )}

      {/* Service Cost */}
      <View style={styles.field}>
        <Text style={styles.label}>Service Cost <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 900"
          placeholderTextColor="#b0a89d"
          keyboardType="decimal-pad"
          value={cost}
          onChangeText={(val) => {
            setCost(val);
            clearCriticalError();
          }}
          editable={!saving}
        />
        <Text style={styles.hint}>Enter amount in KSh</Text>
      </View>

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          (saving || !cost) && styles.primaryBtnDisabled,
        ]}
        onPress={handleSave}
        disabled={saving || !cost}
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
            {saving ? 'Saving...' : `Record Service Cost →`}
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

  field: { 
    marginBottom: 24 
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

  primaryBtn: { 
    backgroundColor: '#ffc107', 
    borderRadius: 14, 
    paddingVertical: 16, 
    alignItems: 'center', 
    marginBottom: 16,
    shadowColor: '#ffc107', 
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
    color: '#1a1c20', 
    fontSize: 16, 
    fontWeight: '700',
    letterSpacing: 0.02
  }
});