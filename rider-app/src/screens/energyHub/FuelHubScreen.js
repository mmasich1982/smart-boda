// rider-app/src/screens/energyHub/FuelHubScreen.js
// ✅ CORRECTED: Synchronous LocalStore, proper error handling

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { hoursSinceLastSync, getQueuedRecords } from '../../offline/syncQueue';

export default function FuelHubScreen({ bikeProfile, navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [odometer, setOdometer] = useState(null);
  const [batteryRange, setBatteryRange] = useState(null);
  const [error, setError] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [hoursSinceSync, setHoursSinceSync] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);

  const isElectric = bikeProfile?.fuelType === 'electric';
  const title = isElectric ? 'Charge Battery' : 'Fuel Motorcycle';
  const mainLabel = isElectric ? '🔋 Record Battery Cost' : '⛽ Record Fuel Cost';
  const historyLabel = isElectric ? 'Battery Cost History' : 'Fuel Cost History';

  // ✅ Load rider ID on mount
  useEffect(() => {
    try {
      const id = getLocalRiderId();
      if (id) {
        setLocalRiderId(id);
        console.log('✅ FuelHubScreen: Loaded rider ID:', id);
      } else {
        console.warn('⚠️ FuelHubScreen: No rider ID found');
      }

      // Also check sync status
      const hours = hoursSinceLastSync();
      setHoursSinceSync(hours);

      const queued = getQueuedRecords();
      setQueuedCount(queued.length);
    } catch (err) {
      console.error('❌ Error loading initial state:', err);
    }
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  // Load odometer and battery data
  useEffect(() => {
    let isMounted = true;

    if (!effectiveRiderId) {
      console.warn('⚠️ No effective rider ID available');
      setLoading(false);
      return;
    }

    async function fetchData() {
      try {
        setLoading(true);
        setError('');

        console.log('📡 Fetching hub data for rider:', effectiveRiderId);

        const params = { 
          rider_id: effectiveRiderId, 
          ...(bikeProfile?.id && { bike_id: bikeProfile.id })
        };

        // Try to get from cache first
        const cacheKey = `fuel_hub_${effectiveRiderId}`;
        const cachedDataStr = LocalStore.get(cacheKey);
        
        if (cachedDataStr) {
          try {
            const cachedData = JSON.parse(cachedDataStr);
            setOdometer(cachedData.odometer || 0);
            if (isElectric && cachedData.batteryRange) {
              setBatteryRange(cachedData.batteryRange);
            }
            console.log('✅ Loaded from cache');
          } catch (e) {
            console.warn('⚠️ Cache parse error');
          }
        }

        // Try fresh API call
        try {
          const odometerRes = await api.get('/fuel-maintenance/odometer', { params });
          const odometerValue = odometerRes?.data?.odometer || 0;

          let batteryRangeValue = null;
          if (isElectric) {
            try {
              const batteryRes = await api.get('/fuel-maintenance/battery-range', { params });
              batteryRangeValue = batteryRes?.data?.remaining_km || null;
            } catch (batteryErr) {
              console.warn('⚠️ Battery range fetch failed:', batteryErr.message);
            }
          }

          if (isMounted) {
            setOdometer(odometerValue);
            if (isElectric && batteryRangeValue !== null) {
              setBatteryRange(batteryRangeValue);
            }

            // Update cache
            LocalStore.set(cacheKey, JSON.stringify({
              odometer: odometerValue,
              batteryRange: batteryRangeValue,
              timestamp: new Date().toISOString(),
            }));

            setError('');
            setIsOffline(false);
            console.log('✅ Fetched fresh data from API');
          }
        } catch (apiErr) {
          console.error('❌ API Error:', {
            status: apiErr.response?.status,
            message: apiErr.message,
            url: apiErr.config?.url,
          });

          // Only show error if we have no cache
          if (!odometer) {
            setError('Unable to load. Please check your connection.');
            setIsOffline(true);
          }
        }
      } catch (err) {
        console.error('❌ Fetch error:', err);
        if (isMounted) {
          setError('Failed to load hub data');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => { isMounted = false; };
  }, [effectiveRiderId, bikeProfile?.id, isElectric]);

  const handleFuelEntry = useCallback(() => {
    if (!effectiveRiderId) {
      setError('Rider ID not available. Please restart the app.');
      return;
    }
    
    if (isElectric) {
      navigation.navigate('BatteryEntry');
    } else {
      navigation.navigate('FuelEntry');
    }
  }, [isElectric, effectiveRiderId, navigation]);

  const handleHistory = useCallback(() => {
    navigation.navigate('FuelHistory');
  }, [navigation]);

  if (loading && !isOffline && !odometer) {
    return (
      <View style={styles.container}>
        <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
        <Text style={styles.title}>{title}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <Text style={styles.title}>{title}</Text>

      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📶 Offline · Last synced {hoursSinceSync}h ago</Text>
        </View>
      )}

      {queuedCount > 0 && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingBannerText}>⏳ {queuedCount} pending operation{queuedCount !== 1 ? 's' : ''}</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>⚠️ {error}</Text>
        </View>
      )}

      {isElectric && odometer !== null && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🛣️ Odometer</Text>
          <Text style={styles.odometerValue}>
            {`${odometer.toLocaleString()} km`}
          </Text>
          {batteryRange !== null && (
            <Text style={[styles.hint, batteryRange <= 5 && styles.hintWarning]}>
              {batteryRange <= 5 ? '🔋 ' : ''}About {Math.max(0, Math.round(batteryRange))} km left
            </Text>
          )}
        </View>
      )}

      <TouchableOpacity 
        style={[styles.primaryBtn, (!effectiveRiderId || loading) && styles.primaryBtnDisabled]}
        onPress={handleFuelEntry}
        disabled={!effectiveRiderId || loading}
      >
        <Text style={styles.primaryBtnText}>{mainLabel} →</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.listItem} onPress={handleHistory}>
        <Text style={styles.listItemText}>📜 {historyLabel}</Text>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 24, fontWeight: '700', color: '#1a1c20', marginBottom: 20 },
  offlineBanner: { backgroundColor: '#fff9e6', borderWidth: 1.5, borderColor: '#ffe6b3', borderRadius: 14, padding: 12, marginBottom: 8 },
  offlineBannerText: { fontSize: 11.5, color: '#b88900', fontWeight: '600' },
  pendingBanner: { backgroundColor: '#e8f4f8', borderWidth: 1.5, borderColor: '#b3dce8', borderRadius: 14, padding: 12, marginBottom: 8 },
  pendingBannerText: { fontSize: 11.5, color: '#1b5e7a', fontWeight: '600' },
  errorBanner: { backgroundColor: '#fdecea', borderWidth: 1.5, borderColor: '#f6cac7', borderRadius: 14, padding: 12, marginBottom: 16 },
  errorBannerText: { fontSize: 11.5, color: '#a5312c', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 16, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: '#5b606c', textTransform: 'uppercase', marginBottom: 8 },
  odometerValue: { fontSize: 20, fontWeight: '800', color: '#1a1c20', marginBottom: 10 },
  hint: { fontSize: 12, color: '#5b606c', lineHeight: 18 },
  hintWarning: { color: '#e0453f', fontWeight: '600' },
  primaryBtn: { backgroundColor: '#ff7a1a', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 12, shadowColor: '#ff7a1a', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  primaryBtnDisabled: { backgroundColor: '#e9dccc', shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 12 },
  listItemText: { fontSize: 14, fontWeight: '600', color: '#1a1c20' },
  arrow: { fontSize: 16, color: '#5b606c', fontWeight: '700' },
});