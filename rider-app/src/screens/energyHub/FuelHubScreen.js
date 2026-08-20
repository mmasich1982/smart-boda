// rider-app/src/screens/energyHub/FuelHubScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Clean UI without status banners
// Manages connectivity in background silently

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import api from '../../api/client';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';

export default function FuelHubScreen({ bikeProfile, navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [totalSpent, setTotalSpent] = useState(0);
  const [entriesCount, setEntriesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  const isElectric = bikeProfile?.fuelType === 'electric';
  const title = isElectric ? 'Battery Management Hub' : 'Fuel Management Hub';
  const subtitle = isElectric ? 'Track your battery charging costs' : 'Track your fuel purchase costs';
  const recordLabel = isElectric ? 'Record Battery Cost →' : 'Record Fuel Cost →';
  const historyLabel = isElectric ? 'Battery History →' : 'Fuel History →';

  // Load rider ID
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ FuelHub: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  // Load summary data
  useEffect(() => {
    if (!effectiveRiderId) return;

    const loadSummary = async () => {
      try {
        setLoading(true);

        // Try API first
        if (isConnected && isInitialized) {
          try {
            const response = await api.get('/fuel-maintenance/fuel-entry/summary', {
              params: { rider_id: effectiveRiderId }
            });

            const data = response.data || {};
            setTotalSpent(data.total_cost || 0);
            setEntriesCount(data.total_entries || 0);
            
            // Cache the summary
            LocalStore.set(
              `fuel_summary_${effectiveRiderId}`,
              JSON.stringify({ totalCost: data.total_cost || 0, totalEntries: data.total_entries || 0 })
            );
            console.log('✅ Loaded summary from API');
          } catch (apiErr) {
            // API failed - use cache
            loadSummaryFromCache();
          }
        } else {
          // Offline - use cache
          loadSummaryFromCache();
        }
      } catch (err) {
        console.error('❌ Error loading summary:', err);
        showCriticalError('Unable to load summary. Please try again.', 'data_load');
      } finally {
        setLoading(false);
      }
    };

    const loadSummaryFromCache = () => {
      try {
        const cached = LocalStore.get(`fuel_summary_${effectiveRiderId}`);
        if (cached) {
          const data = JSON.parse(cached);
          setTotalSpent(data.totalCost || 0);
          setEntriesCount(data.totalEntries || 0);
          console.log('✅ Loaded summary from cache');
        } else {
          // Reconstruct from individual entries
          const allKeys = LocalStore.listKeys('fuel_entry_');
          const entries = [];
          let totalCost = 0;
          
          for (const key of allKeys) {
            try {
              const value = LocalStore.get(key);
              if (value) {
                const entry = JSON.parse(value);
                if (entry && entry.rider_id === effectiveRiderId) {
                  entries.push(entry);
                  totalCost += entry.cost || 0;
                }
              }
            } catch (e) {
              // Skip malformed entries
            }
          }
          
          setTotalSpent(totalCost);
          setEntriesCount(entries.length);
          console.log(`✅ Reconstructed summary from ${entries.length} entries`);
        }
      } catch (err) {
        console.warn('⚠️ Failed to load cached summary:', err);
        setTotalSpent(0);
        setEntriesCount(0);
      }
    };

    loadSummary();
  }, [effectiveRiderId, isConnected, isInitialized]);

  const handleRecordFuelCost = () => {
    clearCriticalError();
    navigation.navigate('FuelEntry', { bikeProfile });
  };

  const handleViewHistory = () => {
    clearCriticalError();
    navigation.navigate('FuelHistory', { bikeProfile });
  };

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
        <Text style={styles.title}>{title}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {/* CRITICAL ERROR ONLY - Never show status/offline info */}
      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>⚠️ {criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.criticalErrorDismiss}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Summary Card - Clean, no clutter */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Spent</Text>
            <Text style={styles.summaryValue}>
              KSh {totalSpent.toLocaleString()}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Entries</Text>
            <Text style={styles.summaryValue}>{entriesCount}</Text>
          </View>
        </View>
      </View>

      {/* Action Buttons - Clean design */}
      <TouchableOpacity 
        style={styles.primaryButton}
        onPress={handleRecordFuelCost}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryButtonText}>
          {isElectric ? '🔌 Record Battery Cost →' : '⛽ Record Fuel Cost →'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.secondaryButton}
        onPress={handleViewHistory}
        activeOpacity={0.8}
      >
        <Text style={styles.secondaryButtonText}>
          {isElectric ? '📊 Battery History →' : '📊 Fuel History →'}
        </Text>
      </TouchableOpacity>

      {/* Info Card - No status, just helpful hints */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>💡 Quick Tips</Text>
        <Text style={styles.infoText}>
          {isElectric 
            ? '• Record each battery charging session\n• Track your battery management expenses\n• Review history to optimize charging'
            : '• Record fuel purchases immediately\n• Keep track of refueling patterns\n• Monitor fuel costs over time'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f6f4ef', 
    padding: 0 
  },
  title: { 
    fontFamily: 'SpaceGrotesk-Bold', 
    fontSize: 28, 
    fontWeight: '700', 
    color: '#1a1c20', 
    marginBottom: 8,
    paddingHorizontal: 20,
    marginTop: 16
  },
  subtitle: {
    fontSize: 14,
    color: '#5b606c',
    fontWeight: '500',
    paddingHorizontal: 20,
    marginBottom: 24
  },
  
  // CRITICAL ERROR ONLY - No status banners
  criticalErrorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  criticalErrorText: {
    fontSize: 12,
    color: '#a5312c',
    fontWeight: '600',
    flex: 1
  },
  criticalErrorDismiss: {
    fontSize: 11,
    color: '#a5312c',
    fontWeight: '700',
    textDecorationLine: 'underline',
    marginLeft: 12
  },

  // Clean summary card
  summaryCard: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center'
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center'
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e7e4db',
    marginHorizontal: 16
  },
  summaryLabel: {
    fontSize: 11,
    color: '#5b606c',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    marginBottom: 8
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20'
  },

  // Primary action button
  primaryButton: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.02
  },

  // Secondary action button
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    marginBottom: 24,
    alignItems: 'center'
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ff7a1a'
  },

  // Info card - helpful, not status
  infoCard: {
    backgroundColor: '#fef9f0',
    borderWidth: 1.5,
    borderColor: '#f5e6d3',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 24
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 10
  },
  infoText: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '500',
    lineHeight: 18
  }
});