// rider-app/src/screens/energyHub/FuelEntryScreen.js
// ✅ CRITICAL FIX: Properly await getLocalRiderId() async function
// Previously was returning Promise {<pending>} causing [object Promise] in keys

import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { addToSyncQueue } from '../../offline/syncQueue';

export default function FuelEntryScreen({ bikeProfile, navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [totalCost, setTotalCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isOffline, setIsOffline] = useState(false);

  const isElectric = bikeProfile?.fuelType === 'electric';
  const title = isElectric ? 'Record Battery Cost' : 'Record Fuel Cost';

  // Load rider ID on mount - PROPERLY AWAIT THE ASYNC FUNCTION
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId(); // ✅ AWAIT the async function
        if (id) {
          setLocalRiderId(id);
          console.log('✅ FuelEntryScreen: Loaded rider ID:', id);
        } else {
          console.warn('⚠️ FuelEntryScreen: No rider ID found');
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  /**
   * ✅ UPDATE CACHE: Add new entry to the fuel_history cache
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
      } else {
        console.warn('⚠️ Failed to update fuel_history cache');
      }
    } catch (err) {
      console.error('❌ Error updating cache:', err);
    }
  };

  const handleSave = async () => {
    try {
      // Validation
      if (!totalCost || parseFloat(totalCost) <= 0) {
        setError('Please enter a valid cost');
        return;
      }

      if (!effectiveRiderId) {
        setError('Rider ID not available. Please restart the app.');
        console.error('❌ No effective rider ID:', { localRiderId, stateRiderId: state?.riderId });
        return;
      }

      setSaving(true);
      setError('');

      const payload = {
        mode: isElectric ? 'charging' : 'petrol',
        cost: parseFloat(totalCost),
        created_at: new Date().toISOString(),
      };

      const recordId = `fuel_${effectiveRiderId}_${Date.now()}`;
      const offlineRecord = { ...payload, id: recordId, rider_id: effectiveRiderId };

      console.log('💾 Saving entry:', { recordId, riderId: effectiveRiderId, cost: totalCost });

      // Save locally
      const localSaveSuccess = LocalStore.set(`fuel_entry_${recordId}`, JSON.stringify(offlineRecord));
      if (!localSaveSuccess) {
        throw new Error('Failed to save to local storage');
      }

      // ✅ UPDATE CACHE IMMEDIATELY
      updateFuelHistoryCache(offlineRecord);

      // Add to sync queue
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

      // Try to sync immediately
      let syncSuccess = false;
      try {
        console.log('📡 Attempting to sync to API...');
        const response = await api.post(
          `/fuel-maintenance/fuel-entry?rider_id=${effectiveRiderId}`,
          payload
        );

        if (response.status === 200 || response.status === 201) {
          syncSuccess = true;
          setIsOffline(false);
          console.log('✅ Synced successfully to API');
        }
      } catch (apiErr) {
        console.warn('⚠️ API sync failed (will retry later):', {
          status: apiErr.response?.status,
          message: apiErr.message,
          data: apiErr.response?.data,
        });
        setIsOffline(true);
        // This is OK - data is queued locally
      }

      // Navigate after delay to FuelHistory (which will now show the new entry)
      setTimeout(() => {
        navigation.navigate('FuelHistory');
      }, 1000);

    } catch (err) {
      console.error('❌ Save error:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  if (!effectiveRiderId) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label="← Back" />
        <Text style={styles.title}>{title}</Text>
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>❌ Rider ID not found. Restart the app.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label="← Back" />
      <Text style={styles.title}>{title}</Text>

      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📶 Working Offline · Will sync when connected</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      <View style={styles.field}>
        <Text style={styles.label}>Total Cost <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 630"
          placeholderTextColor="#b0a89d"
          keyboardType="decimal-pad"
          value={totalCost}
          onChangeText={setTotalCost}
          editable={!saving}
        />
        <Text style={styles.hint}>Enter amount in KSh</Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, (saving || !totalCost) && styles.primaryBtnDisabled]}
        onPress={handleSave}
        disabled={saving || !totalCost}
      >
        <Text style={styles.primaryBtnText}>
          {saving ? 'Saving...' : `Record ${isElectric ? 'Battery' : 'Fuel'} Cost →`}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 20 },
  offlineBanner: { backgroundColor: '#fff9e6', borderWidth: 1.5, borderColor: '#ffe6b3', borderRadius: 14, padding: 12, marginBottom: 14 },
  offlineBannerText: { fontSize: 11.5, color: '#b88900', fontWeight: '600' },
  errorBanner: { backgroundColor: '#fdecea', borderWidth: 1.5, borderColor: '#f6cac7', borderRadius: 14, padding: 12, marginBottom: 14 },
  errorBannerText: { fontSize: 11.5, color: '#a5312c', fontWeight: '600' },
  field: { marginBottom: 16 },
  label: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.04, color: '#5b606c', marginBottom: 7 },
  required: { color: '#e5650a' },
  input: { width: '100%', padding: 13, borderRadius: 12, borderWidth: 1.5, borderColor: '#e7e4db', fontSize: 15, backgroundColor: '#fff', color: '#1a1c20' },
  hint: { fontSize: 11.5, color: '#5b606c', marginTop: 6 },
  primaryBtn: { backgroundColor: '#ff7a1a', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10, shadowColor: '#ff7a1a', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  primaryBtnDisabled: { backgroundColor: '#e9dccc', shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});