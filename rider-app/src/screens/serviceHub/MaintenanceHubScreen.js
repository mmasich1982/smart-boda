// rider-app/src/screens/serviceHub/MaintenanceHubScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Clean UI without status banners
// ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
// ✅ NETWORK AWARE: Real-time connectivity detection
// ✅ Manages connectivity in background silently

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import api from '../../api/client';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';

export default function MaintenanceHubScreen({ navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // ✅ Track if we've already initialized hub on mount
  const hasInitializedRef = useRef(false);
  
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // Load rider ID
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ MaintenanceHub: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  // Initialize hub with minimal logic
  useEffect(() => {
    if (!effectiveRiderId || !isInitialized || hasInitializedRef.current) {
      return;
    }

    let isMounted = true;

    const initializeHub = async () => {
      try {
        setLoading(true);
        
        // Cache hub initialization state for offline use using IndexedDB
        await indexedDbAdapter.kvSet(
          `maintenance_hub_${effectiveRiderId}`,
          JSON.stringify({
            initialized: true,
            timestamp: new Date().toISOString(),
          })
        );
        
        console.log('✅ Maintenance hub initialized');
      } catch (err) {
        console.error('❌ Hub initialization error:', err);
        if (isMounted) {
          showCriticalError('Failed to initialize hub. Please try again.', 'init');
        }
      } finally {
        if (isMounted) {
          hasInitializedRef.current = true;
          setLoading(false);
        }
      }
    };

    initializeHub();

    return () => {
      isMounted = false;
    };
  }, [effectiveRiderId, isInitialized, showCriticalError]);

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

  const handleRecordService = useCallback(() => {
    clearCriticalError();
    navigation.navigate('MaintenanceEntry');
  }, [navigation, clearCriticalError]);

  const handleViewHistory = useCallback(() => {
    clearCriticalError();
    navigation.navigate('MaintenanceHistory');
  }, [navigation, clearCriticalError]);

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={handleBackPress} label="← Home" />
        <Text style={styles.title}>Service Car</Text>
        <ActivityIndicator size="large" color="#ffc107" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={handleBackPress} label="← Home" />
      
      <Text style={styles.title}>Service Car</Text>

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
        onPress={handleRecordService}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryButtonText}>
          🔧 Record Service Cost →
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.secondaryButton}
        onPress={handleViewHistory}
        activeOpacity={0.8}
      >
        <Text style={styles.secondaryButtonText}>
          📊 Service History →
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