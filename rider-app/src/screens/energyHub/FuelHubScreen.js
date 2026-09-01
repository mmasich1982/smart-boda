// rider-app/src/screens/energyHub/FuelHubScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Clean UI without status banners
// ✅ MULTILINGUAL: Uses i18n for all UI text
// ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
// ✅ NETWORK AWARE: Real-time connectivity detection
// ✅ FIXED: Proper back navigation handling

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import api from '../../api/client';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import colors from '../../theme/colors';

export default function FuelHubScreen({ bikeProfile, navigation }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [totalSpent, setTotalSpent] = useState(0);
  const [entriesCount, setEntriesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // ✅ Track if we've already loaded summary data on mount
  const hasLoadedSummaryRef = useRef(false);
  
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  const isElectric = bikeProfile?.fuelType === 'electric';
  const title = isElectric ? (t('batteryManagement_hub') || 'Battery Management Hub') : (t('fuelManagement_hub') || 'Fuel Management Hub');
  const subtitle = isElectric ? (t('trackBatteryCharging') || 'Track your battery charging costs') : (t('trackFuelPurchases') || 'Track your fuel purchase costs');
  const recordLabel = isElectric ? (t('recordBatteryCostButton') || 'Record Battery Cost →') : (t('recordFuelCostButton') || 'Record Fuel Cost →');
  const historyLabel = isElectric ? (t('batteryHistory') || 'Battery History →') : (t('fuelHistory') || 'Fuel History →');

  // ✅ LOAD RIDER ID ON MOUNT
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

  // ✅ LOAD SUMMARY DATA - Single execution on mount
  useEffect(() => {
    if (!effectiveRiderId || !isInitialized || hasLoadedSummaryRef.current) {
      return; // ✅ Exit if already loaded
    }

    let isMounted = true;

    const loadSummary = async () => {
      try {
        setLoading(true);

        // Try API first (only if online)
        if (isConnected && isInitialized) {
          try {
            const response = await api.get('/fuel-maintenance/fuel-entry/summary', {
              params: { rider_id: effectiveRiderId }
            });

            if (isMounted) {
              const data = response.data || {};
              setTotalSpent(data.total_cost || 0);
              setEntriesCount(data.total_entries || 0);
              
              // Cache the summary using IndexedDB
              await indexedDbAdapter.kvSet(
                `fuel_summary_${effectiveRiderId}`,
                JSON.stringify({ totalCost: data.total_cost || 0, totalEntries: data.total_entries || 0 })
              );
              console.log('✅ Loaded summary from API');
            }
          } catch (apiErr) {
            // API failed - use cache
            if (isMounted) {
              await loadSummaryFromCache();
            }
          }
        } else {
          // Offline - use cache
          await loadSummaryFromCache();
        }
      } catch (err) {
        console.error('❌ Error loading summary:', err);
        if (isMounted) {
          showCriticalError(
            t('error_loadSummaryFailed') || 'Unable to load summary. Please try again.',
            'data_load'
          );
        }
      } finally {
        if (isMounted) {
          hasLoadedSummaryRef.current = true; // ✅ Mark as loaded
          setLoading(false);
        }
      }
    };

    const loadSummaryFromCache = async () => {
      try {
        const cached = await indexedDbAdapter.kvGet(`fuel_summary_${effectiveRiderId}`);
        if (cached && isMounted) {
          const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
          setTotalSpent(data.totalCost || 0);
          setEntriesCount(data.totalEntries || 0);
          console.log('✅ Loaded summary from cache');
        } else if (isMounted) {
          // Reconstruct from individual entries using IndexedDB - ONLY IF NO CACHE
          const rows = await indexedDbAdapter.queryRows('fuelEntry', (row) => {
            return row.rider_id === effectiveRiderId;
          });
          
          if (isMounted) {
            let totalCost = 0;
            for (const entry of rows) {
              totalCost += entry.cost || 0;
            }
            
            setTotalSpent(totalCost);
            setEntriesCount(rows.length);
            console.log(`✅ Reconstructed summary from ${rows.length} entries`);
          }
        }
      } catch (err) {
        console.warn('⚠️ Failed to load cached summary:', err);
        if (isMounted) {
          setTotalSpent(0);
          setEntriesCount(0);
        }
      }
    };

    loadSummary();

    return () => {
      isMounted = false;
    };
  }, [effectiveRiderId, isInitialized, showCriticalError, t]);

  // ✅ FIXED: Proper back navigation with error handling
  const handleBackPress = useCallback(() => {
    try {
      if (navigation && navigation.canGoBack && navigation.canGoBack()) {
        navigation.goBack();
      } else if (navigation && navigation.navigate) {
        navigation.navigate('Home');
      } else {
        console.warn('⚠️ Navigation not available');
      }
    } catch (err) {
      console.error('❌ Navigation error:', err);
      if (navigation && navigation.navigate) {
        navigation.navigate('Home');
      }
    }
  }, [navigation]);

  const handleRecordFuelCost = useCallback(() => {
    clearCriticalError();
    navigation.navigate('FuelEntry', { bikeProfile });
  }, [navigation, bikeProfile, clearCriticalError]);

  const handleViewHistory = useCallback(() => {
    clearCriticalError();
    navigation.navigate('FuelHistory', { bikeProfile });
  }, [navigation, bikeProfile, clearCriticalError]);

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={handleBackPress} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{title}</Text>
        <ActivityIndicator size="large" color="#ffc107" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={handleBackPress} label={t('backLabel') || '← Back'} />
      
      <Text style={styles.title}>{title}</Text>

      {/* CRITICAL ERROR ONLY - Never show status/offline info */}
      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>⚠️ {criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.criticalErrorDismiss}>{t('dismiss') || 'Dismiss'}</Text>
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
          {isElectric ? '🔌 ' + (t('recordBatteryCostButton') || 'Record Battery Cost →') : '⛽ ' + (t('recordFuelCostButton') || 'Record Fuel Cost →')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.secondaryButton}
        onPress={handleViewHistory}
        activeOpacity={0.8}
      >
        <Text style={styles.secondaryButtonText}>
          {isElectric ? '📊 ' + (t('batteryHistory') || 'Battery History →') : '📊 ' + (t('fuelHistory') || 'Fuel History →')}
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
    backgroundColor: '#ffc107',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#ffc107',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
    letterSpacing: 0.02
  },

  // Secondary action button
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ffc107',
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
    color: '#ffc107'
  }
});