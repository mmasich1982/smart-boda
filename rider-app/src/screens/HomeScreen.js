// rider-app/src/screens/HomeScreen.js
// ============================================================================
// ✅ MIGRATED: LocalStore → indexedDbAdapter (IndexedDB)
// BENEFITS:
// - Larger storage capacity (50MB+)
// - Non-blocking async operations
// - Better performance for large datasets
// - Reliable persistence across sessions
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
// ✅ MIGRATED: Replace LocalStore with indexedDbAdapter
import indexedDbAdapter from '../offline/adapters/indexedDbAdapter';
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
  const [yesterdayTotal, setYesterdayTotal] = useState(0);
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
  // SUBSCRIPTION LOADING - ✅ MIGRATED TO indexedDbAdapter
  // ============================================================================
  
  // ✅ REQ-4.1, 4.2: Load subscription data
  const loadSubscription = useCallback(async (currentRiderId) => {
    if (!currentRiderId) return;
    
    try {
      setSubscriptionLoading(true);
      console.log('📡 Fetching subscription for rider:', currentRiderId);
      
      const response = await api.get('/subscription', {
        params: { rider_id: currentRiderId }
      });
      
      console.log('✅ Subscription response:', response.data);
      
      if (response.data && response.data.subscription) {
        setSubscription(response.data.subscription);
        setIsOffline(false);
        console.log('✅ Subscription set:', response.data.subscription);
      } else {
        console.warn('⚠️ No subscription data in response');
        setSubscription(null);
      }
      
      // ✅ MIGRATED: Cache subscription data using indexedDbAdapter
      if (response.data && response.data.subscription) {
        try {
          await indexedDbAdapter.kvSet(
            `subscription_cache_${currentRiderId}`,
            {
              data: response.data.subscription,
              cached_at: new Date().toISOString()
            }
          );
          console.log('✅ Cached subscription data in IndexedDB');
        } catch (cacheErr) {
          console.warn('⚠️ Warning: Unable to cache subscription data:', cacheErr.message);
          // Continue even if caching fails
        }
      }
    } catch (err) {
      console.error('❌ Error loading subscription:', err);
      
      // ✅ MIGRATED: Load from cache using indexedDbAdapter
      if (err.response?.status === 0 || err.message.includes('Network')) {
        try {
          const cached = await indexedDbAdapter.kvGet(`subscription_cache_${currentRiderId}`);
          if (cached) {
            try {
              // Handle both object and stringified formats
              const cacheData = typeof cached === 'string' ? JSON.parse(cached) : cached;
              setSubscription(cacheData.data);
              setIsOffline(true);
              console.log('✅ Loaded subscription from IndexedDB cache');
            } catch (e) {
              console.error('❌ Error parsing cached subscription:', e);
            }
          }
        } catch (cacheErr) {
          console.error('❌ Error loading subscription from cache:', cacheErr);
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
      console.log('🔄 Starting HomeScreen refresh...');
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

      // ✅ FIXED: Now passing riderId to repository functions with defensive checks
      if (effectiveRiderId) {
        console.log('🔄 Loading trips for rider:', effectiveRiderId);
        
        try {
          // Load today's trips and realized income
          const trips = await getTodaysTrips(effectiveRiderId);
          console.log('✅ Loaded trips:', trips ? trips.length : 0);
          
          // Defensive null checks for trips
          if (trips && Array.isArray(trips)) {
            const summary = summarizeTrips(trips);
            console.log('✅ Trip summary:', summary);
          }
          
          const realizedIncome = await getTodaysRealizedIncome(effectiveRiderId);
          console.log('✅ Realized income:', realizedIncome);
          
          // Defensive null check for income
          const incomeTotal = realizedIncome?.total || realizedIncome || 0;
          if (typeof incomeTotal === 'number' && incomeTotal > 0) {
            setRunningTotal(incomeTotal);
          } else {
            setRunningTotal(0);
          }
          
          setTripsToday(trips && Array.isArray(trips) ? trips.length : 0);

          // Load yesterday's total - with proper error handling
          try {
            const yest = await getYesterdaysTotal(effectiveRiderId);
            console.log('✅ Yesterday total:', yest);
            
            // Defensive null check for yesterday total
            const yesterdayAmount = typeof yest === 'number' ? yest : 0;
            setYesterdayTotal(Math.max(yesterdayAmount, 0));
          } catch (yesterdayErr) {
            console.warn('⚠️ Warning: Could not load yesterday total:', yesterdayErr.message);
            setYesterdayTotal(0);
          }
        } catch (tripsErr) {
          console.error('❌ Error loading trips:', tripsErr.message);
          console.error('Full error:', tripsErr);
          setRunningTotal(0);
          setTripsToday(0);
          setYesterdayTotal(0);
        }
      } else {
        console.warn('⚠️ No rider ID available');
        setRunningTotal(0);
        setTripsToday(0);
        setYesterdayTotal(0);
      }

      // Load queued records
      const queued = await getQueuedRecords();
      setQueuedCount(queued?.length || 0);

      // Load sync status
      const hours = await hoursSinceLastSync();
      setOfflineHours(Math.floor(hours) || 0);

      setIsInitialized(true);
    } catch (err) {
      console.error('❌ Error during refresh:', err);
      setHasError(true);
      setErrorMsg(err?.message || 'Failed to load home screen data');
      setIsInitialized(true);
    } finally {
      setRefreshing(false);
    }
  }, [riderId]);

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================
  
  // On mount: try to get rider ID and refresh
  useEffect(() => {
    const initializeScreen = async () => {
      try {
        const localRiderId = await getLocalRiderId();
        if (localRiderId) {
          setRiderId(localRiderId);
          console.log('✅ Loaded rider ID from IndexedDB:', localRiderId);
        }
      } catch (err) {
        console.error('❌ Error getting rider ID:', err);
      }
    };

    initializeScreen();
  }, []);

  // Focus: refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // ============================================================================
  // LOGOUT HANDLER
  // ============================================================================
  const handleLogout = useCallback(async () => {
    Alert.alert(
      t('common.logout'),
      t('home.logout_confirm'),
      [
        {
          text: t('common.cancel'),
          onPress: () => console.log('Logout cancelled'),
          style: 'cancel',
        },
        {
          text: t('common.logout'),
          onPress: async () => {
            try {
              await clearSession();
              navigation.reset({
                index: 0,
                routes: [{ name: 'LoginScreen' }],
              });
            } catch (err) {
              console.error('❌ Error during logout:', err);
              Alert.alert(t('common.error'), t('home.logout_error'));
            }
          },
          style: 'destructive',
        },
      ]
    );
  }, [navigation, t]);

  // ============================================================================
  // RENDER
  // ============================================================================
  
  if (!isInitialized) {
    return <LoadingSkeleton />;
  }

  if (hasError) {
    return <ErrorDisplay error={errorMsg} onRetry={refresh} />;
  }

  const fuelType = bike?.bike_type || 'petrol';
  const energyTile = ENERGY_TILE_BY_FUEL[fuelType] || ENERGY_TILE_BY_FUEL.petrol;
  const subscriptionStatus = subscription?.status || 'inactive';
  const isSubscriptionActive = subscriptionStatus === 'active';

  return (
    <HomeScreenErrorBoundary onRetry={refresh}>
      <ScrollView style={styles.container} refreshControl={null}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>🚕</Text>
            </View>
            <Text style={styles.brandName}>Smart Boda</Text>
          </View>
        </View>

        {/* Main Content */}
        <View style={styles.screenBody}>
          {/* Offline Banner */}
          {isOffline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineText}>📡 Offline Mode</Text>
              <Text style={styles.offlineSubtext}>
                Data last synced {offlineHours} hours ago
              </Text>
            </View>
          )}

          {/* Sync Warning */}
          {queuedCount > 0 && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                ⏳ {queuedCount} pending sync operations
              </Text>
            </View>
          )}

          {/* Hero Fare Card */}
          {!subscriptionLoading ? (
            <HeroFareCard
              runningTotal={typeof runningTotal === 'number' ? runningTotal : 0}
              totalFare={typeof runningTotal === 'number' ? runningTotal : 0}
              subscription={subscription}
              isActive={subscription?.status === 'active'}
              riderId={riderId}
              onOpenDailySummary={() => {
                console.log('📊 Opening daily summary...');
                navigation.navigate('DailyTradeSummaryHub');
              }}
              onNewTrip={() => {
                console.log('🚕 Starting new trip...');
                navigation.navigate('NewTripScreen');
              }}
            />
          ) : (
            <View style={[styles.heroFare, styles.skeleton]} />
          )}

          {/* Yesterday Card */}
          {typeof yesterdayTotal === 'number' && yesterdayTotal > 0 && (
            <View style={styles.yesterdayCard}>
              <View style={styles.yesterdayHeader}>
                <Text style={styles.yesterdayLabel}>Yesterday Total</Text>
                <Text style={styles.yesterdayAmount}>
                  KES {typeof yesterdayTotal === 'number' ? yesterdayTotal.toFixed(2) : '0.00'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('DailyTradeSummaryHub')}>
                <Text style={styles.viewBreakdownLink}>View Breakdown →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Tiles Row 1 */}
          <View style={styles.tileRow}>
            {/* Energy Tile */}
            <TouchableOpacity
              style={styles.homeTile}
              onPress={() => navigation.navigate(energyTile.route)}
            >
              <Text style={styles.tileEmoji}>{energyTile.emoji}</Text>
              <Text style={styles.tileLabel}>{t(energyTile.label)}</Text>
            </TouchableOpacity>

            {/* Service/Maintenance Tile */}
            <TouchableOpacity
              style={styles.homeTile}
              onPress={() => navigation.navigate('ServiceHub')}
            >
              <Text style={styles.tileEmoji}>🔧</Text>
              <Text style={styles.tileLabel}>{t('home.tile_service_maintenance')}</Text>
            </TouchableOpacity>
          </View>

          {/* Tiles Row 2 */}
          <View style={styles.tileRow}>
            {/* Financial Performance Tile */}
            <TouchableOpacity
              style={styles.homeTile}
              onPress={() => navigation.navigate('FinancialPerformanceHub')}
            >
              <Text style={styles.tileEmoji}>📊</Text>
              <Text style={styles.tileLabel}>{t('home.tile_financial_performance')}</Text>
            </TouchableOpacity>

            {/* My Subscription Tile */}
            <TouchableOpacity
              style={styles.homeTile}
              onPress={() => navigation.navigate('MySubscriptionHub')}
            >
              <Text style={styles.tileEmoji}>✨</Text>
              <Text style={styles.tileLabel}>{t('home.tile_my_subscription')}</Text>
            </TouchableOpacity>
          </View>

          {/* Settings List */}
          <View style={styles.settingsListContainer}>
            {/* Daily Trade Summary */}
            <TouchableOpacity
              style={styles.settingsListItem}
              onPress={() => navigation.navigate('DailyTradeSummaryHub')}
            >
              <Text style={styles.settingsListLabel}>{t('home.settings_daily_trade_summary')}</Text>
              <Text style={styles.settingsListArrow}>→</Text>
            </TouchableOpacity>

            {/* Financial History */}
            <TouchableOpacity
              style={styles.settingsListItem}
              onPress={() => navigation.navigate('FinancialHistoryHub')}
            >
              <Text style={styles.settingsListLabel}>{t('home.settings_financial_history')}</Text>
              <Text style={styles.settingsListArrow}>→</Text>
            </TouchableOpacity>

            {/* Logout */}
            <TouchableOpacity
              style={[styles.settingsListItem, styles.logoutListItem]}
              onPress={handleLogout}
            >
              <Text style={[styles.settingsListLabel, styles.logoutText]}>
                {t('common.logout')}
              </Text>
              <Text style={[styles.settingsListArrow, { color: '#e0453f' }]}>→</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </HomeScreenErrorBoundary>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
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
    width: 44,
    height: 44,
    backgroundColor: '#f6f4ef',
    borderRadius: 12,
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
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 100,
  },
  heroFare: {
    marginBottom: 14,
    minHeight: 180,
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