// rider-app/src/screens/energyHub/ChargeBatteryHubScreen.js
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

export default function ChargeBatteryHubScreen({ bikeProfile, navigation }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // ✅ Track if we've already initialized the hub on mount
  const hasInitializedRef = useRef(false);
  
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  const isBattery = bikeProfile?.fuelType === 'electric' || bikeProfile?.type === 'electric';
  const title = isBattery ? (t('batteryManagement_hub') || 'Battery Management Hub') : (t('batteryManagement_chargeHub') || 'Charge Battery Hub');
  const recordLabel = isBattery ? (t('recordBatteryCostButton') || 'Record Battery Cost →') : (t('recordChargingCostButton') || 'Record Charging Cost →');
  const historyLabel = isBattery ? (t('batteryHistory') || 'Battery History →') : (t('chargeHistory') || 'Charge History →');

  // ✅ LOAD RIDER ID ON MOUNT
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ BatteryHub: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  // ✅ INITIALIZE HUB WITH INDEXEDDB - Single execution on mount
  useEffect(() => {
    if (!effectiveRiderId || !isInitialized || hasInitializedRef.current) {
      return; // ✅ Exit if already initialized
    }

    let isMounted = true;

    const initializeHub = async () => {
      try {
        setLoading(true);
        
        // Cache hub initialization state for offline use using IndexedDB
        await indexedDbAdapter.kvSet(
          `battery_hub_${effectiveRiderId}`,
          JSON.stringify({
            initialized: true,
            timestamp: new Date().toISOString(),
          })
        );
        
        if (isMounted) {
          console.log('✅ Battery hub initialized');
        }
      } catch (err) {
        console.error('❌ Hub initialization error:', err);
        if (isMounted) {
          showCriticalError(
            t('error_hubInitFailed') || 'Failed to initialize hub. Please try again.',
            'init'
          );
        }
      } finally {
        if (isMounted) {
          hasInitializedRef.current = true; // ✅ Mark as initialized
          setLoading(false);
        }
      }
    };

    initializeHub();

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

  const handleRecordBatteryCost = useCallback(() => {
    clearCriticalError();
    navigation.navigate('BatteryEntry', { bikeProfile });
  }, [navigation, bikeProfile, clearCriticalError]);

  const handleViewHistory = useCallback(() => {
    clearCriticalError();
    navigation.navigate('BatteryHistory', { bikeProfile });
  }, [navigation, bikeProfile, clearCriticalError]);

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={handleBackPress} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{title}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
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
        onPress={handleRecordBatteryCost}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryButtonText}>
          🔋 {recordLabel}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.secondaryButton}
        onPress={handleViewHistory}
        activeOpacity={0.8}
      >
        <Text style={styles.secondaryButtonText}>
          📊 {historyLabel}
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