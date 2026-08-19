import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Alert } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useFocusEffect } from '@react-navigation/native';

const BatteryHistoryScreen = () => {
  const { t } = useTranslation();
  const { state: riderState } = useRider();
  
  const [batteryHistory, setBatteryHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [totalCharges, setTotalCharges] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);

  // Get rider ID
  const getRiderId = useCallback(() => {
    try {
      return getLocalRiderId();
    } catch (err) {
      return riderState?.riderId;
    }
  }, [riderState]);

  // Load battery history
  const loadBatteryHistory = useCallback(async () => {
    const riderId = getRiderId();
    
    if (!riderId) {
      console.error('Rider ID missing');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Try to fetch from API
      const response = await api.get(`/battery/history?rider_id=${riderId}`);
      
      if (response.data) {
        const entries = response.data.entries || response.data || [];
        setBatteryHistory(entries);
        
        // Calculate totals
        const totals = entries.reduce((acc, entry) => {
          return {
            cost: acc.cost + (parseFloat(entry.cost) || 0),
            duration: acc.duration + (parseFloat(entry.duration) || 0),
            charges: acc.charges + 1,
          };
        }, { cost: 0, duration: 0, charges: 0 });
        
        setTotalCost(totals.cost);
        setTotalDuration(totals.duration);
        setTotalCharges(totals.charges);
        
        // ✅ OFFLINE: Cache the history
        try {
          LocalStore.set(`battery_history_${riderId}`, JSON.stringify({
            entries: entries,
            totals: totals,
            cached_at: new Date().toISOString()
          }));
        } catch (cacheErr) {
          console.warn('Failed to cache battery history:', cacheErr);
        }
        
        setIsOffline(false);
      }
    } catch (err) {
      console.error('Error loading battery history:', err);
      
      // ✅ OFFLINE: Load from cache on network error
      if (isNetworkError(err)) {
        try {
          const cached = LocalStore.get(`battery_history_${riderId}`);
          
          if (cached) {
            const { entries, totals } = JSON.parse(cached);
            setBatteryHistory(entries);
            setTotalCost(totals.cost);
            setTotalDuration(totals.duration);
            setTotalCharges(totals.charges);
            setIsOffline(true);
            console.log('✅ Loaded battery history from offline cache');
          } else {
            // Also try to load from local entries
            const localEntries = LocalStore.get(`battery_entries_${riderId}`);
            if (localEntries) {
              const entries = JSON.parse(localEntries);
              setBatteryHistory(entries);
              
              const totals = entries.reduce((acc, entry) => {
                return {
                  cost: acc.cost + (parseFloat(entry.cost) || 0),
                  duration: acc.duration + (parseFloat(entry.duration) || 0),
                  charges: acc.charges + 1,
                };
              }, { cost: 0, duration: 0, charges: 0 });
              
              setTotalCost(totals.cost);
              setTotalDuration(totals.duration);
              setTotalCharges(totals.charges);
              setIsOffline(true);
              console.log('✅ Loaded battery history from local entries');
            } else {
              setBatteryHistory([]);
              setTotalCost(0);
              setTotalDuration(0);
              setTotalCharges(0);
              setIsOffline(true);
            }
          }
        } catch (cacheErr) {
          console.error('Error loading from cache:', cacheErr);
          setIsOffline(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [getRiderId]);

  // Load on mount and focus
  useFocusEffect(
    useCallback(() => {
      loadBatteryHistory();
    }, [loadBatteryHistory])
  );

  // Handle refresh
  const handleRefresh = useCallback(() => {
    loadBatteryHistory();
  }, [loadBatteryHistory]);

  // Delete entry
  const handleDeleteEntry = useCallback((entryId) => {
    Alert.alert(
      t('confirm_delete'),
      t('delete_battery_entry_confirm'),
      [
        { text: t('cancel'), onPress: () => {} },
        {
          text: t('delete'),
          onPress: () => {
            try {
              const riderId = getRiderId();
              const entries = batteryHistory.filter(e => e.id !== entryId);
              
              // Update local storage
              LocalStore.set(`battery_entries_${riderId}`, JSON.stringify(entries));
              
              // Update state
              setBatteryHistory(entries);
              
              // Recalculate totals
              const totals = entries.reduce((acc, entry) => {
                return {
                  cost: acc.cost + (parseFloat(entry.cost) || 0),
                  duration: acc.duration + (parseFloat(entry.duration) || 0),
                  charges: acc.charges + 1,
                };
              }, { cost: 0, duration: 0, charges: 0 });
              
              setTotalCost(totals.cost);
              setTotalDuration(totals.duration);
              setTotalCharges(totals.charges);
              
              Alert.alert(t('success'), t('battery_entry_deleted'));
            } catch (err) {
              Alert.alert(t('error'), t('failed_to_delete_entry'));
            }
          },
          style: 'destructive',
        },
      ]
    );
  }, [batteryHistory, getRiderId, t]);

  if (loading && batteryHistory.length === 0) {
    return (
      <View style={styles.container}>
        <BackLink title={t('battery_cost_history')} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>{t('loading_battery_history')}</Text>
        </View>
      </View>
    );
  }

  const renderBatteryEntry = ({ item }) => (
    <View style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <View>
          <Text style={styles.historyDate}>
            📅 {new Date(item.date || item.created_at).toLocaleDateString()}
          </Text>
          <Text style={styles.historyTime}>
            {new Date(item.date || item.created_at).toLocaleTimeString()}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => handleDeleteEntry(item.id)}
          style={styles.deleteButton}
        >
          <Text style={styles.deleteButtonText}>🗑️</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.historyDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('duration')}</Text>
          <Text style={styles.detailValue}>{item.duration} mins</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('cost')}</Text>
          <Text style={styles.detailValue}>KES {parseFloat(item.cost).toFixed(2)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('cost_per_minute')}</Text>
          <Text style={styles.detailValue}>
            KES {((parseFloat(item.cost) / parseFloat(item.duration)) || 0).toFixed(2)}
          </Text>
        </View>
        {item.battery_percent && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('battery_percent')}</Text>
            <Text style={styles.detailValue}>{item.battery_percent}%</Text>
          </View>
        )}
      </View>
      
      {item.notes && (
        <View style={styles.notesRow}>
          <Text style={styles.notesLabel}>{t('notes')}</Text>
          <Text style={styles.notesText}>{item.notes}</Text>
        </View>
      )}
      
      {!item.synced && (
        <View style={styles.pendingSyncBadge}>
          <Text style={styles.pendingSyncText}>⏳ {t('pending_sync')}</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <BackLink title={t('battery_cost_history')} onRefresh={handleRefresh} />
      
      {/* Offline Indicator */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            📶 {t('working_offline')} - {t('viewing_cached_data')}
          </Text>
        </View>
      )}

      {/* Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('total_cost')}</Text>
          <Text style={styles.summaryValue}>KES {totalCost.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('total_duration')}</Text>
          <Text style={styles.summaryValue}>{totalDuration} mins</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('charges')}</Text>
          <Text style={styles.summaryValue}>{totalCharges}</Text>
        </View>
        {totalDuration > 0 && (
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{t('avg_per_min')}</Text>
            <Text style={styles.summaryValue}>
              KES {(totalCost / totalDuration).toFixed(2)}
            </Text>
          </View>
        )}
      </View>

      {/* History List */}
      {batteryHistory.length > 0 ? (
        <FlatList
          data={batteryHistory}
          renderItem={renderBatteryEntry}
          keyExtractor={(item, index) => item.id || index.toString()}
          scrollEnabled={false}
          contentContainerStyle={styles.historyList}
          ListFooterComponent={<View style={{ height: 20 }} />}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔋</Text>
          <Text style={styles.emptyText}>{t('no_battery_history')}</Text>
          <Text style={styles.emptySubtext}>
            {isOffline ? t('no_cached_battery_data') : t('start_recording_charges')}
          </Text>
        </View>
      )}
    </View>
  );
};

const isNetworkError = (err) => {
  return !err.response || err.code === 'ERR_NETWORK' || err.message.includes('Network');
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 14,
    color: '#666',
  },
  offlineBanner: {
    backgroundColor: '#FFA500',
    padding: 12,
    margin: 10,
    borderRadius: 8,
  },
  offlineText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 15,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-around',
    elevation: 2,
    flexWrap: 'wrap',
  },
  summaryItem: {
    alignItems: 'center',
    width: '25%',
    marginVertical: 5,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 5,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#007AFF',
  },
  historyList: {
    paddingHorizontal: 10,
  },
  historyCard: {
    backgroundColor: '#fff',
    marginVertical: 5,
    padding: 12,
    borderRadius: 8,
    elevation: 1,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  historyDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  historyTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 3,
  },
  deleteButton: {
    padding: 5,
  },
  deleteButtonText: {
    fontSize: 16,
  },
  historyDetails: {
    backgroundColor: '#f9f9f9',
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  notesRow: {
    backgroundColor: '#E8F4F8',
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
  },
  notesLabel: {
    fontSize: 11,
    color: '#00695C',
    fontWeight: '600',
    marginBottom: 5,
  },
  notesText: {
    fontSize: 12,
    color: '#00695C',
    lineHeight: 18,
  },
  pendingSyncBadge: {
    backgroundColor: '#FFFFCC',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  pendingSyncText: {
    fontSize: 11,
    color: '#CC6600',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 15,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
  },
});

export default BatteryHistoryScreen;