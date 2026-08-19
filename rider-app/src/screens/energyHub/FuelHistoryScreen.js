import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Alert } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useFocusEffect } from '@react-navigation/native';

const FuelHistoryScreen = () => {
  const { t } = useTranslation();
  const { state: riderState } = useRider();
  
  const [fuelHistory, setFuelHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [totalLiters, setTotalLiters] = useState(0);

  // Get rider ID
  const getRiderId = useCallback(() => {
    try {
      return getLocalRiderId();
    } catch (err) {
      return riderState?.riderId;
    }
  }, [riderState]);

  // Load fuel history
  const loadFuelHistory = useCallback(async () => {
    const riderId = getRiderId();
    
    if (!riderId) {
      console.error('Rider ID missing');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Try to fetch from API
      const response = await api.get(`/fuel/history?rider_id=${riderId}`);
      
      if (response.data) {
        const entries = response.data.entries || response.data || [];
        setFuelHistory(entries);
        
        // Calculate totals
        const totals = entries.reduce((acc, entry) => {
          return {
            cost: acc.cost + (parseFloat(entry.cost) || 0),
            liters: acc.liters + (parseFloat(entry.amount) || 0),
          };
        }, { cost: 0, liters: 0 });
        
        setTotalCost(totals.cost);
        setTotalLiters(totals.liters);
        
        // ✅ OFFLINE: Cache the history
        try {
          LocalStore.set(`fuel_history_${riderId}`, JSON.stringify({
            entries: entries,
            totals: totals,
            cached_at: new Date().toISOString()
          }));
        } catch (cacheErr) {
          console.warn('Failed to cache fuel history:', cacheErr);
        }
        
        setIsOffline(false);
      }
    } catch (err) {
      console.error('Error loading fuel history:', err);
      
      // ✅ OFFLINE: Load from cache on network error
      if (isNetworkError(err)) {
        try {
          const cached = LocalStore.get(`fuel_history_${riderId}`);
          
          if (cached) {
            const { entries, totals } = JSON.parse(cached);
            setFuelHistory(entries);
            setTotalCost(totals.cost);
            setTotalLiters(totals.liters);
            setIsOffline(true);
            console.log('✅ Loaded fuel history from offline cache');
          } else {
            // Also try to load from local entries
            const localEntries = LocalStore.get(`fuel_entries_${riderId}`);
            if (localEntries) {
              const entries = JSON.parse(localEntries);
              setFuelHistory(entries);
              
              const totals = entries.reduce((acc, entry) => {
                return {
                  cost: acc.cost + (parseFloat(entry.cost) || 0),
                  liters: acc.liters + (parseFloat(entry.amount) || 0),
                };
              }, { cost: 0, liters: 0 });
              
              setTotalCost(totals.cost);
              setTotalLiters(totals.liters);
              setIsOffline(true);
              console.log('✅ Loaded fuel history from local entries');
            } else {
              setFuelHistory([]);
              setTotalCost(0);
              setTotalLiters(0);
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
      loadFuelHistory();
    }, [loadFuelHistory])
  );

  // Handle refresh
  const handleRefresh = useCallback(() => {
    loadFuelHistory();
  }, [loadFuelHistory]);

  // Delete entry
  const handleDeleteEntry = useCallback((entryId) => {
    Alert.alert(
      t('confirm_delete'),
      t('delete_fuel_entry_confirm'),
      [
        { text: t('cancel'), onPress: () => {} },
        {
          text: t('delete'),
          onPress: () => {
            try {
              const riderId = getRiderId();
              const entries = fuelHistory.filter(e => e.id !== entryId);
              
              // Update local storage
              LocalStore.set(`fuel_entries_${riderId}`, JSON.stringify(entries));
              
              // Update state
              setFuelHistory(entries);
              
              // Recalculate totals
              const totals = entries.reduce((acc, entry) => {
                return {
                  cost: acc.cost + (parseFloat(entry.cost) || 0),
                  liters: acc.liters + (parseFloat(entry.amount) || 0),
                };
              }, { cost: 0, liters: 0 });
              
              setTotalCost(totals.cost);
              setTotalLiters(totals.liters);
              
              Alert.alert(t('success'), t('fuel_entry_deleted'));
            } catch (err) {
              Alert.alert(t('error'), t('failed_to_delete_entry'));
            }
          },
          style: 'destructive',
        },
      ]
    );
  }, [fuelHistory, getRiderId, t]);

  if (loading && fuelHistory.length === 0) {
    return (
      <View style={styles.container}>
        <BackLink title={t('fuel_cost_history')} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>{t('loading_fuel_history')}</Text>
        </View>
      </View>
    );
  }

  const renderFuelEntry = ({ item }) => (
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
          <Text style={styles.detailLabel}>{t('liters')}</Text>
          <Text style={styles.detailValue}>{item.amount || item.liters} L</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('cost')}</Text>
          <Text style={styles.detailValue}>KES {parseFloat(item.cost).toFixed(2)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('cost_per_liter')}</Text>
          <Text style={styles.detailValue}>
            KES {((parseFloat(item.cost) / parseFloat(item.amount)) || 0).toFixed(2)}
          </Text>
        </View>
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
      <BackLink title={t('fuel_cost_history')} onRefresh={handleRefresh} />
      
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
          <Text style={styles.summaryLabel}>{t('total_liters')}</Text>
          <Text style={styles.summaryValue}>{totalLiters.toFixed(2)} L</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('entries')}</Text>
          <Text style={styles.summaryValue}>{fuelHistory.length}</Text>
        </View>
        {totalLiters > 0 && (
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{t('avg_per_liter')}</Text>
            <Text style={styles.summaryValue}>
              KES {(totalCost / totalLiters).toFixed(2)}
            </Text>
          </View>
        )}
      </View>

      {/* History List */}
      {fuelHistory.length > 0 ? (
        <FlatList
          data={fuelHistory}
          renderItem={renderFuelEntry}
          keyExtractor={(item, index) => item.id || index.toString()}
          scrollEnabled={false}
          contentContainerStyle={styles.historyList}
          ListFooterComponent={<View style={{ height: 20 }} />}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>⛽</Text>
          <Text style={styles.emptyText}>{t('no_fuel_history')}</Text>
          <Text style={styles.emptySubtext}>
            {isOffline ? t('no_cached_fuel_data') : t('start_recording_fuel')}
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
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  summaryValue: {
    fontSize: 14,
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

export default FuelHistoryScreen;