// rider-app/src/screens/HomeScreen.js
// ============================================================================
// FIXED: Now passing riderId to repository functions
// ============================================================================

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Dimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from '../i18n/LocalizationProvider';
import { getTodaysTrips, getTodaysRealizedIncome, getYesterdaysTotal, summarizeTrips } from '../offline/tripsRepository';
import { getQueuedRecords, hoursSinceLastSync } from '../offline/syncQueue';
import { getActiveBikeProfile, getRiderAccountSummary, clearSession } from '../offline/db';
import HeroFareCard from '../components/HeroFareCard';
import { getLocalRiderId } from '../offline/db';
import LocalStore from '../offline/LocalStore';
import api from '../api/client';

const ENERGY_TILE_BY_FUEL = {
  petrol: { emoji: '⛽', label: 'home.tile_fuel_motorcycle', route: 'FuelHub' },
  electric: { emoji: '🔋', label: 'home.tile_charge_battery', route: 'ChargeBatteryHub' },
};

// ============================================================================
// CORE TILES - These are KEPT (not removed)
// ============================================================================
// Row 1: Fuel/Charge + Service/Maintenance
// Row 2: Financial Performance + My Subscription
// Settings: Daily Trade Summary + Financial History + Logout

// ============================================================================
// LOADING SKELETON
// ============================================================================
function LoadingSkeleton() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>🚕</Text>
          </View>
          <Text style={styles.brandName}>Smart Boda</Text>
        </View>
      </View>
      <View style={styles.screenBody}>
        <View style={[styles.heroFare, styles.skeleton]} />
        <View style={[styles.yesterdayCard, styles.skeleton, { height: 80, marginBottom: 16 }]} />
        <View style={styles.skeletonGrid}>
          <View style={[styles.homeTile, styles.skeleton]} />
          <View style={[styles.homeTile, styles.skeleton]} />
        </View>
      </View>
    </ScrollView>
  );
}

// ============================================================================
// ERROR DISPLAY
// ============================================================================
function ErrorDisplay({ error, onRetry }) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>⚠️ Unable to Load Home Screen</Text>
      <Text style={styles.errorMessage}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// ERROR BOUNDARY
// ============================================================================
class HomeScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[HomeScreen] Error boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorDisplay
          error={this.state.error?.message || 'An unexpected error occurred'}
          onRetry={() => {
            this.setState({ hasError: false, error: null });
            this.props.onRetry?.();
          }}
        />
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// MAIN HOMESCREEN COMPONENT
// ============================================================================
export default function HomeScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();

  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [runningTotal, setRunningTotal] = useState(0);
  const [yesterdayTotal, setYesterdayTotal] = useState(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [bike, setBike] = useState(null);
  const [account, setAccount] = useState(null);
  const [tripsToday, setTripsToday] = useState(0);
  const [offlineHours, setOfflineHours] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  
  // ✅ REQ-4.1, 4.2: Subscription state
  const [subscription, setSubscription] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [riderId, setRiderId] = useState(null);

  // ============================================================================
  // SUBSCRIPTION LOADING
  // ============================================================================
  
  // ✅ REQ-4.1, 4.2: Load subscription data
  const loadSubscription = useCallback(async (currentRiderId) => {
    if (!currentRiderId) return;
    
    try {
      setSubscriptionLoading(true);
      const response = await api.get('/subscription', {
        params: { rider_id: currentRiderId }
      });
      
      setSubscription(response.data.subscription);
      setIsOffline(false);
      
      // ✅ OFFLINE: Cache subscription data using LocalStore
      try {
        LocalStore.set(
          `subscription_cache_${currentRiderId}`,
          JSON.stringify({
            data: response.data.subscription,
            cached_at: new Date().toISOString()
          })
        );
      } catch (cacheErr) {
        console.warn('Warning: Unable to cache subscription data:', cacheErr);
        // Continue even if caching fails
      }
    } catch (err) {
      console.error('Error loading subscription:', err);
      
      // ✅ OFFLINE: Load from cache using LocalStore
      if (err.response?.status === 0 || err.message.includes('Network')) {
        try {
          const cached = LocalStore.get(`subscription_cache_${currentRiderId}`);
          if (cached) {
            try {
              const { data } = JSON.parse(cached);
              setSubscription(data);
              setIsOffline(true);
            } catch (e) {
              console.error('Error parsing cached subscription:', e);
            }
          }
        } catch (cacheErr) {
          console.error('Error loading subscription from cache:', cacheErr);
          setIsOffline(true);
        }
      } else {
        setIsOffline(true);
      }
    } finally {
      setSubscriptionLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (riderId) {
        loadSubscription(riderId);
      }
    }, [riderId, loadSubscription])
  );

  // ============================================================================
  // REFRESH FUNCTION
  // ============================================================================
  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      setHasError(false);
      setErrorMsg(null);

      // Load bike profile
      const activeBike = await getActiveBikeProfile();
      let effectiveRiderId = riderId;
      
      if (activeBike) {
        setBike(activeBike);
        // ✅ Get rider ID from bike profile
        if (activeBike.rider_id) {
          effectiveRiderId = activeBike.rider_id;
          setRiderId(activeBike.rider_id);
        }
      }

      // Load account summary
      const accountSummary = await getRiderAccountSummary();
      if (accountSummary) {
        setAccount(accountSummary);
        // Use account rider_id if we don't have one yet
        if (accountSummary.rider_id && !effectiveRiderId) {
          effectiveRiderId = accountSummary.rider_id;
          setRiderId(accountSummary.rider_id);
        }
      }

      // ✅ FIXED: Now passing riderId to repository functions
      if (effectiveRiderId) {
        console.log('🔄 Loading trips for rider:', effectiveRiderId);
        
        // Load today's trips and realized income
        const trips = await getTodaysTrips(effectiveRiderId);
        console.log('✅ Loaded trips:', trips.length);
        
        const summary = summarizeTrips(trips);
        const realizedIncome = await getTodaysRealizedIncome(effectiveRiderId);
        console.log('✅ Realized income:', realizedIncome.total);
        
        setRunningTotal(realizedIncome.total || 0);
        setTripsToday(trips.length || 0);

        // Load yesterday's total
        const yest = await getYesterdaysTotal(effectiveRiderId);
        setYesterdayTotal(yest);
      }

      // Load queued records
      const queued = await getQueuedRecords();
      setQueuedCount(queued?.length || 0);

      // Load sync status
      const hours = await hoursSinceLastSync();
      setOfflineHours(Math.floor(hours) || 0);

      // Load subscription
      if (effectiveRiderId) {
        await loadSubscription(effectiveRiderId);
      }

      if (!isInitialized) {
        setIsInitialized(true);
      }
    } catch (err) {
      console.error('[HomeScreen] Refresh error:', err);
      setHasError(true);
      setErrorMsg(err.message || 'Error loading home screen');
      if (!isInitialized) {
        setIsInitialized(true);
      }
    } finally {
      setRefreshing(false);
    }
  }, [isInitialized, riderId, loadSubscription]);

  // ============================================================================
  // AUTO-REFRESH ON FOCUS
  // ============================================================================
  useEffect(() => {
    refresh();
    const unsubscribe = navigation.addListener('focus', () => {
      refresh();
    });
    return unsubscribe;
  }, [navigation, refresh]);

  // ============================================================================
  // NAVIGATION HANDLERS
  // ============================================================================
  const handleLogout = useCallback(async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: 'Logout',
          onPress: async () => {
            try {
              await clearSession();
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            } catch (err) {
              console.error('Logout error:', err);
              Alert.alert('Error', 'Failed to logout');
            }
          },
          style: 'destructive',
        },
      ]
    );
  }, [navigation]);

  // ============================================================================
  // LOCKED ACCOUNT FLOW
  // ============================================================================
  if (!subscription) {
    return <LoadingSkeleton />;
  }

  if (subscription.status === 'locked') {
    return (
      <View style={styles.lockedContainer}>
        <View style={styles.lockedContent}>
          <Text style={styles.lockedIcon}>🔒</Text>
          <Text style={styles.lockedTitle}>Account Locked</Text>
          <Text style={styles.lockedMessage}>
            Your account is currently locked pending verification. Our team is reviewing your details.
          </Text>

          <View style={styles.lockedDetails}>
            <Text style={styles.detailLabel}>Status</Text>
            <Text style={styles.detailValue}>Pending Verification</Text>

            <Text style={styles.detailLabel}>Locked Date</Text>
            <Text style={styles.detailValue}>
              {subscription.locked_at 
                ? new Date(subscription.locked_at).toLocaleDateString() 
                : 'N/A'}
            </Text>

            {subscription.reason && (
              <>
                <Text style={styles.detailLabel}>Reason</Text>
                <Text style={styles.detailValue}>{subscription.reason}</Text>
              </>
            )}
          </View>

          {isOffline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineText}>⚠️ Offline</Text>
              <Text style={styles.offlineSubtext}>
                You're currently offline. Your account status may change when you're back online.
              </Text>
            </View>
          )}

          <TouchableOpacity 
            style={styles.unlockedButton}
            onPress={handleLogout}
          >
            <Text style={styles.unlockedButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============================================================================
  // NORMAL FLOW
  // ============================================================================
  if (!isInitialized) {
    return <LoadingSkeleton />;
  }

  if (hasError && !isInitialized) {
    return (
      <ErrorDisplay
        error={errorMsg}
        onRetry={refresh}
      />
    );
  }

  return (
    <HomeScreenErrorBoundary onRetry={refresh}>
      <ScrollView 
        style={styles.container}
        refreshControl={
          <TouchableOpacity 
            style={{ paddingVertical: 20 }}
            onPress={refresh}
          >
            {refreshing ? (
              <ActivityIndicator color="#ff7a1a" />
            ) : (
              <Text style={{ textAlign: 'center', color: '#5b606c' }}>Pull to refresh</Text>
            )}
          </TouchableOpacity>
        }
      >
        {/* TOP BAR */}
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>🏍️</Text>
            </View>
            <Text style={styles.brandName}>Smart Boda</Text>
          </View>
        </View>

        <View style={styles.screenBody}>
          {/* HERO FARE CARD */}
          <HeroFareCard 
            runningTotal={runningTotal}
            tripsToday={tripsToday}
            onNavigate={(screen) => navigation.navigate(screen)}
          />

          {/* YESTERDAY'S TOTAL CARD */}
          {yesterdayTotal !== null && (
            <View style={styles.yesterdayCard}>
              <View style={styles.yesterdayHeader}>
                <Text style={styles.yesterdayLabel}>Yesterday</Text>
                <Text style={styles.yesterdayAmount}>
                  KSh {yesterdayTotal.toLocaleString()}
                </Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('DailyTradeSummary')}>
                <Text style={styles.viewBreakdownLink}>View breakdown →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* OFFLINE WARNING */}
          {isOffline && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                ⚠️ You're offline. Your data will sync when you're back online.
              </Text>
            </View>
          )}

          {/* QUEUED RECORDS WARNING */}
          {queuedCount > 0 && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                🔄 {queuedCount} record{queuedCount === 1 ? '' : 's'} pending sync
              </Text>
            </View>
          )}

          {/* CORE TILES ROW 1: Fuel/Charge + Service */}
          <View style={styles.tileRow}>
            <TouchableOpacity 
              style={styles.homeTile}
              onPress={() => {
                const route = ENERGY_TILE_BY_FUEL[bike?.fuel_type]?.route || 'FuelHub';
                navigation.navigate(route);
              }}
            >
              <Text style={styles.tileEmoji}>
                {ENERGY_TILE_BY_FUEL[bike?.fuel_type]?.emoji || '⛽'}
              </Text>
              <Text style={styles.tileLabel}>
                {bike?.fuel_type === 'electric' ? 'Charge Battery' : 'Add Fuel'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.homeTile}
              onPress={() => navigation.navigate('ServiceHub')}
            >
              <Text style={styles.tileEmoji}>🔧</Text>
              <Text style={styles.tileLabel}>Service & Maintenance</Text>
            </TouchableOpacity>
          </View>

          {/* CORE TILES ROW 2: Financial Performance + Subscription */}
          <View style={styles.tileRow}>
            <TouchableOpacity 
              style={styles.homeTile}
              onPress={() => navigation.navigate('FinancialPerformance')}
            >
              <Text style={styles.tileEmoji}>📊</Text>
              <Text style={styles.tileLabel}>Financial Performance</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.homeTile}
              onPress={() => navigation.navigate('SubscriptionPlans')}
            >
              <Text style={styles.tileEmoji}>⭐</Text>
              <Text style={styles.tileLabel}>
                {subscription?.status === 'active' ? 'My Subscription' : 'Upgrade Plan'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* SETTINGS SECTION */}
          <Text style={styles.settingsLabel}>Settings</Text>
          <View style={styles.settingsListContainer}>
            <TouchableOpacity 
              style={styles.settingsListItem}
              onPress={() => navigation.navigate('DailyTradeSummary')}
            >
              <Text style={styles.settingsListLabel}>Daily Trade Summary</Text>
              <Text style={styles.settingsListArrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.settingsListItem}
              onPress={() => navigation.navigate('FinancialHistory')}
            >
              <Text style={styles.settingsListLabel}>Financial History</Text>
              <Text style={styles.settingsListArrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.settingsListItem, styles.logoutListItem]}
              onPress={handleLogout}
            >
              <Text style={[styles.settingsListLabel, styles.logoutText]}>Logout</Text>
              <Text style={[styles.settingsListArrow, styles.logoutText]}>→</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </HomeScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#fff6ee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 24,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20',
  },
  screenBody: {
    padding: 16,
  },
  settingsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5b606c',
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 20,
  },
  heroFare: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e7e4db',
  },
  heroTitle: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '600',
    marginBottom: 6,
  },
  heroNumber: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 8,
  },
  heroSubtext: {
    fontSize: 12,
    color: '#5b606c',
    marginBottom: 14,
  },
  heroButton: {
    backgroundColor: '#ff7a1a',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  heroButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  yesterdayCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e7e4db',
  },
  yesterdayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  yesterdayLabel: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '600',
  },
  yesterdayAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20',
  },
  viewBreakdownLink: {
    color: '#ff7a1a',
    fontSize: 11,
    fontWeight: '600',
  },
  warningBox: {
    backgroundColor: '#fff3e0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  warningText: {
    color: '#ff9800',
    fontSize: 12,
    fontWeight: '600',
  },
  tileRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  homeTile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    minHeight: 100,
  },
  tileEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1c20',
    textAlign: 'center',
  },
  cardContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e7e4db',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardStatusEmoji: {
    fontSize: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
    flex: 1,
  },
  cardHint: {
    fontSize: 12,
    color: '#5b606c',
    lineHeight: 18,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeGreen: {
    backgroundColor: '#e6f5ef',
  },
  badgeAmber: {
    backgroundColor: '#fdf3df',
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#e7e4db',
  },
  kvKey: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '500',
  },
  kvValue: {
    fontSize: 12,
    color: '#1a1c20',
    fontWeight: '600',
  },
  settingsListContainer: {
    marginTop: 6,
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7e4db',
    overflow: 'hidden',
  },
  settingsListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  settingsListItemLast: {
    borderBottomWidth: 0,
  },
  settingsListLabel: {
    fontSize: 13,
    color: '#1a1c20',
    fontWeight: '500',
  },
  settingsListArrow: {
    fontSize: 16,
    color: '#5b606c',
    marginLeft: 8,
  },
  logoutListItem: {
    borderBottomWidth: 0,
  },
  logoutText: {
    color: '#e0453f',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#f6f4ef',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1c20',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#5b606c',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#ff7a1a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  skeleton: {
    backgroundColor: '#e0e0e0',
    opacity: 0.5,
  },
  skeletonGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  // ✅ REQ-4.4: Locked modal styles
  lockedContainer: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  lockedContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  lockedIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  lockedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12,
    textAlign: 'center',
  },
  lockedMessage: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  lockedDetails: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5b606c',
    marginTop: 8,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1a1c20',
  },
  offlineBanner: {
    backgroundColor: '#fff3e0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
    width: '100%',
  },
  offlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ff9800',
    marginBottom: 4,
  },
  offlineSubtext: {
    fontSize: 11,
    color: '#ff9800',
    lineHeight: 16,
  },
  unlockedButton: {
    width: '100%',
    backgroundColor: '#ff7a1a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  unlockedButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});