// rider-app/src/screens/HomeScreen.js
// ============================================================================
// UPDATED: Migrated from LocalStore to IndexedDB Adapter
// - All localStorage/LocalStore references removed
// - Uses indexedDbAdapter.kvSet/kvGet for subscription caching
// - UI/UX completely unchanged
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
  const loadSubscription = useCallback(async () => {
    if (!riderId) return;
    
    try {
      setSubscriptionLoading(true);
      const response = await api.get('/subscription', {
        params: { rider_id: riderId }
      });
      
      setSubscription(response.data.subscription);
      setIsOffline(false);
      
      // ✅ OFFLINE: Cache subscription data using IndexedDB Adapter
      try {
        await indexedDbAdapter.kvSet(
          `subscription_cache_${riderId}`,
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
      
      // ✅ OFFLINE: Load from cache using IndexedDB Adapter
      if (err.response?.status === 0 || err.message.includes('Network')) {
        try {
          const cached = await indexedDbAdapter.kvGet(`subscription_cache_${riderId}`);
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
  }, [riderId]);

  useFocusEffect(
    useCallback(() => {
      if (riderId) {
        loadSubscription();
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
      if (activeBike) {
        setBike(activeBike);
        // ✅ Get rider ID from bike profile or account
        if (activeBike.rider_id) {
          setRiderId(activeBike.rider_id);
        }
      }

      // Load account summary
      const accountSummary = await getRiderAccountSummary();
      if (accountSummary) {
        setAccount(accountSummary);
        if (accountSummary.rider_id && !riderId) {
          setRiderId(accountSummary.rider_id);
        }
      }

      // Load today's trips and realized income
      const trips = await getTodaysTrips();
      const summary = summarizeTrips(trips);
      const realizedIncome = await getTodaysRealizedIncome();
      setRunningTotal(realizedIncome.total || 0);
      setTripsToday(trips.length || 0);

      // Load yesterday's total
      const yest = await getYesterdaysTotal();
      setYesterdayTotal(yest);

      // Load queued records
      const queued = await getQueuedRecords();
      setQueuedCount(queued?.length || 0);

      // Load sync status
      const hours = await hoursSinceLastSync();
      setOfflineHours(Math.floor(hours) || 0);

      // Load subscription
      if (riderId) {
        await loadSubscription();
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
  const handleFuelNavigation = useCallback(async () => {
    if (!bike) {
      Alert.alert('Error', 'Could not determine fuel type');
      return;
    }
    const fuelType = bike.fuel_type || 'petrol';
    const tileInfo = ENERGY_TILE_BY_FUEL[fuelType];
    if (tileInfo) {
      navigation.navigate(tileInfo.route);
    }
  }, [bike, navigation]);

  const handleServiceNavigation = useCallback(() => {
    navigation.navigate('ServiceMaintenanceHub');
  }, [navigation]);

  const handlePerformanceNavigation = useCallback(() => {
    navigation.navigate('FinancialPerformance');
  }, [navigation]);

  const handleSubscriptionNavigation = useCallback(() => {
    navigation.navigate('SubscriptionHub');
  }, [navigation]);

  const handleDailySummaryNavigation = useCallback(() => {
    navigation.navigate('DailyTradeSummary');
  }, [navigation]);

  const handleFinancialHistoryNavigation = useCallback(() => {
    navigation.navigate('FinancialHistory');
  }, [navigation]);

  const handleLogout = useCallback(async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Logout',
          onPress: async () => {
            try {
              const cleared = await clearSession();
              if (cleared) {
                navigation.navigate('Auth');
              }
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

  const handleNewTrip = useCallback(() => {
    navigation.navigate('NewTrip');
  }, [navigation]);

  // ============================================================================
  // RENDERING
  // ============================================================================
  if (!isInitialized) {
    return <LoadingSkeleton />;
  }

  if (hasError) {
    return <ErrorDisplay error={errorMsg} onRetry={refresh} />;
  }

  // ✅ REQ-4.4: Show locked modal if subscription is required but not active
  if (
    subscription &&
    subscription.status === 'suspended' &&
    !subscription.payment_verified
  ) {
    return (
      <Modal visible={true} animationType="fade" transparent={true}>
        <View style={styles.lockedContainer}>
          <View style={styles.lockedContent}>
            <Text style={styles.lockedIcon}>🔒</Text>
            <Text style={styles.lockedTitle}>Account Suspended</Text>
            <Text style={styles.lockedMessage}>
              Your account has been suspended due to non-payment or policy violation.
            </Text>
            <View style={styles.lockedDetails}>
              <Text style={styles.detailLabel}>Subscription Status</Text>
              <Text style={styles.detailValue}>{subscription.status}</Text>
              {subscription.suspension_reason && (
                <>
                  <Text style={styles.detailLabel}>Reason</Text>
                  <Text style={styles.detailValue}>{subscription.suspension_reason}</Text>
                </>
              )}
              {subscription.suspension_date && (
                <>
                  <Text style={styles.detailLabel}>Suspended Since</Text>
                  <Text style={styles.detailValue}>
                    {new Date(subscription.suspension_date).toLocaleDateString()}
                  </Text>
                </>
              )}
            </View>
            <TouchableOpacity
              style={styles.unlockedButton}
              onPress={handleSubscriptionNavigation}
            >
              <Text style={styles.unlockedButtonText}>Resolve Subscription</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <HomeScreenErrorBoundary onRetry={refresh}>
      <ScrollView style={styles.container}>
        {/* TOP BAR */}
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>🚕</Text>
            </View>
            <Text style={styles.brandName}>Smart Boda</Text>
          </View>
        </View>

        <View style={styles.screenBody}>
          {/* ✅ OFFLINE BANNER */}
          {isOffline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineText}>📡 Offline Mode</Text>
              <Text style={styles.offlineSubtext}>
                Showing cached data. Last synced: {offlineHours} hours ago
              </Text>
            </View>
          )}

          {/* HERO FARE CARD */}
          <HeroFareCard
            totalFare={runningTotal}
            onOpenDailySummary={handleDailySummaryNavigation}
            onNewTrip={handleNewTrip}
          />

          {/* YESTERDAY'S EARNINGS CARD */}
          {yesterdayTotal !== null && (
            <View style={styles.yesterdayCard}>
              <View style={styles.yesterdayHeader}>
                <Text style={styles.yesterdayLabel}>Yesterday's Total Earnings</Text>
              </View>
              <Text style={styles.yesterdayAmount}>
                KSh {yesterdayTotal.total?.toLocaleString() || 0}
              </Text>
              <TouchableOpacity onPress={handleFinancialHistoryNavigation}>
                <Text style={styles.viewBreakdownLink}>View Breakdown →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ⚠️ WARNING BOX (if queued records exist) */}
          {queuedCount > 0 && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                ⚠️ {queuedCount} pending record{queuedCount !== 1 ? 's' : ''} waiting to sync
              </Text>
            </View>
          )}

          {/* TILE ROW 1: FUEL/CHARGE + SERVICE */}
          <View style={styles.tileRow}>
            <TouchableOpacity
              style={styles.homeTile}
              onPress={handleFuelNavigation}
              activeOpacity={0.8}
            >
              <Text style={styles.tileEmoji}>{ENERGY_TILE_BY_FUEL[bike?.fuel_type || 'petrol']?.emoji || '⛽'}</Text>
              <Text style={styles.tileLabel}>{t(ENERGY_TILE_BY_FUEL[bike?.fuel_type || 'petrol']?.label || 'home.tile_fuel_motorcycle')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.homeTile}
              onPress={handleServiceNavigation}
              activeOpacity={0.8}
            >
              <Text style={styles.tileEmoji}>🔧</Text>
              <Text style={styles.tileLabel}>{t('home.tile_service_maintenance')}</Text>
            </TouchableOpacity>
          </View>

          {/* TILE ROW 2: FINANCIAL PERFORMANCE + SUBSCRIPTION */}
          <View style={styles.tileRow}>
            <TouchableOpacity
              style={styles.homeTile}
              onPress={handlePerformanceNavigation}
              activeOpacity={0.8}
            >
              <Text style={styles.tileEmoji}>📊</Text>
              <Text style={styles.tileLabel}>{t('home.tile_financial_performance')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.homeTile}
              onPress={handleSubscriptionNavigation}
              activeOpacity={0.8}
            >
              <Text style={styles.tileEmoji}>✨</Text>
              <Text style={styles.tileLabel}>{t('home.tile_my_subscription')}</Text>
            </TouchableOpacity>
          </View>

          {/* ✅ REQ-4.3: Subscription Status Card */}
          {subscription && (
            <View style={styles.cardContainer}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardStatusEmoji}>
                  {subscription.status === 'active' ? '✅' : '⏳'}
                </Text>
                <Text style={styles.cardTitle}>Subscription Status</Text>
                <View
                  style={[
                    styles.badge,
                    subscription.status === 'active'
                      ? styles.badgeGreen
                      : styles.badgeAmber,
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '600',
                      color:
                        subscription.status === 'active'
                          ? '#059669'
                          : '#d97706',
                    }}
                  >
                    {subscription.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardHint}>
                {subscription.status === 'active'
                  ? `Your subscription is active. Renewal date: ${new Date(
                      subscription.renewal_date
                    ).toLocaleDateString()}`
                  : subscription.status === 'pending'
                  ? 'Your subscription is pending payment verification'
                  : 'Please renew your subscription to continue using the app'}
              </Text>
            </View>
          )}

          {/* SETTINGS LIST */}
          <View style={styles.settingsListContainer}>
            <TouchableOpacity
              style={styles.settingsListItem}
              onPress={handleDailySummaryNavigation}
              activeOpacity={0.8}
            >
              <Text style={styles.settingsListLabel}>Daily Trade Summary</Text>
              <Text style={styles.settingsListArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsListItem}
              onPress={handleFinancialHistoryNavigation}
              activeOpacity={0.8}
            >
              <Text style={styles.settingsListLabel}>Financial History</Text>
              <Text style={styles.settingsListArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.settingsListItem, styles.settingsListItemLast]}
              onPress={handleLogout}
              activeOpacity={0.8}
            >
              <Text style={[styles.settingsListLabel, styles.logoutText]}>
                Logout
              </Text>
              <Text style={styles.settingsListArrow}>›</Text>
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
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    backgroundColor: '#f0ede8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 24,
  },
  brandName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1c20',
  },
  screenBody: {
    padding: 14,
  },
  heroFare: {
    backgroundColor: '#1a1c20',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
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