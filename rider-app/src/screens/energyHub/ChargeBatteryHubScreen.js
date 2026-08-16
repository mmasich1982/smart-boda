// rider-app/src/screens/energyHub/ChargeBatteryHubScreen.js
// ✅ Charge Battery Hub - Shows odometer, entry button, history link
// FIXED: Removed odometer add/update button and fixed nested Text components

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';

export default function ChargeBatteryHubScreen({ navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(true);

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

  // ✅ FIXED: Removed odometer and battery range fetching - not needed for this view
  useEffect(() => {
    if (!effectiveRiderId) {
      setLoading(false);
      return;
    }
    
    setLoading(false);
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

      {/* ✅ FIXED: Removed Odometer card per requirements - only show Entry and History */}
      
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

  primaryBtn: { backgroundColor: '#ff7a1a', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 16, shadowColor: '#ff7a1a', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  settingsList: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 12, overflow: 'hidden' },
  settingsItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f0ede7' },
  settingsItemText: { fontSize: 14, fontWeight: '600', color: '#1a1c20' },
  arrow: { fontSize: 16, color: '#5b606c', fontWeight: '700' },
});