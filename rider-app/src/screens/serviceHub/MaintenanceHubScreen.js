// rider-app/src/screens/serviceHub/MaintenanceHubScreen.js
// ✅ PATTERN: Uses getLocalRiderId() with RiderContext fallback

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';

export default function MaintenanceHubScreen({ navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dueAlerts, setDueAlerts] = useState([]);
  const [error, setError] = useState('');

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

  useEffect(() => {
    let isMounted = true;

    if (!effectiveRiderId) {
      setLoading(false);
      return;
    }

    async function fetchDueAlerts() {
      try {
        setLoading(true);
        const response = await api.get('/fuel-maintenance/due-alerts', {
          params: { rider_id: effectiveRiderId }
        });

        if (isMounted) {
          setDueAlerts(response.data?.alerts || []);
          setError('');
        }
      } catch (err) {
        if (isMounted) {
          console.error('Fetch error:', err);
          setError('Failed to load service alerts');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchDueAlerts();
    return () => { isMounted = false; };
  }, [effectiveRiderId]);

  const handleAddService = useCallback(() => {
    navigation.navigate('MaintenanceEntry');
  }, [navigation]);

  const handleHistory = useCallback(() => {
    navigation.navigate('MaintenanceHistory');
  }, [navigation]);

  if (loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
        <Text style={styles.title}>Service Motorcycle</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <Text style={styles.title}>Service Motorcycle</Text>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>⚠️ {error}</Text>
        </View>
      )}

      {dueAlerts.length > 0 && (
        <View style={styles.alertsSection}>
          <Text style={styles.alertsTitle}>⚠️ Service Reminders</Text>
          {dueAlerts.map((alert, idx) => (
            <View key={idx} style={[styles.alertCard, alert.severity === 'overdue' && styles.alertOverdue]}>
              <Text style={styles.alertText}>{alert.message}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.primaryBtn} onPress={handleAddService}>
        <Text style={styles.primaryBtnText}>🔧 Record Service Cost →</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.listItem} onPress={handleHistory}>
        <Text style={styles.listItemText}>📜 Service History</Text>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 24, fontWeight: '700', color: '#1a1c20', marginBottom: 20 },

  errorBanner: { backgroundColor: '#fdecea', borderWidth: 1.5, borderColor: '#f6cac7', borderRadius: 14, padding: 12, marginBottom: 16 },
  errorBannerText: { fontSize: 11.5, color: '#a5312c', fontWeight: '600' },

  alertsSection: { marginBottom: 16 },
  alertsTitle: { fontSize: 12, fontWeight: '700', color: '#5b606c', textTransform: 'uppercase', letterSpacing: 0.03, marginBottom: 8 },
  alertCard: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 12, padding: 12, marginBottom: 8 },
  alertOverdue: { borderColor: '#f6cac7', backgroundColor: '#fdecea' },
  alertText: { fontSize: 12, fontWeight: '600', color: '#1a1c20' },

  primaryBtn: { backgroundColor: '#ff7a1a', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 20, alignItems: 'center', marginBottom: 12, shadowColor: '#ff7a1a', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 12, marginBottom: 12 },
  listItemText: { fontSize: 14, fontWeight: '600', color: '#1a1c20' },
  arrow: { fontSize: 16, color: '#5b606c', fontWeight: '700' },
});