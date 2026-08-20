// rider-app/src/screens/serviceHub/MaintenanceEntryScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Silent sync, clean UI, immediate feedback
// Automatic cache update for instant history display

import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, Picker, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';

const SERVICE_TYPES = [
  { code: 'oil_change', display: 'Oil Change', icon: '🛢️', isDated: true },
  { code: 'chain_sprocket', display: 'Chain & Sprocket', icon: '⛓️', isDated: false },
  { code: 'brake_pads', display: 'Brake Pads', icon: '🛑', isDated: false },
  { code: 'tyres', display: 'Tyres', icon: '🛞', isDated: false },
  { code: 'general_service', display: 'General Service', icon: '🔧', isDated: true },
  { code: 'other', display: 'Other', icon: '✳️', isDated: false },
];

export default function MaintenanceEntryScreen({ navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [oilTypes, setOilTypes] = useState([]);
  const [selectedServiceType, setSelectedServiceType] = useState('');
  const [selectedOilType, setSelectedOilType] = useState('');
  const [cost, setCost] = useState('');
  const [odometer, setOdometer] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  const selectedService = SERVICE_TYPES.find(s => s.code === selectedServiceType);
  const isDatedService = selectedService?.isDated || false;

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

  // Load oil types (cache locally)
  useEffect(() => {
    const loadOilTypes = async () => {
      try {
        // Try cache first
        const cached = LocalStore.get('oil_types_cache');
        if (cached) {
          try {
            setOilTypes(JSON.parse(cached));
            console.log('✅ Loaded oil types from cache');
          } catch (e) {
            console.warn('Cache parse error, fetching fresh');
          }
        }

        // Try to fetch fresh data if online
        if (isConnected && isInitialized) {
          try {
            const response = await api.get('/fuel-maintenance/oil-types');
            const types = response.data?.oil_types || [];
            setOilTypes(types);
            LocalStore.set('oil_types_cache', JSON.stringify(types));
            console.log('✅ Fetched and cached oil types');
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
  }, [isConnected, isInitialized]);

  const effectiveRiderId = localRiderId || state?.riderId;

  /**
   * ✅ UPDATE CACHE: Add new entry to maintenance_history cache
   * This ensures MaintenanceHistoryScreen displays the entry immediately
   */
  const updateMaintenanceHistoryCache = (offlineRecord) => {
    try {
      const cacheKey = `maintenance_history_${effectiveRiderId}`;
      
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
      
      // Limit cache to 100 entries (API also limits to 50)
      items = items.slice(0, 100);
      
      // Save updated cache
      const success = LocalStore.set(cacheKey, JSON.stringify(items));
      if (success) {
        console.log(`✅ Updated maintenance_history cache with new entry`);
      }
    } catch (err) {
      console.error('❌ Error updating cache:', err);
    }
  };

  const handleSave = async () => {
    try {
      // Validation
      if (!selectedServiceType) {
        showCriticalError('Select a service type', 'validation');
        return;
      }

      if (!cost || parseFloat(cost) <= 0) {
        showCriticalError('Please enter a valid cost amount', 'validation');
        return;
      }

      if (isDatedService) {
        if (!odometer || parseFloat(odometer) <= 0) {
          showCriticalError('Enter the odometer reading at time of service', 'validation');
          return;
        }
        if (!selectedOilType) {
          showCriticalError('Select an Oil Type', 'validation');
          return;
        }
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
        service_type_code: selectedServiceType,
        cost: parseFloat(cost),
        created_at: new Date().toISOString(),
      };

      if (isDatedService) {
        payload.odometer_reading = parseFloat(odometer);
        payload.oil_type_code = selectedOilType;
      }

      const recordId = `maintenance_${effectiveRiderId}_${Date.now()}`;
      const offlineRecord = { 
        ...payload, 
        id: recordId, 
        rider_id: effectiveRiderId,
        service_type: selectedServiceType,
        oil_type: oilTypes.find(o => o.code === selectedOilType)?.name || null
      };

      console.log('💾 Saving entry:', { recordId, riderId: effectiveRiderId, cost });

      // ALWAYS save locally first
      const localSaveSuccess = LocalStore.set(
        `maintenance_entry_${recordId}`, 
        JSON.stringify(offlineRecord)
      );
      
      if (!localSaveSuccess) {
        showCriticalError('Failed to save locally. Storage may be full.', 'storage');
        setSaving(false);
        return;
      }

      // Update cache immediately for instant UI feedback
      updateMaintenanceHistoryCache(offlineRecord);

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

  if (!effectiveRiderId || !isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label="← Back" />
        <Text style={styles.title}>Record Service Cost</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label="← Back" />
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

      {/* Service Type Tiles */}
      <Text style={styles.label}>Service Type <Text style={styles.required}>*</Text></Text>
      <View style={styles.tileGrid}>
        {SERVICE_TYPES.map((serviceType) => (
          <TouchableOpacity
            key={serviceType.code}
            style={[styles.tile, selectedServiceType === serviceType.code && styles.tileSelected]}
            onPress={() => {
              setSelectedServiceType(serviceType.code);
              clearCriticalError();
              // Reset dated fields when switching service type
              if (!serviceType.isDated) {
                setOdometer('');
                setSelectedOilType('');
              }
            }}
            disabled={saving}
          >
            <Text style={styles.tileEmoji}>{serviceType.icon}</Text>
            <Text style={[styles.tileLbl, selectedServiceType === serviceType.code && styles.tileLblSelected]}>
              {serviceType.display}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Conditional Fields - Only for Oil Change or General Service */}
      {isDatedService && (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Oil Type <Text style={styles.required}>*</Text></Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedOilType}
                onValueChange={setSelectedOilType}
                style={styles.picker}
                enabled={!saving}
              >
                <Picker.Item label="Select..." value="" />
                {oilTypes.map((oil) => (
                  <Picker.Item
                    key={oil.code}
                    label={`${oil.name} — every ${oil.interval_km?.toLocaleString() || '?'} km`}
                    value={oil.code}
                  />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Odometer Reading Now <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 12500"
              placeholderTextColor="#b0a89d"
              keyboardType="number-pad"
              value={odometer}
              onChangeText={setOdometer}
              editable={!saving}
            />
            <Text style={styles.hint}>Enter today's reading. Next service odometer will be auto-calculated.</Text>
          </View>
        </>
      )}

      {/* Service Cost - Always show */}
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
          (saving || !selectedServiceType || !cost || (isDatedService && (!odometer || !selectedOilType))) &&
            styles.primaryBtnDisabled,
        ]}
        onPress={handleSave}
        disabled={saving || !selectedServiceType || !cost || (isDatedService && (!odometer || !selectedOilType))}
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
    marginBottom: 12 
  },
  required: { 
    color: '#e5650a' 
  },

  // Tile Grid Layout
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  tile: {
    width: '48%',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileSelected: {
    backgroundColor: '#fff3e0',
    borderColor: '#ff7a1a',
  },
  tileEmoji: { fontSize: 28, marginBottom: 8 },
  tileLbl: { fontSize: 12, fontWeight: '600', color: '#5b606c', textAlign: 'center' },
  tileLblSelected: { color: '#ff7a1a' },

  field: { 
    marginBottom: 16 
  },
  input: { 
    width: '100%', 
    padding: 13, 
    borderRadius: 12, 
    borderWidth: 1.5, 
    borderColor: '#e7e4db', 
    fontSize: 15, 
    backgroundColor: '#fff', 
    color: '#1a1c20',
    marginBottom: 8
  },
  pickerContainer: { borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' },
  picker: { height: 50, color: '#1a1c20' },
  hint: { 
    fontSize: 11.5, 
    color: '#5b606c', 
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