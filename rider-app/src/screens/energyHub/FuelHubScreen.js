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

      {/* CRITICAL ERROR ONLY - Never show status/offline info */}
      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>⚠️ {criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.criticalErrorDismiss}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

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
  }
});