// rider-app/src/screens/HomeScreen.js
// ✅ REFACTORED: IndexedDB-first architecture (mirrors FuelHubScreen)
// ✅ SEAMLESS ONLINE/OFFLINE: Clean UI, no status banners
// ✅ UNIFIED ARCHITECTURE: Removed tripsRepository - uses only IndexedDB kvGet
// ✅ INSTANT HERO FARE UPDATES: Trip cache read directly from IndexedDB
// ✅ NETWORK AWARE: Graceful fallback when offline
// ✅ UI/UX: 100% preserved from original
// ✅ NEW (26 AUG 2026): Subscription lock enforcement - auto-redirect to AccountLockedScreen on expiry

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Linking, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from '../i18n/LocalizationProvider';
import { useToast } from '../components/Toast';
import { getQueuedRecords, hoursSinceLastSync } from '../offline/syncQueue';
import { getActiveBikeProfile, getRiderAccountSummary, clearSession, getLocalRiderId } from '../offline/db';
import indexedDbAdapter from '../offline/adapters/indexedDbAdapter';
import HeroFareCard from '../components/HeroFareCard';
// ✅ NEW IMPORT: Subscription Banners
import SubscriptionBanners from '../components/SubscriptionBanners';
// ✅ NEW IMPORT: Subscription lock enforcement
import { checkAndEnforceLock, ensureFreeTrial } from '../offline/subscriptionUtils';

const ENERGY_TILE_BY_FUEL = {
  petrol: { emoji: '⛽', label: 'home.tile_fuel_motorcycle', route: 'FuelHub' },
  electric: { emoji: '🔋', label: 'home.tile_charge_battery', route: 'ChargeBatteryHub' },
};

const HOME_TILES = [
  { emoji: '🔧', label: 'home.tile_service_motorcycle', route: 'MaintenanceHub' },
  { emoji: '💰', label: 'home.tile_financial_performance', route: 'MoneyMastery' },
  { emoji: '🎯', label: 'home.tile_revenue_targets', route: 'RevenueTargets' },
  { emoji: '📋', label: 'home.tile_license_insurance', route: 'ComplianceDashboard' },
  { emoji: '🐖', label: 'home.tile_savings', route: 'SavingsHub' },
  { emoji: '🧾', label: 'home.tile_lipa_later_report', route: 'PaymentSummary' },
  { emoji: '🏡', label: 'home.tile_send_money_home', route: 'SendMoneyHome' },
  { emoji: '🏆', label: 'home.tile_my_goals', route: 'Goals' },
  { emoji: '💡', label: 'home.tile_suggestions_feedback', route: 'SuggestionsFeedback' },
  { emoji: '📲', label: 'home.tile_my_subscription', route: 'Subscription' },
  
  
  
];

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

export default function HomeScreen({ navigation: passedNavigation, route }) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  // Use useNavigation hook as primary source, fall back to passed prop
  const hookNavigation = useNavigation();
  const navigation = hookNavigation || passedNavigation;

  useEffect(() => {
    console.log('[HomeScreen] Mounted - using navigation from:', hookNavigation ? 'hook' : 'passed prop');
    console.log('[HomeScreen] Navigation available:', !!navigation);
    if (navigation?.getState) {
      const state = navigation.getState();
      console.log('[HomeScreen] Navigation state routes:', state?.routes?.map(r => r.name));
    }
  }, [navigation, hookNavigation]);

  const [isInitialized, setIsInitialized] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [riderId, setRiderId] = useState(null);
  const [riderIdLoading, setRiderIdLoading] = useState(true);

  // ✅ NEW: Lock enforcement state
  const [lockCheckInProgress, setLockCheckInProgress] = useState(false);
  const [isAccountLocked, setIsAccountLocked] = useState(false);

  const [runningTotal, setRunningTotal] = useState(0);
  const [yesterdayTotal, setYesterdayTotal] = useState(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [bike, setBike] = useState(null);
  const [account, setAccount] = useState(null);
  const [tripsToday, setTripsToday] = useState(0);
  const [offlineHours, setOfflineHours] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // ✅ Track if data has been loaded on mount
  const hasLoadedRef = useRef(false);

  // ✅ NEW: Track if lock check has been performed
  const lockCheckPerformedRef = useRef(false);

  // ✅ Load riderId on mount
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setRiderId(id);
          console.log('[HomeScreen] ✅ Loaded rider ID:', id);
        } else {
          console.warn('[HomeScreen] ⚠️ No rider ID found');
          setHasError(true);
          setErrorMsg('Unable to load rider information');
        }
      } catch (err) {
        console.error('[HomeScreen] Error loading rider ID:', err);
        setHasError(true);
        setErrorMsg('Error loading rider information: ' + err.message);
      } finally {
        setRiderIdLoading(false);
      }
    };

    loadRiderId();
  }, []);

  // ✅ NEW: CHECK AND ENFORCE LOCK ON SCREEN FOCUS
  // This runs when screen comes into focus, after riderId is loaded
  useFocusEffect(
    useCallback(() => {
      const checkLockStatus = async () => {
        // Only check once per screen load
        if (lockCheckPerformedRef.current || !riderId) {
          console.log('[HomeScreen] Lock check skipped:', {
            alreadyPerformed: lockCheckPerformedRef.current,
            riderIdMissing: !riderId
          });
          return;
        }

        try {
          setLockCheckInProgress(true);
          console.log('🔍 [HomeScreen] Checking subscription lock status for rider:', riderId);

          // ✅ 1. Initialize free trial for new riders
          console.log('[HomeScreen] Ensuring free trial initialized...');
          await ensureFreeTrial(riderId);

          // ✅ 2. Check and enforce lock
          console.log('[HomeScreen] Checking for account lock...');
          const lockResult = await checkAndEnforceLock(riderId);

          if (lockResult.isLocked) {
            console.log('🔒 [HomeScreen] ACCOUNT LOCKED - Redirecting to AccountLockedScreen', {
              reason: lockResult.reason,
              lockedSince: lockResult.lockedSince,
              justLocked: lockResult.justLocked
            });

            setIsAccountLocked(true);
            lockCheckPerformedRef.current = true;

            // ✅ CRITICAL: Navigate to AccountLockedScreen
            if (navigation) {
              navigation.replace('AccountLockedScreen');
              console.log('✅ [HomeScreen] Navigation to AccountLockedScreen initiated');
            } else {
              console.error('❌ [HomeScreen] Navigation not available for lock redirect');
              setHasError(true);
              setErrorMsg('Account locked. Unable to navigate to unlock screen.');
            }
          } else {
            console.log('✅ [HomeScreen] Account NOT locked - Proceeding with normal Home Screen');
            setIsAccountLocked(false);
            lockCheckPerformedRef.current = true;
            // Allow normal initialization to proceed
          }
        } catch (err) {
          console.error('❌ [HomeScreen] Error checking lock status:', err);
          // On error, fail-safe: allow access (don't block)
          console.log('[HomeScreen] Fail-safe: Allowing access despite lock check error');
          setIsAccountLocked(false);
          lockCheckPerformedRef.current = true;
        } finally {
          setLockCheckInProgress(false);
        }
      };

      // Execute lock check
      checkLockStatus();

      // Cleanup (prevent re-running)
      return () => {
        // Lock check performed flag persists
      };
    }, [riderId, navigation])
  );

  /**
   * ✅ Calculate today's total from trip cache
   * Mirrors DailyTradeSummaryScreen logic but for display purposes
   */
  const calculateTodaysTotal = useCallback(async (riderIdParam) => {
    try {
      const cacheKey = `trip_history_${riderIdParam}`;
      const cachedData = await indexedDbAdapter.kvGet(cacheKey);

      let items = [];
      if (cachedData) {
        try {
          items = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
          if (!Array.isArray(items)) items = [];
        } catch (parseErr) {
          console.warn('⚠️ Cache parse error');
          items = [];
        }
      }

      // Filter to today's active trips
      const today = new Date().toDateString();
      const todaysActiveTrips = items.filter(t => {
        const tripDate = new Date(t.ts || t.timestamp || 0).toDateString();
        return t.status === 'active' && tripDate === today;
      });

      // Calculate realized income (same logic as DailyTradeSummary)
      let total = 0;
      todaysActiveTrips.forEach(trip => {
        const method = trip.paymentMethod || trip.method;
        if (method === 'LipaLater') {
          // Only count if settled today
          if (trip.lipaLater?.settled) {
            const paymentDate = trip.lipaLater.paymentDate
              ? new Date(trip.lipaLater.paymentDate).toDateString()
              : null;
            if (paymentDate === today) {
              total += trip.amount || 0;
            }
          }
        } else {
          // Cash/M-Pesa: count on trip date
          total += trip.amount || 0;
        }
      });

      return { total, count: todaysActiveTrips.length };
    } catch (err) {
      console.error('[HomeScreen] Error calculating total:', err);
      return { total: 0, count: 0 };
    }
  }, []);

  /**
   * ✅ Calculate yesterday's total from trip cache
   * Reads all trips from cache and sums yesterday's amounts
   */
  const calculateYesterdaysTotal = useCallback(async (riderIdParam) => {
    try {
      const cacheKey = `trip_history_${riderIdParam}`;
      const cachedData = await indexedDbAdapter.kvGet(cacheKey);

      let items = [];
      if (cachedData) {
        try {
          items = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
          if (!Array.isArray(items)) items = [];
        } catch (parseErr) {
          console.warn('⚠️ Cache parse error');
          items = [];
        }
      }

      // Filter to yesterday's active trips
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = yesterday.toDateString();

      const yesterdaysActiveTrips = items.filter(t => {
        const tripDate = new Date(t.ts || t.timestamp || 0).toDateString();
        return t.status === 'active' && tripDate === yesterdayString;
      });

      // Calculate total for yesterday
      let total = 0;
      yesterdaysActiveTrips.forEach(trip => {
        const method = trip.paymentMethod || trip.method;
        if (method === 'LipaLater') {
          // Only count if settled
          if (trip.lipaLater?.settled) {
            total += trip.amount || 0;
          }
        } else {
          total += trip.amount || 0;
        }
      });

      return total;
    } catch (err) {
      console.error('[HomeScreen] Error calculating yesterday total:', err);
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      // ✅ Guard: Can't refresh without riderId
      if (!riderId) {
        console.warn('[HomeScreen] Cannot refresh - no riderId');
        return;
      }

      setRefreshing(true);
      setHasError(false);
      setErrorMsg(null);

      const activeBike = await getActiveBikeProfile();
      if (activeBike) {
        setBike(activeBike);
        console.log('[HomeScreen] ✅ Loaded active bike:', activeBike.id);
      }

      const accountData = await getRiderAccountSummary();
      if (accountData) {
        setAccount(accountData);
        console.log('[HomeScreen] ✅ Loaded account summary');
      }

      const { total, count } = await calculateTodaysTotal(riderId);
      setRunningTotal(total);
      setTripsToday(count);
      console.log('[HomeScreen] ✅ Calculated today total:', total);

      const yesterday = await calculateYesterdaysTotal(riderId);
      setYesterdayTotal(yesterday);
      console.log('[HomeScreen] ✅ Calculated yesterday total:', yesterday);

      const queued = await getQueuedRecords();
      setQueuedCount(queued.length);

      const hours = await hoursSinceLastSync();
      setOfflineHours(hours);

      setIsInitialized(true);
    } catch (err) {
      console.error('[HomeScreen] Error during refresh:', err);
      setHasError(true);
      setErrorMsg(err.message || 'Failed to load home screen data');
    } finally {
      setRefreshing(false);
    }
  }, [riderId, calculateTodaysTotal, calculateYesterdaysTotal]);

  // ✅ Main data loading effect
  // Only load if: riderId available, not already loaded, lock check done, and not locked
  useFocusEffect(
    useCallback(() => {
      // Only load if ready and not already loaded
      if (
        !hasLoadedRef.current &&
        riderId &&
        !riderIdLoading &&
        lockCheckPerformedRef.current &&
        !isAccountLocked
      ) {
        console.log('[HomeScreen] Screen focused - loading data');
        hasLoadedRef.current = true;
        refresh();
      }

      return () => {
        // Keep loaded state on unfocus
      };
    }, [riderId, riderIdLoading, isAccountLocked, refresh])
  );

  // ✅ Show loading skeleton while checking lock
  if (lockCheckInProgress || riderIdLoading) {
    return <LoadingSkeleton />;
  }

  // ✅ CRITICAL: If account is locked, don't show Home Screen
  // Navigation to AccountLockedScreen will handle display
  if (isAccountLocked) {
    console.log('[HomeScreen] Rendering locked state (navigation should redirect)');
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#ff7a1a" />
        <Text style={{ marginTop: 12, color: '#5b606c' }}>Redirecting...</Text>
      </View>
    );
  }

  // ✅ Show error if present
  if (hasError) {
    return (
      <HomeScreenErrorBoundary>
        <ErrorDisplay
          error={errorMsg}
          onRetry={() => {
            setHasError(false);
            setErrorMsg(null);
            hasLoadedRef.current = false;
            if (riderId) {
              refresh();
            }
          }}
        />
      </HomeScreenErrorBoundary>
    );
  }

  // ✅ Show loading if not initialized yet
  if (!isInitialized) {
    return <LoadingSkeleton />;
  }

  // ✅ NORMAL HOME SCREEN RENDERING (UI UNCHANGED)
  return (
    <HomeScreenErrorBoundary>
      <ScrollView style={styles.container} refreshing={refreshing} onRefresh={refresh}>
        {/* TOP BAR - UNCHANGED */}
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>🚕</Text>
            </View>
            <Text style={styles.brandName}>Smart Boda</Text>
          </View>
          <TouchableOpacity
            style={styles.notifBell}
            onPress={() => {
              console.log('[HomeScreen] Notification bell tapped');
            }}
          >
            <Text style={styles.bellIcon}>🔔</Text>
            {queuedCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.badgeText}>{Math.min(queuedCount, 9)}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.screenBody}>
          {/* HERO FARE CARD */}
          {bike && (
            <HeroFareCard
              bikeProfile={bike}
              runnningTotal={runningTotal}
              tripsToday={tripsToday}
              onTripsTap={() => navigation.navigate('DailyTradeSummary')}
            />
          )}

          {/* ✅ NEW: SUBSCRIPTION BANNERS (below hero card) */}
          <SubscriptionBanners navigation={navigation} />

          {/* YESTERDAY'S EARNINGS */}
          {yesterdayTotal !== null && (
            <View style={styles.yesterdayCard}>
              <View style={styles.yesterdayHeader}>
                <Text style={styles.yesterdayLabel}>📊 Yesterday's Earnings</Text>
                <TouchableOpacity onPress={() => navigation.navigate('DailyTradeSummary')}>
                  <Text style={styles.viewBreakdownLink}>View breakdown →</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.yesterdayAmount}>KSh {Math.round(yesterdayTotal).toLocaleString()}</Text>
            </View>
          )}

          {/* ENERGY TILE (based on bike fuel type) */}
          {bike?.fuelType && ENERGY_TILE_BY_FUEL[bike.fuelType] && (
            <TouchableOpacity
              style={styles.energyTile}
              onPress={() => navigation.navigate(ENERGY_TILE_BY_FUEL[bike.fuelType].route, { bikeProfile: bike })}
              activeOpacity={0.7}
            >
              <Text style={styles.tileEmoji}>{ENERGY_TILE_BY_FUEL[bike.fuelType].emoji}</Text>
              <Text style={styles.tileLabel}>
                {t(ENERGY_TILE_BY_FUEL[bike.fuelType].label) || ENERGY_TILE_BY_FUEL[bike.fuelType].label}
              </Text>
            </TouchableOpacity>
          )}

          {/* HOME TILES GRID */}
          <View style={styles.tileRow}>
            {HOME_TILES.slice(0, 2).map((tile, i) => (
              <TouchableOpacity
                key={i}
                style={styles.homeTile}
                onPress={() => navigation.navigate(tile.route)}
                activeOpacity={0.7}
              >
                <Text style={styles.tileEmoji}>{tile.emoji}</Text>
                <Text style={styles.tileLabel}>{t(tile.label) || tile.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.tileRow}>
            {HOME_TILES.slice(2, 4).map((tile, i) => (
              <TouchableOpacity
                key={i}
                style={styles.homeTile}
                onPress={() => navigation.navigate(tile.route)}
                activeOpacity={0.7}
              >
                <Text style={styles.tileEmoji}>{tile.emoji}</Text>
                <Text style={styles.tileLabel}>{t(tile.label) || tile.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.tileRow}>
            {HOME_TILES.slice(4, 6).map((tile, i) => (
              <TouchableOpacity
                key={i}
                style={styles.homeTile}
                onPress={() => navigation.navigate(tile.route)}
                activeOpacity={0.7}
              >
                <Text style={styles.tileEmoji}>{tile.emoji}</Text>
                <Text style={styles.tileLabel}>{t(tile.label) || tile.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.tileRow}>
            {HOME_TILES.slice(6, 8).map((tile, i) => (
              <TouchableOpacity
                key={i}
                style={styles.homeTile}
                onPress={() => navigation.navigate(tile.route)}
                activeOpacity={0.7}
              >
                <Text style={styles.tileEmoji}>{tile.emoji}</Text>
                <Text style={styles.tileLabel}>{t(tile.label) || tile.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.tileRow}>
            {HOME_TILES.slice(8, 10).map((tile, i) => (
              <TouchableOpacity
                key={i}
                style={styles.homeTile}
                onPress={() => navigation.navigate(tile.route)}
                activeOpacity={0.7}
              >
                <Text style={styles.tileEmoji}>{tile.emoji}</Text>
                <Text style={styles.tileLabel}>{t(tile.label) || tile.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* SETTINGS SECTION */}
          <View style={styles.settingsRow}>
            <View style={styles.settingsListContainer}>
              <TouchableOpacity
                style={styles.settingsListItem}
                onPress={() => navigation.navigate('Settings')}
                activeOpacity={0.6}
              >
                <Text style={styles.settingsListLabel}>⚙️ Settings</Text>
                <Text style={styles.settingsListArrow}>→</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.settingsListItem}
                onPress={() => navigation.navigate('ProfileScreen')}
                activeOpacity={0.6}
              >
                <Text style={styles.settingsListLabel}>👤 My Profile</Text>
                <Text style={styles.settingsListArrow}>→</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.settingsListItem, styles.logoutListItem]}
                onPress={() => {
                  Alert.alert('Logout', 'Are you sure you want to logout?', [
                    { text: 'Cancel', onPress: () => {}, style: 'cancel' },
                    {
                      text: 'Logout',
                      onPress: async () => {
                        try {
                          await clearSession();
                          navigation.replace('PinLogin');
                        } catch (err) {
                          console.error('Error logging out:', err);
                          showToast('Error logging out', 'error');
                        }
                      },
                      style: 'destructive',
                    },
                  ]);
                }}
                activeOpacity={0.6}
              >
                <Text style={[styles.settingsListLabel, styles.logoutText]}>🚪 Logout</Text>
                <Text style={styles.settingsListArrow}>→</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* SYNC STATUS INFO */}
          {offlineHours > 0 && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                📴 {offlineHours} hour{offlineHours !== 1 ? 's' : ''} since last sync
              </Text>
            </View>
          )}
          
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
  errorContainer: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#d32f2f',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#ff7a1a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ff7a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 16,
  },
  brandName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
  },
  notifBell: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellIcon: {
    fontSize: 20,
  },
  notifBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ff7a1a',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  screenBody: {
    padding: 20,
  },
  energyTile: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    alignItems: 'center',
  },
  yesterdayCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e7e4db',
  },
  yesterdayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  warningText: {
    color: '#e65100',
    fontSize: 12,
    fontWeight: '500',
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
  fullWidth: {
    flex: 1,
  },
  logoutTile: {
    backgroundColor: '#fce4e1',
    borderColor: '#e0453f',
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
  settingsRow: {
    gap: 12,
    marginBottom: 20,
  },
  skeleton: {
    backgroundColor: '#e0e0e0',
    opacity: 0.5,
  },
  skeletonGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  heroFare: {
    height: 140,
  },
  cardContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e7e4db',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  cardStatusEmoji: {
    fontSize: 18,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1c20',
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeAmber: {
    backgroundColor: '#fff3e0',
  },
  badgeGreen: {
    backgroundColor: '#e8f5e9',
  },
  cardHint: {
    fontSize: 12,
    color: '#5b606c',
    marginLeft: 30,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kvKey: {
    fontSize: 13,
    color: '#5b606c',
    fontWeight: '500',
  },
  kvValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
  },
  settingsListContainer: {
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  logoutListItem: {
    borderBottomWidth: 0,
  },
  settingsListLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1c20',
  },
  logoutText: {
    color: '#e0453f',
    fontWeight: '600',
  },
  settingsListArrow: {
    fontSize: 16,
    color: '#5b606c',
  },
});