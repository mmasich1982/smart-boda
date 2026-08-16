// rider-app/src/screens/SyncQueueScreen.js
/**
 * COMPLETE SYNC QUEUE SCREEN (RA-04-C, RA-04-D)
 * Production-ready with proper Rider ID handling
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ScrollView, View, Text, TouchableOpacity, StyleSheet, 
  ActivityIndicator, RefreshControl
} from 'react-native';
import { useRider } from '../rider/RiderContext';
import { getLocalRiderId } from '../offline/db';
import BackLink from '../components/BackLink';
import PrimaryButton from '../components/PrimaryButton';
import { useToast } from '../components/Toast';
import colors from '../theme/colors';
import api from '../api/client';

export default function SyncQueueScreenComplete({ navigation }) {
  const { state: riderState, dispatch } = useRider();
  const { showToast } = useToast();

  const [localRiderId, setLocalRiderId] = useState(null);
  const [syncData, setSyncData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // ✅ CRITICAL: Load Rider ID from local storage
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

  // ✅ Get effective rider ID
  const effectiveRiderId = localRiderId || riderState?.riderId;

  // Fetch sync data on focus
  useFocusEffect(
    useCallback(() => {
      if (effectiveRiderId) {
        loadSyncStatus();
      } else {
        setLoading(false);
      }
    }, [effectiveRiderId])
  );

  const loadSyncStatus = async () => {
    try {
      setLoading(true);
      const res = await api.get('/sync/status', {
        params: { rider_id: effectiveRiderId }
      });
      setSyncData(res.data);
    } catch (err) {
      console.error('Error loading sync status:', err);
      showToast('Error loading sync status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadSyncStatus().finally(() => setRefreshing(false));
  }, [effectiveRiderId]);

  const handleRetryNow = async () => {
    try {
      setRetrying(true);
      await api.post('/sync/retry', null, {
        params: { rider_id: effectiveRiderId }
      });
      showToast('Retrying failed items...', 'success');
      setTimeout(loadSyncStatus, 1000);
    } catch (err) {
      console.error('Error retrying sync:', err);
      showToast('Failed to retry sync', 'error');
    } finally {
      setRetrying(false);
    }
  };

  if (!effectiveRiderId) {
    return (
      <View style={styles.container}>
        <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />
        <Text style={styles.errorText}>Unable to load rider information</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <ActivityIndicator size="large" color={colors.bodaOrange} />
      </View>
    );
  }

  if (!syncData) {
    return (
      <View style={styles.container}>
        <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />
        <Text style={styles.errorText}>Unable to load sync information</Text>
      </View>
    );
  }

  const hrsSinceSync = syncData.hours_since_last_sync || 0;
  const queuedTrips = syncData.queued_trips || [];
  const failedTrips = syncData.failed_trips || [];
  const isOnline = syncData.connectivity_status === 'online';
  const pendingRegistration = syncData.pending_registration || false;
  const canRetry = failedTrips.length > 0 && syncData.auto_retry_failed;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />

      <Text style={styles.title}>Sync Queue</Text>
      <Text style={styles.subtitle}>Monitor your offline data queue and sync status</Text>

      {/* STATUS CARD */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📡 Sync Status</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Last Sync</Text>
          <Text style={styles.value}>
            {syncData.last_sync_time 
              ? new Date(syncData.last_sync_time).toLocaleTimeString()
              : '—'}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Hours Since</Text>
          <Text style={styles.value}>{hrsSinceSync.toFixed(1)}h</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Connectivity</Text>
          <View style={[
            styles.statusPill,
            isOnline ? styles.statusOnline : styles.statusOffline
          ]}>
            <Text style={styles.statusText}>
              {isOnline ? '🟢 Online' : '🔴 Offline'}
            </Text>
          </View>
        </View>
      </View>

      {/* PENDING REGISTRATION BANNER */}
      {pendingRegistration && (
        <View style={[styles.banner, styles.bannerInfo]}>
          <Text style={styles.bannerText}>
            ℹ️ Your registration is queued and will complete on next sync.
          </Text>
        </View>
      )}

      {/* QUEUED TRIPS */}
      {queuedTrips.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⏳ Queued Trips ({queuedTrips.length})</Text>
          {queuedTrips.map((trip, idx) => (
            <View key={idx} style={styles.tripItem}>
              <View style={styles.tripContent}>
                <Text style={styles.tripMethod}>
                  {trip.method} · KSh {trip.amount?.toLocaleString() || '0'}
                </Text>
                <Text style={styles.tripTime}>
                  {new Date(trip.timestamp).toLocaleTimeString()}
                </Text>
              </View>
              <View style={[styles.tripStatus, styles.tripQueued]}>
                <Text style={styles.tripStatusText}>📋 Queued</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* FAILED TRIPS */}
      {failedTrips.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>❌ Failed Syncs ({failedTrips.length})</Text>
          {failedTrips.map((trip, idx) => (
            <View key={idx} style={styles.tripItem}>
              <View style={styles.tripContent}>
                <Text style={styles.tripMethod}>
                  {trip.method} · KSh {trip.amount?.toLocaleString() || '0'}
                </Text>
                <Text style={styles.tripError}>{trip.error_message || 'Unknown error'}</Text>
              </View>
              <View style={[styles.tripStatus, styles.tripFailed]}>
                <Text style={styles.tripStatusText}>🔄 Failed</Text>
              </View>
            </View>
          ))}

          {/* RETRY BUTTON */}
          {canRetry && (
            <PrimaryButton
              label={retrying ? 'Retrying...' : 'Retry Now'}
              onPress={handleRetryNow}
              disabled={retrying}
              style={{ marginTop: 12 }}
            />
          )}
        </View>
      )}

      {/* NO PENDING ITEMS */}
      {queuedTrips.length === 0 && failedTrips.length === 0 && (
        <View style={[styles.card, styles.emptyState]}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyTitle}>All Clear!</Text>
          <Text style={styles.emptyMessage}>
            No pending items. Your data is synced.
          </Text>
        </View>
      )}

      {/* INFO SECTION */}
      <View style={[styles.card, styles.infoCard]}>
        <Text style={styles.infoTitle}>ℹ️ How Sync Works</Text>
        <Text style={styles.infoText}>
          • Automatic background sync runs every time you reconnect online{'\n'}
          • Queued items wait for connectivity or manual retry{'\n'}
          • Failed items show error details above{'\n'}
          • Your data is safe — nothing is lost
        </Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: colors.signalRed,
    textAlign: 'center',
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.inkSoft,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.bodaOrange,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  label: {
    fontSize: 12,
    color: colors.inkSoft,
    fontWeight: '600',
  },
  value: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusOnline: {
    backgroundColor: '#e6f5ef',
  },
  statusOffline: {
    backgroundColor: '#fdecea',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  banner: {
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  bannerInfo: {
    backgroundColor: '#f0f8ff',
    borderLeftColor: '#0066cc',
  },
  bannerText: {
    fontSize: 12,
    color: colors.ink,
    fontWeight: '600',
    lineHeight: 1.5,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 10,
  },
  tripItem: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripContent: {
    flex: 1,
  },
  tripMethod: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 2,
  },
  tripTime: {
    fontSize: 11,
    color: colors.inkSoft,
  },
  tripError: {
    fontSize: 11,
    color: colors.signalRed,
    marginTop: 2,
  },
  tripStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  tripQueued: {
    backgroundColor: '#fdf3df',
  },
  tripFailed: {
    backgroundColor: '#fdecea',
  },
  tripStatusText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.ink,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 4,
  },
  emptyMessage: {
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: '#f0f8ff',
    borderColor: '#0066cc',
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 11,
    color: colors.ink,
    lineHeight: 1.6,
  },
});