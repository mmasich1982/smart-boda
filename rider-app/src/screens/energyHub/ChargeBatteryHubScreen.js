// rider-app/src/screens/energyHub/ChargeBatteryHubScreen.js
// ✅ Offline-First Pattern 1: Load Data
// ✅ Principle 1: LocalStore First - Cache hub data
// ✅ Principle 3: getLocalRiderId Always
// ✅ Principle 4: API with Fallback (if needed in future)

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';

export default function ChargeBatteryHubScreen({ navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  // ✅ Principle 3: Get rider ID from offline database
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

  const effectiveRiderId = localRiderId || state?.riderId;

  // ✅ Pattern 1: Load Data - Initialize hub
  useEffect(() => {
    let isMounted = true;

    if (!effectiveRiderId) {
      setLoading(false);
      return;
    }

    async function initializeHub() {
      try {
        setLoading(true);
        
        // Cache hub state for offline use
        LocalStore.set(`battery_hub_${effectiveRiderId}`, JSON.stringify({
          initialized: true,
          timestamp: new Date().toISOString(),
        }));
        
        setIsOffline(false);
      } catch (err) {
        console.error('Hub initialization error:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    initializeHub();
    return () => { isMounted = false; };
  }, [effectiveRiderId]);

  if (loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
        <Text style={styles.title}>Charge Battery</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <Text style={styles.title}>Charge Battery</Text>

      {/* ✅ Pattern 4: Display Offline Indicator if needed */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📶 Working Offline</Text>
        </View>
      )}

      {/* Entry Button */}
      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={() => navigation.navigate('BatteryEntry')}
      >
        <Text style={styles.primaryBtnText}>🔋 Enter Battery Charging Cost →</Text>
      </TouchableOpacity>

      {/* History Link */}
      <View style={styles.settingsList}>
        <TouchableOpacity
          style={styles.settingsItem}
          onPress={() => navigation.navigate('BatteryHistory')}
        >
          <Text style={styles.settingsItemText}>📜 Charge Battery Cost History</Text>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 24, fontWeight: '700', color: '#1a1c20', marginBottom: 20 },

  offlineBanner: { backgroundColor: '#fff9e6', borderWidth: 1.5, borderColor: '#ffe6b3', borderRadius: 14, padding: 12, marginBottom: 16 },
  offlineBannerText: { fontSize: 11.5, color: '#b88900', fontWeight: '600' },

  primaryBtn: { backgroundColor: '#ff7a1a', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 16, shadowColor: '#ff7a1a', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  settingsList: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 12, overflow: 'hidden' },
  settingsItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f0ede7' },
  settingsItemText: { fontSize: 14, fontWeight: '600', color: '#1a1c20' },
  arrow: { fontSize: 16, color: '#5b606c', fontWeight: '700' },
});