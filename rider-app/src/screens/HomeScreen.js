// rider-app/src/screens/HomeScreen.js
// ✅ INTEGRATION GUIDE: SubscriptionBanners component
// ✅ PLACEMENT: Directly below Hero Fare Card
// ✅ DO NOT ALTER: Any other part of the Home Screen UI/UX
// ✅ SIMPLE IMPORT: One line to activate subscription banners

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useRider } from '../../rider/RiderContext';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { getLocalRiderId } from '../../offline/db';
import api from '../../api/client';

// ✅ NEW IMPORT: Subscription Banners
import SubscriptionBanners from '../../components/SubscriptionBanners';

const HomeScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { state } = useRider();

  // ========================================================================
  // STATE
  // ========================================================================
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [riderId, setRiderId] = useState(null);
  const [homeData, setHomeData] = useState(null);

  // ========================================================================
  // CONTROL MECHANISMS
  // ========================================================================
  const hasLoadedRef = useRef(false);
  const isMountedRef = useRef(true);

  // ========================================================================
  // LOAD RIDER ID
  // ========================================================================
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setRiderId(id);
        } else if (state?.riderId) {
          setRiderId(state.riderId);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };

    loadRiderId();
  }, [state?.riderId]);

  // ========================================================================
  // INITIALIZE MOUNT/UNMOUNT
  // ========================================================================
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ========================================================================
  // LOAD HOME DATA
  // ========================================================================
  const loadHomeData = useCallback(async () => {
    if (!riderId || !isMountedRef.current) {
      return;
    }

    try {
      setLoading(true);

      // Load home screen data from API or cache
      const data = await indexedDbAdapter.kvGet(`home_data_${riderId}`);

      if (isMountedRef.current) {
        setHomeData(data ? JSON.parse(data) : null);
      }
    } catch (err) {
      console.error('❌ Error loading home data:', err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [riderId]);

  // ========================================================================
  // FOCUS EFFECT
  // ========================================================================
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current && riderId) {
        hasLoadedRef.current = true;
        loadHomeData();
      }

      return () => {
        // Keep state on unfocus
      };
    }, [loadHomeData, riderId])
  );

  // ========================================================================
  // REFRESH HANDLER
  // ========================================================================
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHomeData();
    setRefreshing(false);
  }, [loadHomeData]);

  // ========================================================================
  // MAIN RENDER
  // ========================================================================
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#ff7a1a"
        />
      }
    >
      {/* ========================================================================
          HERO FARE CARD (EXISTING)
          ======================================================================== */}
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>🏍️ Smart Boda</Text>
        <Text style={styles.heroSubtitle}>Welcome back, rider!</Text>
      </View>

      {/* ========================================================================
          ✅ SUBSCRIPTION BANNERS — INTEGRATION POINT
          📌 PLACEMENT: Directly below Hero Fare Card
          🎯 BEHAVIOR: Shows trial, reminder, or lock banner based on subscription state
          🔧 CONFIGURATION: Zero additional setup required
          ======================================================================== */}
      <SubscriptionBanners navigation={navigation} />

      {/* ========================================================================
          REMAINING HOME SCREEN CONTENT (UNCHANGED)
          ======================================================================== */}
      <View style={styles.contentSection}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('SubscriptionScreen')}
          activeOpacity={0.8}
        >
          <Text style={styles.actionButtonText}>💳 Manage Subscription</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('TripsScreen')}
          activeOpacity={0.8}
        >
          <Text style={styles.actionButtonText}>📊 Trip History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('FuelHub')}
          activeOpacity={0.8}
        >
          <Text style={styles.actionButtonText}>⛽ Fuel Management</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('ProfileScreen')}
          activeOpacity={0.8}
        >
          <Text style={styles.actionButtonText}>👤 My Profile</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f6f4ef',
  },

  // Hero Card
  heroCard: {
    backgroundColor: '#1a1c20',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
  },

  // Content Section
  contentSection: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },

  // Action Buttons
  actionButton: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 10,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1c20',
  },
});

export default HomeScreen;

// ========================================================================
// INTEGRATION INSTRUCTIONS
// ========================================================================
//
// STEP 1: Import SubscriptionBanners component
//   import SubscriptionBanners from '../../components/SubscriptionBanners';
//
// STEP 2: Add component below Hero Fare Card in JSX:
//   <SubscriptionBanners navigation={navigation} />
//
// STEP 3: That's it! Component automatically:
//   ✓ Loads subscription state from IndexedDB
//   ✓ Determines which banner to show (trial, reminder, lock)
//   ✓ Handles tap navigation to subscription screens
//   ✓ Never renders if no banner needed
//
// BEHAVIORAL NOTES:
// - Free Trial Banner: Shows only during active free trial
// - Reminder Banner: Shows 2 days before expiry (max 3 checks/day)
// - Lock Banner: Shows when account is locked (expired, not paid)
// - Auto-hides: Once subscription is renewed or lock is cleared
//
// DO NOT MODIFY:
// - SubscriptionBanners.js component itself
// - subscriptionUtils.js functions
// - IndexedDB adapter calls
//
// Questions? Check subscriptionUtils.js for business logic details.
// ========================================================================