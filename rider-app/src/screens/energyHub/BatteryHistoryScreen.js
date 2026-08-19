// rider-app/src/screens/energyHub/BatteryHistoryScreen.js
// ✅ Offline-First Pattern 1: Load Data
// ✅ Principle 1: LocalStore First - Cache history
// ✅ Principle 3: getLocalRiderId Always
// ✅ Principle 4: API with Fallback - Try API, fallback to cache
// ✅ Principle 5: Sync Queue - Display pending operations

const PAGE_SIZE = 10;

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { getQueuedRecords, hoursSinceLastSync } from '../../offline/syncQueue';

export default function BatteryHistoryScreen({ navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState('thisMonth');
  const [allEntries, setAllEntries] = useState([]);
  const [isOffline, setIsOffline] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [hoursSinceSync, setHoursSinceSync] = useState(0);

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

  // ✅ Principle 5: Check sync status
  useEffect(() => {
    const hours = hoursSinceLastSync();
    setHoursSinceSync(hours);
    
    const queued = getQueuedRecords();
    setQueuedCount(queued.length);
  }, []);

  const getPeriodRange = useCallback((selectedPeriod) => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1).getTime();

    switch (selectedPeriod) {
      case 'thisMonth':
        return { start: thisMonthStart, end: now.getTime() };
      case 'lastMonth':
        return { start: lastMonthStart, end: thisMonthStart - 1 };
      case 'last6':
        return { start: sixMonthsStart, end: now.getTime() };
      case 'sinceJoining':
        return { start: 0, end: now.getTime() };
      default:
        return { start: thisMonthStart, end: now.getTime() };
    }
  }, []);

  // ✅ Pattern 1: Load Data - Principle 4: API with Fallback
  useEffect(() => {
    let isMounted = true;

    if (!effectiveRiderId) {
      setLoading(false);
      return;
    }

    async function fetchAllEntries() {
      try {
        setLoading(true);
        setError('');

        // Try to fetch from API
        const response = await api.get('/fuel-maintenance/fuel-entry/history', {
          params: {
            rider_id: effectiveRiderId,
            page: 1,
            limit: 50,
          }
        });

        if (isMounted) {
          const items = (response.data?.entries || [])
            .filter(e => e.mode !== 'petrol') // Only battery entries
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

          setAllEntries(items);
          
          // ✅ Principle 1: Cache the result for offline use
          LocalStore.set(`battery_history_${effectiveRiderId}`, JSON.stringify(items));
          setIsOffline(false);
          setPage(1);
        }
      } catch (err) {
        console.error('Fetch error:', err);

        // ✅ Principle 4: Fallback to cache on network error
        if (err.response?.status === 0 || err.message.includes('Network')) {
          try {
            const cached = LocalStore.get(`battery_history_${effectiveRiderId}`);
            if (cached && isMounted) {
              const items = JSON.parse(cached);
              setAllEntries(items);
              setIsOffline(true);
              setError('');
            }
          } catch (e) {
            console.error('Cache load failed:', e);
            setError('Failed to load history');
          }
        } else {
          setError('Failed to load history');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchAllEntries();
    return () => { isMounted = false; };
  }, [effectiveRiderId]);

  useEffect(() => {
    const { start, end } = getPeriodRange(period);
    const filtered = allEntries.filter(e => {
      const ts = new Date(e.created_at).getTime();
      return ts >= start && ts <= end;
    });
    setEntries(filtered);
    setPage(1);
  }, [period, allEntries, getPeriodRange]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pageItems = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalSpent = entries.reduce((sum, e) => sum + (e.cost || 0), 0);

  const getModeLabel = useCallback((mode) => {
    const labels = { swap: '🔋 Battery swap', charging: '🔌 Charging' };
    return labels[mode?.toLowerCase()] || mode;
  }, []);

  const formatDate = useCallback((timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-KE', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  if (loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
        <Text style={styles.title}>Battery Cost History</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <Text style={styles.title}>Charge Battery Cost History</Text>

      {/* ✅ Pattern 4: Display Offline Indicator */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📶 Offline · Last synced {hoursSinceSync}h ago</Text>
        </View>
      )}

      {/* ✅ Principle 5: Display pending sync operations */}
      {queuedCount > 0 && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingBannerText}>⏳ {queuedCount} pending operation{queuedCount !== 1 ? 's' : ''} · Will sync when online</Text>
        </View>
      )}

      {/* Period Tabs */}
      <View style={styles.periodTabs}>
        {['thisMonth', 'lastMonth', 'last6', 'sinceJoining'].map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodTab, period === p && styles.periodTabActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
              {p === 'thisMonth' ? 'This Month' : p === 'lastMonth' ? 'Last Month' : p === 'last6' ? '6 Months' : 'Since Joining'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      {/* Summary Card */}
      <View style={styles.card}>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Total Spent</Text>
          <Text style={styles.kvValue}>KSh {totalSpent.toLocaleString()}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Entries Logged</Text>
          <Text style={styles.kvValue}>{entries.length}</Text>
        </View>
      </View>

      {/* Entries Card */}
      <View style={styles.card}>
        {pageItems.length > 0 ? (
          pageItems.map((entry, idx) => (
            <View key={idx} style={styles.tripRow}>
              <View style={styles.tripRowLeft}>
                <Text style={styles.tripRowMode}>{getModeLabel(entry.mode)}</Text>
                <Text style={styles.tripRowTime}>
                  {formatDate(entry.created_at)}
                  {entry.odometer_reading ? ` · ${entry.odometer_reading.toLocaleString()} km` : ''}
                </Text>
              </View>
              <View style={styles.tripRowRight}>
                <Text style={styles.tripRowAmount}>KSh {entry.cost.toLocaleString()}</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyHint}>No entries for this period.</Text>
        )}
      </View>

      {/* Pagination */}
      {totalPages > 1 && (
        <View style={styles.paginationContainer}>
          <Text style={styles.paginationMeta}>
            Showing {pageItems.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, entries.length)} of {entries.length}
          </Text>
          <View style={styles.pagination}>
            <TouchableOpacity
              style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
              onPress={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              <Text style={styles.pageBtnText}>‹</Text>
            </TouchableOpacity>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.pageBtn, p === page && styles.pageBtnActive]}
                onPress={() => setPage(p)}
              >
                <Text style={[styles.pageBtnText, p === page && styles.pageBtnTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.pageBtn, page === totalPages && styles.pageBtnDisabled]}
              onPress={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              <Text style={styles.pageBtnText}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f4ef', padding: 0 },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 24, fontWeight: '700', color: '#1a1c20', marginBottom: 16, paddingHorizontal: 20, marginTop: 16 },

  offlineBanner: { backgroundColor: '#fff9e6', borderWidth: 1.5, borderColor: '#ffe6b3', borderRadius: 14, padding: 12, marginHorizontal: 20, marginBottom: 8 },
  offlineBannerText: { fontSize: 11.5, color: '#b88900', fontWeight: '600' },

  pendingBanner: { backgroundColor: '#e8f4f8', borderWidth: 1.5, borderColor: '#b3dce8', borderRadius: 14, padding: 12, marginHorizontal: 20, marginBottom: 8 },
  pendingBannerText: { fontSize: 11.5, color: '#1b5e7a', fontWeight: '600' },

  periodTabs: { flexDirection: 'row', gap: 8, marginHorizontal: 20, marginBottom: 16 },
  periodTab: { flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#e7e4db', backgroundColor: '#fff', alignItems: 'center' },
  periodTabActive: { backgroundColor: '#ff7a1a', borderColor: '#ff7a1a' },
  periodTabText: { fontSize: 11, fontWeight: '600', color: '#5b606c' },
  periodTabTextActive: { color: '#fff' },

  errorBanner: { backgroundColor: '#fdecea', borderWidth: 1.5, borderColor: '#f6cac7', borderRadius: 14, padding: 12, marginHorizontal: 20, marginBottom: 14 },
  errorBannerText: { fontSize: 11.5, color: '#a5312c', fontWeight: '600' },

  card: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 16, padding: 16, marginHorizontal: 20, marginBottom: 12 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  kvLabel: { fontSize: 12, color: '#5b606c', fontWeight: '500' },
  kvValue: { fontSize: 14, fontWeight: '700', color: '#1a1c20' },

  tripRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0ede7' },
  tripRowLeft: { flex: 1 },
  tripRowMode: { fontSize: 13, fontWeight: '600', color: '#1a1c20', marginBottom: 4 },
  tripRowTime: { fontSize: 11, color: '#5b606c', fontWeight: '500' },
  tripRowRight: { justifyContent: 'center' },
  tripRowAmount: { fontSize: 13, fontWeight: '700', color: '#1a1c20', textAlign: 'right' },

  emptyHint: { fontSize: 12, color: '#5b606c', fontWeight: '500', paddingVertical: 12, textAlign: 'center' },

  paginationContainer: { marginHorizontal: 20, marginBottom: 20 },
  paginationMeta: { fontSize: 11, color: '#5b606c', fontWeight: '500', marginBottom: 8, textAlign: 'center' },
  pagination: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  pageBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#e7e4db', backgroundColor: '#fff' },
  pageBtnActive: { backgroundColor: '#ff7a1a', borderColor: '#ff7a1a' },
  pageBtnDisabled: { backgroundColor: '#f0ede7', borderColor: '#e7e4db' },
  pageBtnText: { fontSize: 11, fontWeight: '600', color: '#5b606c' },
  pageBtnTextActive: { color: '#fff' },
});