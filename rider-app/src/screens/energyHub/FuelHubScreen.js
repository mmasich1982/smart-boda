// rider-app/src/screens/energyHub/FuelHubScreen.js
// ✅ Offline-First Pattern 1: Load Data
// ✅ Principle 1: LocalStore First - Cache hub data
// ✅ Principle 3: getLocalRiderId Always
// ✅ Principle 4: API with Fallback - Try API, fallback to cache
// ✅ Principle 5: Sync Queue - Display sync status

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { hoursSinceLastSync } from '../../offline/syncQueue';

export default function FuelHubScreen({ bikeProfile, navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [odometer, setOdometer] = useState(null);
  const [batteryRange, setBatteryRange] = useState(null);
  const [error, setError] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [hoursSinceSync, setHoursSinceSync] = useState(0);

  const isElectric = bikeProfile?.fuelType === 'electric';
  const title = isElectric ? 'Charge Battery' : 'Fuel Motorcycle';
  const mainLabel = isElectric ? '🔋 Record Battery Cost' : '⛽ Record Fuel Cost';
  const historyLabel = isElectric ? 'Battery Cost History' : 'Fuel Cost History';

  // ✅ Principle 3: Load rider ID from offline database on mount
  useEffect(() => {
    async function loadRiderId() {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);
      } catch (err) {
        console.error('Error loading riderId:', err);
      }
    }
    loadRiderId();
  }, []);

  // ✅ Principle 5: Check sync status
  useEffect(() => {
    const hours = hoursSinceLastSync();
    setHoursSinceSync(hours);
  }, []);

  // ✅ Use local storage as primary, fallback to context
  const effectiveRiderId = localRiderId || state?.riderId;

  // ✅ Pattern 1: Load Data - Principle 4: API with Fallback
  // Fetch odometer and battery range with cache fallback
  useEffect(() => {
    let isMounted = true;

    if (!effectiveRiderId) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      try {
        setLoading(true);
        const params = { rider_id: effectiveRiderId, bike_id: bikeProfile?.id };

        // Try to fetch from API
        const odometerPromise = api.get('/fuel-maintenance/odometer', { params });
        const batteryPromise = isElectric ? api.get('/fuel-maintenance/battery-range', { params }) : Promise.resolve(null);

        const [odometerRes, batteryRes] = await Promise.all([odometerPromise, batteryPromise]);

        if (isMounted) {
          setOdometer(odometerRes.data?.odometer || 0);
          
          if (isElectric && batteryRes) {
            setBatteryRange(batteryRes.data?.remaining_km || null);
          }

          // ✅ Principle 1: Cache the hub data for offline use
          LocalStore.set(`fuel_hub_${effectiveRiderId}`, JSON.stringify({
            odometer: odometerRes.data?.odometer || 0,
            batteryRange: batteryRes?.data?.remaining_km || null,
            timestamp: new Date().toISOString(),
          }));

          setError('');
          setIsOffline(false);
        }
      } catch (err) {
        console.error('Fetch error:', err);

        // ✅ Principle 4: Fallback to cache on network error
        if (err.response?.status === 0 || err.message.includes('Network')) {
          try {
            const cached = LocalStore.get(`fuel_hub_${effectiveRiderId}`);
            if (cached && isMounted) {
              const data = JSON.parse(cached);
              setOdometer(data.odometer);
              if (isElectric) {
                setBatteryRange(data.batteryRange);
              }
              setError('');
              setIsOffline(true);
            }
          } catch (e) {
            console.error('Cache load failed:', e);
            setError('Failed to load hub data');
          }
        } else {
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
    if (isElectric) {
      navigation.navigate('BatteryEntry');
    } else {
      navigation.navigate('FuelEntry');
    }
  }, [isElectric, navigation]);

  const handleHistory = useCallback(() => {
    navigation.navigate('FuelHistory');
  }, [navigation]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View>
          <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
        </View>
        <View>
          <Text style={styles.title}>{title}</Text>
        </View>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View>
        <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      </View>
      <View>
        <Text style={styles.title}>{title}</Text>
      </View>

      {/* ✅ Pattern 4: Display Offline Indicator */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📶 Offline · Last synced {hoursSinceSync}h ago</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>⚠️ {error}</Text>
        </View>
      )}

      {/* Odometer Card for Electric Bikes */}
      {isElectric && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🛣️ Odometer</Text>
          <Text style={styles.odometerValue}>
            {odometer !== null ? `${odometer.toLocaleString()} km` : '—'}
          </Text>
          {batteryRange !== null && (
            <Text style={[styles.hint, batteryRange <= 5 && styles.hintWarning]}>
              {batteryRange <= 5 ? '🔋 ' : ''}About {Math.max(0, Math.round(batteryRange))} km left before your battery is expected to run out.
            </Text>
          )}
        </View>
      )}

      {/* Main CTA Button */}
      <TouchableOpacity style={styles.primaryBtn} onPress={handleFuelEntry}>
        <Text style={styles.primaryBtnText}>{mainLabel} →</Text>
      </TouchableOpacity>

      {/* History Link */}
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

  offlineBanner: { backgroundColor: '#fff9e6', borderWidth: 1.5, borderColor: '#ffe6b3', borderRadius: 14, padding: 12, marginBottom: 16 },
  offlineBannerText: { fontSize: 11.5, color: '#b88900', fontWeight: '600' },

  errorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: { fontSize: 11.5, color: '#a5312c', fontWeight: '600' },

  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 12, fontWeight: '700', color: '#5b606c', textTransform: 'uppercase', letterSpacing: 0.03, marginBottom: 8 },
  odometerValue: { fontSize: 20, fontWeight: '800', color: '#1a1c20', marginBottom: 10 },
  hint: { fontSize: 12, color: '#5b606c', lineHeight: 18 },
  hintWarning: { color: '#e0453f', fontWeight: '600' },

  primaryBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    marginBottom: 12,
  },
  listItemText: { fontSize: 14, fontWeight: '600', color: '#1a1c20' },
  arrow: { fontSize: 16, color: '#5b606c', fontWeight: '700' },
});