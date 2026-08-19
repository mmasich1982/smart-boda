import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useNavigation } from '@react-navigation/native';

const ChargeBatteryHubScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { state: riderState } = useRider();
  
  const [hubData, setHubData] = useState(null);
  const [batteryEntries, setBatteryEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [totalCharges, setTotalCharges] = useState(0);

  // Get rider ID
  const getRiderId = useCallback(() => {
    try {
      return getLocalRiderId();
    } catch (err) {
      console.warn('Using fallback rider ID from context');
      return riderState?.riderId;
    }
  }, [riderState]);

  // Load battery hub data
  const loadBatteryHubData = useCallback(async () => {
    const riderId = getRiderId();
    
    if (!riderId) {
      console.error('Rider ID missing');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Try to fetch from API
      const response = await api.get(`/battery/hub?rider_id=${riderId}`);
      
      if (response.data) {
        setHubData(response.data);
        setBatteryEntries(response.data.entries || []);
        setTotalCost(response.data.totalCost || 0);
        setTotalCharges(response.data.totalCharges || response.data.entries?.length || 0);
        
        // ✅ OFFLINE: Cache the data
        try {
          LocalStore.set(`battery_hub_${riderId}`, JSON.stringify({
            data: response.data,
            cached_at: new Date().toISOString()
          }));
        } catch (cacheErr) {
          console.warn('Failed to cache battery hub data:', cacheErr);
        }
        
        setIsOffline(false);
      }
    } catch (err) {
      console.error('Error loading battery hub data:', err);
      
      // ✅ OFFLINE: Load from cache on network error
      if (isNetworkError(err)) {
        try {
          const cached = LocalStore.get(`battery_hub_${riderId}`);
          
          if (cached) {
            const { data } = JSON.parse(cached);
            setHubData(data);
            setBatteryEntries(data.entries || []);
            setTotalCost(data.totalCost || 0);
            setTotalCharges(data.totalCharges || data.entries?.length || 0);
            setIsOffline(true);
            console.log('✅ Loaded battery hub data from offline cache');
          } else {
            setHubData({
              entries: [],
              totalCost: 0,
              message: 'No cached data available. Enable internet to load battery data.'
            });
            setBatteryEntries([]);
            setTotalCost(0);
            setTotalCharges(0);
            setIsOffline(true);
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

  // Load data on mount
  useEffect(() => {
    loadBatteryHubData();
  }, [loadBatteryHubData]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    loadBatteryHubData();
  }, [loadBatteryHubData]);

  // Navigate to entry screen
  const handleAddCharge = useCallback(() => {
    navigation.navigate('BatteryEntry', { mode: 'create' });
  }, [navigation]);

  // Navigate to history
  const handleViewHistory = useCallback(() => {
    navigation.navigate('BatteryHistory');
  }, [navigation]);

  if (loading && !hubData) {
    return (
      <View style={styles.container}>
        <BackLink title={t('charge_battery')} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>{t('loading_battery_data')}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink title={t('charge_battery')} onRefresh={handleRefresh} />
      
      {/* Offline Indicator */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            📶 {t('working_offline')} - {t('view_cached_data')}
          </Text>
        </View>
      )}

      {/* Hub Data */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔋 {t('battery_summary')}</Text>
        
        <View style={styles.summaryRow}>
          <Text style={styles.label}>{t('total_charging_cost')}</Text>
          <Text style={styles.value}>KES {totalCost.toFixed(2)}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.label}>{t('total_charges')}</Text>
          <Text style={styles.value}>{totalCharges}</Text>
        </View>

        {/* Average Cost */}
        {totalCharges > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.label}>{t('average_charge_cost')}</Text>
            <Text style={styles.value}>KES {(totalCost / totalCharges).toFixed(2)}</Text>
          </View>
        )}

        {/* Buttons */}
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={handleAddCharge}
        >
          <Text style={styles.buttonText}>⚡ {t('record_battery_cost')}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.secondaryButton}
          onPress={handleViewHistory}
        >
          <Text style={styles.secondaryButtonText}>📊 {t('battery_cost_history')}</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Entries */}
      {batteryEntries.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('recent_charges')}</Text>
          
          {batteryEntries.slice(0, 5).map((entry, index) => (
            <View key={index} style={styles.entryRow}>
              <View>
                <Text style={styles.entryDate}>
                  {new Date(entry.date || entry.created_at).toLocaleDateString()}
                </Text>
                <Text style={styles.entryAmount}>{entry.duration || 'N/A'} mins</Text>
              </View>
              <Text style={styles.entryCost}>KES {entry.cost}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Empty State */}
      {batteryEntries.length === 0 && !isOffline && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔋</Text>
          <Text style={styles.emptyText}>{t('no_battery_charges')}</Text>
          <TouchableOpacity 
            style={styles.emptyButton}
            onPress={handleAddCharge}
          >
            <Text style={styles.emptyButtonText}>{t('record_first_charge')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Cache Notice */}
      {isOffline && batteryEntries.length === 0 && (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>⚠️ {t('no_cached_data')}</Text>
          <Text style={styles.warningText}>
            {t('battery_data_unavailable_offline')}
          </Text>
          <TouchableOpacity 
            style={styles.warningButton}
            onPress={handleRefresh}
          >
            <Text style={styles.warningButtonText}>{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

// Helper function to detect network errors
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
    paddingVertical: 50,
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
  card: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 15,
    borderRadius: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  label: {
    fontSize: 14,
    color: '#666',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginTop: 15,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  entryDate: {
    fontSize: 13,
    color: '#666',
    marginBottom: 3,
  },
  entryAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  entryCost: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  warningCard: {
    backgroundColor: '#FFF3CD',
    margin: 10,
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 13,
    color: '#856404',
    marginBottom: 15,
    lineHeight: 20,
  },
  warningButton: {
    backgroundColor: '#FFC107',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    alignItems: 'center',
  },
  warningButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default ChargeBatteryHubScreen;