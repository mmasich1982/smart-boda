// rider-app/src/screens/offline/SyncQueueScreen.js
// ✅ UPDATED: Displays offline sync queue status
// ✅ INDEXED DB: All sync queue data handled via IndexedDB
// ✅ MULTILINGUAL: Full localization support via i18n
// - Shows all pending/failed sync items
// - Allows manual retry of failed items
// - Auto-syncs pending items when online
// - No network errors, only sync status shown
// - UI/UX design preserved exactly

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import BackLink from '../../components/BackLink';
import { getSyncQueue, retryQueueItem, clearQueueItem } from '../../offline/syncQueue';
import { useTranslation } from '../../i18n/LocalizationProvider';

const OPERATION_TYPES = {
  fuel_entry: '⛽ Fuel Entry',
  battery_entry: '🔋 Battery Entry',
  odometer_reading: '📊 Odometer Reading',
  maintenance_entry: '🔧 Maintenance Entry',
  compliance_document: '📋 Compliance Document',
  remittance: '💳 Remittance',
  trip: '🚗 Trip',
  other_expense: '💰 Expense',
  savings_contribution: '🏦 Savings',
  goal_contribution: '🎯 Goal',
  payment: '💵 Payment',
  subscription: '📱 Subscription',
  pin_recovery_request: '🔐 PIN Recovery',
  pin_reset_request: '🔑 PIN Reset',
  trip_void: '🗑 Trip Void',
  statement_request: '📄 Statement',
};

export default function SyncQueueScreen({ navigation }) {
  const { t } = useTranslation();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadQueue = async () => {
    try {
      const items = await getSyncQueue();
      setQueue(items || []);
    } catch (err) {
      console.error('Error loading queue:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();

    // Refresh queue every 5 seconds
    const interval = setInterval(loadQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadQueue();
    setRefreshing(false);
  };

  const handleRetry = async (item) => {
    try {
      const result = await retryQueueItem(item.id);
      if (result) {
        Alert.alert(t('success') || 'Success', t('itemSyncedSuccessfully') || 'Item synced successfully.');
        loadQueue();
      } else {
        Alert.alert(t('failed') || 'Failed', t('unableToSyncItem') || 'Unable to sync item. Please try again.');
      }
    } catch (err) {
      Alert.alert(t('error') || 'Error', t('errorOccurredWhileRetrying') || 'An error occurred while retrying.');
      console.error('Retry error:', err);
    }
  };

  const handleClear = (item) => {
    Alert.alert(
      t('removeFromQueue') || 'Remove from Queue?',
      t('removeFromQueueMessage') || 'This item will be removed from the sync queue and not synced to the server.',
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('remove') || 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearQueueItem(item.id);
              loadQueue();
              Alert.alert(t('removed') || 'Removed', t('itemRemovedFromQueue') || 'Item removed from queue.');
            } catch (err) {
              Alert.alert(t('error') || 'Error', t('couldNotRemoveItem') || 'Could not remove item.');
              console.error('Clear error:', err);
            }
          },
        },
      ]
    );
  };

  const pendingItems = queue.filter((item) => item.status === 'pending');
  const failedItems = queue.filter((item) => item.status === 'failed');

  const renderQueueItem = ({ item }) => {
    const operationLabel = OPERATION_TYPES[item.type] || item.type;
    const attemptCount = item.attempts || 0;
    const lastAttempt = item.lastAttempt
      ? new Date(item.lastAttempt).toLocaleString()
      : t('notAttempted') || 'Not attempted';

    return (
      <View style={[styles.queueItem, item.status === 'failed' && styles.queueItemFailed]}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemType}>{operationLabel}</Text>
          <View
            style={[
              styles.statusBadge,
              item.status === 'pending' && styles.statusPending,
              item.status === 'failed' && styles.statusFailed,
            ]}
          >
            <Text style={styles.statusBadgeText}>
              {item.status === 'pending' ? '⏳ ' + (t('queued') || 'Queued') : '❌ ' + (t('failed') || 'Failed')}
            </Text>
          </View>
        </View>

        <View style={styles.itemDetails}>
          <Text style={styles.detailText}>{t('attempts') || 'Attempts'}: {attemptCount}</Text>
          <Text style={styles.detailText}>{t('last') || 'Last'}: {lastAttempt}</Text>
          {item.error && (
            <Text style={styles.errorText}>{t('error') || 'Error'}: {item.error}</Text>
          )}
        </View>

        <View style={styles.itemActions}>
          {item.status === 'failed' && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleRetry(item)}
            >
              <Text style={styles.actionBtnText}>🔄 {t('retry') || 'Retry'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={() => handleClear(item)}
          >
            <Text style={styles.actionBtnDangerText}>🗑 {t('remove') || 'Remove'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} />
        <Text style={styles.loading}>{t('loadingQueue') || 'Loading queue...'}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      ListHeaderComponent={
        <>
          <BackLink onPress={() => navigation.goBack()} />
          <Text style={styles.title}>{t('syncQueue') || 'Sync Queue'}</Text>

          {queue.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>✓ {t('allSynced') || 'All Synced'}</Text>
              <Text style={styles.emptyStateText}>
                {t('noSyncQueueItems') || 'No pending or failed items. Your data is up to date.'}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.statsCard}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{pendingItems.length}</Text>
                  <Text style={styles.statLabel}>{t('pending') || 'Pending'}</Text>
                </View>
                <View style={styles.statSeparator} />
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{failedItems.length}</Text>
                  <Text style={styles.statLabel}>{t('failed') || 'Failed'}</Text>
                </View>
              </View>

              {pendingItems.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>⏳ {t('pending') || 'Pending'} ({pendingItems.length})</Text>
                  <Text style={styles.sectionSubtitle}>
                    {t('willSyncAutomatically') || 'Will sync automatically when connection is available'}
                  </Text>
                </View>
              )}

              {failedItems.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>❌ {t('failed') || 'Failed'} ({failedItems.length})</Text>
                  <Text style={styles.sectionSubtitle}>
                    {t('tapRetryToSync') || 'Tap "Retry" to sync when ready'}
                  </Text>
                </View>
              )}
            </>
          )}
        </>
      }
      data={queue}
      renderItem={renderQueueItem}
      keyExtractor={(item) => item.id}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListFooterComponent={
        queue.length > 0 ? (
          <View style={styles.footerInfo}>
            <Text style={styles.footerText}>
              {t('syncQueueFooterText') || 'Items in the queue will be automatically synced when your device is online. You can manually retry failed items or remove them from the queue.'}
            </Text>
          </View>
        ) : null
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
      scrollEnabled={true}
      contentContainerStyle={queue.length === 0 ? { flexGrow: 1 } : {}}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f4ef' },

  title: {
    fontSize: 20,
    fontWeight: '700',
    marginHorizontal: 16,
    marginVertical: 12,
    color: '#1a1c20',
  },

  loading: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    marginTop: 20,
    marginHorizontal: 16,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e9e6f',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    lineHeight: 20,
  },

  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ff7a1a',
  },
  statLabel: {
    fontSize: 12,
    color: '#5b606c',
    marginTop: 4,
  },
  statSeparator: {
    width: 1,
    backgroundColor: '#e7e4db',
  },

  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#5b606c',
  },

  queueItem: {
    backgroundColor: '#fff',
    borderLeftWidth: 4,
    borderLeftColor: '#ff7a1a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 8,
  },
  queueItemFailed: {
    borderLeftColor: '#e0453f',
    backgroundColor: '#fafafa',
  },

  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemType: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
    flex: 1,
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#fff3cd',
  },
  statusPending: {
    backgroundColor: '#e3f2fd',
  },
  statusFailed: {
    backgroundColor: '#fdecea',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#656565',
  },

  itemDetails: {
    marginBottom: 10,
  },
  detailText: {
    fontSize: 11,
    color: '#5b606c',
    marginVertical: 2,
  },
  errorText: {
    fontSize: 11,
    color: '#e0453f',
    marginTop: 4,
    fontWeight: '600',
  },

  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#1e9e6f',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  actionBtnDanger: {
    flex: 1,
    backgroundColor: '#e0453f',
  },
  actionBtnDangerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },

  separator: {
    height: 0,
    marginVertical: 0,
  },

  footerInfo: {
    backgroundColor: '#e3f2fd',
    borderTopWidth: 1,
    borderTopColor: '#90caf9',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#01579b',
    lineHeight: 18,
  },
});
