// rider-app/src/screens/HomeScreen.js
// ✅ REFACTORED: IndexedDB-first architecture (mirrors FuelHubScreen)
// ✅ SEAMLESS ONLINE/OFFLINE: Clean UI, no status banners
// ✅ UNIFIED ARCHITECTURE: Removed tripsRepository - uses only IndexedDB kvGet
// ✅ INSTANT HERO FARE UPDATES: Trip cache read directly from IndexedDB
// ✅ NETWORK AWARE: Graceful fallback when offline
// ✅ UI/UX: 100% preserved from original

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
      return 0;
    }
  }, []);

  /**
   * ✅ Load data from IndexedDB when riderId becomes available
   * Called once on component mount + on focus
   */
  const loadData = useCallback(async () => {
    if (!riderId) {
      console.warn('[HomeScreen] ⚠️ No riderId available');
      return;
    }

    if (hasLoadedRef.current) {
      console.log('[HomeScreen] Data already loaded this session');
      return;
    }

    console.log('[HomeScreen] 🔄 Loading data for rider:', riderId);
    setRefreshing(true);

    try {
      // Load bike profile
      const bikeData = await getActiveBikeProfile(riderId);
      setBike(bikeData || null);

      // Load account summary
      const accountData = await getRiderAccountSummary(riderId);
      setAccount(accountData || null);

      // Calculate today's total
      const todayData = await calculateTodaysTotal(riderId);
      setRunningTotal(todayData.total);
      setTripsToday(todayData.count);

      // Calculate yesterday's total
      const yesterdayData = await calculateYesterdaysTotal(riderId);
      setYesterdayTotal(yesterdayData);

      // Load queued records count
      const queued = await getQueuedRecords();
      setQueuedCount(queued.length);

      // Calculate hours since last sync
      const hours = await hoursSinceLastSync();
      setOfflineHours(hours);

      hasLoadedRef.current = true;
      setIsInitialized(true);
      console.log('[HomeScreen] ✅ Data loaded successfully');
    } catch (err) {
      console.error('[HomeScreen] Error loading data:', err);
      setHasError(true);
      setErrorMsg('Error loading home data: ' + err.message);
    } finally {
      setRefreshing(false);
    }
  }, [riderId, calculateTodaysTotal, calculateYesterdaysTotal]);

  // ✅ Load data when riderId is available
  useEffect(() => {
    if (riderId && !isInitialized) {
      loadData();
    }
  }, [riderId, isInitialized, loadData]);

  // ✅ Refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      if (riderId) {
        console.log('[HomeScreen] Screen focused - refreshing data');
        // Reset hasLoaded to force refresh
        hasLoadedRef.current = false;
        loadData();
      }
    }, [riderId, loadData])
  );

  // ✅ Handlers for navigation
  const handleDailyTradeSummary = () => {
    if (!navigation) {
      console.error('[HomeScreen] Navigation not available');
      return;
    }
    navigation.navigate('DailyTradeSummary');
  };

  const handleViewFinancialHistory = () => {
    if (!navigation) {
      console.error('[HomeScreen] Navigation not available');
      return;
    }
    navigation.navigate('FinancialHistory');
  };

  // ✅ Show loading state
  if (riderIdLoading || !isInitialized) {
    return (
      <HomeScreenErrorBoundary>
        <LoadingSkeleton />
      </HomeScreenErrorBoundary>
    );
  }

  // ✅ Show error state
  if (hasError) {
    return (
      <HomeScreenErrorBoundary>
        <ErrorDisplay error={errorMsg} onRetry={() => {
          setHasError(false);
          setErrorMsg(null);
          hasLoadedRef.current = false;
          loadData();
        }} />
      </HomeScreenErrorBoundary>
    );
  }

  return (
    <HomeScreenErrorBoundary>
      <ScrollView style={styles.container}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>🚕</Text>
            </View>
            <Text style={styles.brandName}>Smart Boda</Text>
          </View>
        </View>

        <View style={styles.screenBody}>
          {/* Row 0: Hero Fare Card */}
          <HeroFareCard riderId={riderId} />

          {/* Row 1: Yesterday's Total */}
          {yesterdayTotal !== null && (
            <View style={styles.yesterdayCard}>
              <View style={styles.yesterdayHeader}>
                <Text style={styles.yesterdayLabel}>📅 Yesterday</Text>
                <Text style={styles.yesterdayAmount}>
                  {typeof yesterdayTotal === 'number' ? `KES ${yesterdayTotal.toFixed(2)}` : 'KES 0.00'}
                </Text>
              </View>
              <TouchableOpacity onPress={handleViewFinancialHistory}>
                <Text style={styles.viewBreakdownLink}>View breakdown →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Row 2: Home Tiles Grid */}
          {bike && bike.fuelType && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                ℹ️ Your {bike.fuelType === 'petrol' ? 'fuel' : 'battery'} status is monitored. Keep it charged!
              </Text>
            </View>
          )}

          <View style={styles.energyTile}>
            <TouchableOpacity
              onPress={() => {
                const fuelType = bike?.fuelType || 'petrol';
                const route = ENERGY_TILE_BY_FUEL[fuelType]?.route || 'FuelHub';
                navigation.navigate(route);
              }}
              style={{ width: '100%' }}
            >
              <Text style={styles.tileEmoji}>
                {bike?.fuelType === 'electric' ? '🔋' : '⛽'}
              </Text>
              <Text style={styles.tileLabel}>
                {bike?.fuelType === 'electric' ? 'Charge Battery' : 'Fuel & Maintenance'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tileRow}>
            {HOME_TILES.slice(0, 2).map((tile, index) => (
              <TouchableOpacity
                key={index}
                style={styles.homeTile}
                onPress={() => navigation.navigate(tile.route)}
              >
                <Text style={styles.tileEmoji}>{tile.emoji}</Text>
                <Text style={styles.tileLabel}>{t(tile.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.tileRow}>
            {HOME_TILES.slice(2, 4).map((tile, index) => (
              <TouchableOpacity
                key={index}
                style={styles.homeTile}
                onPress={() => navigation.navigate(tile.route)}
              >
                <Text style={styles.tileEmoji}>{tile.emoji}</Text>
                <Text style={styles.tileLabel}>{t(tile.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.tileRow}>
            {HOME_TILES.slice(4, 6).map((tile, index) => (
              <TouchableOpacity
                key={index}
                style={styles.homeTile}
                onPress={() => navigation.navigate(tile.route)}
              >
                <Text style={styles.tileEmoji}>{tile.emoji}</Text>
                <Text style={styles.tileLabel}>{t(tile.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.tileRow}>
            {HOME_TILES.slice(6, 8).map((tile, index) => (
              <TouchableOpacity
                key={index}
                style={styles.homeTile}
                onPress={() => navigation.navigate(tile.route)}
              >
                <Text style={styles.tileEmoji}>{tile.emoji}</Text>
                <Text style={styles.tileLabel}>{t(tile.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.homeTile, styles.fullWidth]}
            onPress={() => navigation.navigate(HOME_TILES[8].route)}
          >
            <Text style={styles.tileEmoji}>{HOME_TILES[8].emoji}</Text>
            <Text style={styles.tileLabel}>{t(HOME_TILES[8].label)}</Text>
          </TouchableOpacity>

          {/* Row 3: Sync Status Card (Clickable) */}
          <TouchableOpacity 
            style={styles.cardContainer}
            onPress={() => navigation.navigate('SyncStatus')}
            activeOpacity={0.7}
          >
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardStatusEmoji}>
                {queuedCount > 0 ? '🟠' : '🟢'}
              </Text>
              <Text style={styles.cardTitle}>Sync Status</Text>
              <View style={[
                styles.badge,
                queuedCount > 0 ? styles.badgeAmber : styles.badgeGreen
              ]}>
                <Text style={styles.badgeText}>
                  {queuedCount > 0 ? `Queued: ${queuedCount}` : 'All Synced'}
                </Text>
              </View>
            </View>
            <Text style={styles.cardHint}>
              {queuedCount > 0 ? 'Tap to view queue and retry.' : 'Everything is safely backed up.'}
            </Text>
          </TouchableOpacity>
          

          {/* Account Card */}
          <View style={styles.cardContainer}>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Trips today</Text>
              <Text style={styles.kvValue}>{tripsToday}</Text>
            </View>
          </View>
          
          
          
          {/* Settings List Items */}
          <View style={styles.settingsListContainer}>
            <TouchableOpacity 
              style={styles.settingsListItem}
              onPress={handleDailyTradeSummary}
            >
              <Text style={styles.settingsListLabel}>📊 My Daily Trade Summary</Text>
              <Text style={styles.settingsListArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.settingsListItem}
              onPress={handleViewFinancialHistory}
            >
              <Text style={styles.settingsListLabel}>📈 My Financial History & Statements</Text>
              <Text style={styles.settingsListArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.settingsListItem, styles.logoutListItem]}
              onPress={() => navigation.navigate('PinLogin')}
            >
              <Text style={[styles.settingsListLabel, styles.logoutText]}>🚪 Logout</Text>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#f6f4ef',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e0453f',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
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