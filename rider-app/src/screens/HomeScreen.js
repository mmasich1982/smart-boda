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
      } else {
        console.warn('[HomeScreen] No active bike profile found - using default');
        setBike(null);
      }

      const accountSummary = await getRiderAccountSummary();
      if (accountSummary) {
        setAccount(accountSummary);
      } else {
        console.warn('[HomeScreen] No account summary found - using defaults');
        setAccount(null);
      }

      // ✅ Load today's total from IndexedDB trip cache (fuel pattern)
      const todayData = await calculateTodaysTotal(riderId);
      setRunningTotal(todayData.total);
      setTripsToday(todayData.count);

      // ✅ Load yesterday's total from IndexedDB trip cache
      const yest = await calculateYesterdaysTotal(riderId);
      setYesterdayTotal(yest);

      const queued = await getQueuedRecords();
      setQueuedCount(queued?.length || 0);

      const hours = await hoursSinceLastSync();
      setOfflineHours(Math.floor(hours) || 0);

      if (!isInitialized) {
        setIsInitialized(true);
      }

      console.log('[HomeScreen] ✅ Refresh completed:', {
        runningTotal: todayData.total,
        tripsToday: todayData.count,
        yesterdayTotal: yest,
      });
    } catch (err) {
      console.error('[HomeScreen] Refresh error:', err);
      setHasError(true);
      setErrorMsg(err.message || 'Error loading home screen');
      showToast('Error loading home screen', 'error');
      if (!isInitialized) {
        setIsInitialized(true);
      }
    } finally {
      setRefreshing(false);
    }
  }, [riderId, isInitialized, showToast, calculateTodaysTotal, calculateYesterdaysTotal]);

  // ✅ Load data on mount
  useEffect(() => {
    if (!riderIdLoading && riderId && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      refresh();
    }
  }, [riderIdLoading, riderId, refresh]);

  // ✅ CRITICAL: Auto-refresh when returning to HomeScreen
  // Always refresh on focus to ensure Hero Fare Card reflects new trips
  useFocusEffect(
    useCallback(() => {
      if (!riderIdLoading && riderId && hasLoadedRef.current) {
        console.log('[HomeScreen] 🔄 Refreshing on focus');
        refresh();
      }
    }, [riderIdLoading, riderId, refresh])
  );

  const handleRecordTrip = useCallback(() => {
    if (navigation && navigation.navigate) {
      navigation.navigate('NewTrip');
    }
  }, [navigation]);
  
  
  const handleDailyTradeSummary = useCallback(() => {
    if (navigation && navigation.navigate) {
      navigation.navigate('DailyTradeSummary');
    }
  }, [navigation]);

  const handleLogout = useCallback(async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Logout',
        onPress: async () => {
          try {
            await clearSession();
            if (navigation && navigation.reset) {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            }
          } catch (err) {
            console.error('Logout error:', err);
            showToast('Error logging out', 'error');
          }
        },
      },
    ]);
  }, [navigation, showToast]);

  const handleNavigateTile = useCallback((route) => {
    if (navigation && navigation.navigate) {
      navigation.navigate(route);
    }
  }, [navigation]);

  if (riderIdLoading || !isInitialized) {
    return <LoadingSkeleton />;
  }

  if (hasError) {
    return (
      <ErrorDisplay
        error={errorMsg}
        onRetry={() => {
          setHasError(false);
          setErrorMsg(null);
          if (riderId) {
            refresh();
          }
        }}
      />
    );
  }

  const handleViewFinancialHistory = () => {
    navigation.navigate('FinancialHistory');
  };
  
  const energyTile = bike?.fuel_type_code ? ENERGY_TILE_BY_FUEL[bike.fuel_type_code] : null;

  return (
    <HomeScreenErrorBoundary onRetry={() => refresh()}>
      <ScrollView style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>🚕</Text>
            </View>
            <Text style={styles.brandName}>Smart Boda</Text>
          </View>
          <TouchableOpacity
            style={styles.notifBell}
            onPress={() => handleNavigateTile('Notifications')}
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
          {/* ✅ HERO FARE CARD - Updates instantly when trip is recorded */}
          <HeroFareCard
            totalFare={runningTotal}
            onOpenDailySummary={handleDailyTradeSummary}
            onNewTrip={handleRecordTrip}
          />

          {/* Yesterday's Total */}
          {yesterdayTotal !== null && (
            <View style={styles.yesterdayCard}>
              <View style={styles.yesterdayHeader}>
                <Text style={styles.yesterdayLabel}>Yesterday's Total</Text>
                <TouchableOpacity onPress={handleDailyTradeSummary}>
                  <Text style={styles.viewBreakdownLink}>View →</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.yesterdayAmount}>KSh {(yesterdayTotal || 0).toLocaleString()}</Text>
            </View>
          )}

          {/* Offline Warning */}
          {offlineHours > 0 && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                📡 Last sync {offlineHours} hour{offlineHours === 1 ? '' : 's'} ago
              </Text>
            </View>
          )}

          {/* Tiles Grid - Aligned with cleaned.html */}
          {/* Row 1: Fuel/Charge + Service */}
          <View style={styles.tileRow}>
            {energyTile && (
              <TouchableOpacity
                style={styles.homeTile}
                onPress={() => {
                  try {
                    // Try direct navigation first (MainNavigator context)
                    navigation.navigate(energyTile.route);
                  } catch (err) {
                    console.error('[HomeScreen] Navigation error:', err);
                    // Fallback: try navigating through parent if nested
                    try {
                      navigation.navigate('Home', { screen: energyTile.route });
                    } catch (fallbackErr) {
                      console.error('[HomeScreen] Fallback navigation failed:', fallbackErr);
                    }
                  }
                }}
              >
                <Text style={styles.tileEmoji}>{energyTile.emoji}</Text>
                <Text style={styles.tileLabel}>{t(energyTile.label)}</Text>
              </TouchableOpacity>
            )}

          <TouchableOpacity
              style={styles.homeTile}
              onPress={() => {
                console.log('[HomeScreen] Navigating to MaintenanceHub');
                try {
                  navigation.navigate('MaintenanceHub');
                } catch (err) {
                  console.error('[HomeScreen] MaintenanceHub navigation error:', err);
                  showToast('Navigation failed', 'error');
                }
              }}
            >
              <Text style={styles.tileEmoji}>🔧</Text>
              <Text style={styles.tileLabel}>{t('home.tile_service_motorcycle')}</Text>
            </TouchableOpacity>
          </View>

          {/* Row 2: Financial Performance + My Subscription */}
          <View style={styles.tileRow}>
            <TouchableOpacity
              style={styles.homeTile}
              onPress={() => navigation.navigate('MoneyMastery')}
            >
              <Text style={styles.tileEmoji}>💰</Text>
              <Text style={styles.tileLabel}>{t('home.tile_financial_performance')}</Text>
            </TouchableOpacity>
          
            <TouchableOpacity
              style={styles.homeTile}
              onPress={() => navigation.navigate('MySubscriptions')}
            >
              <Text style={styles.tileEmoji}>📲</Text>
              <Text style={styles.tileLabel}>{t('home.tile_my_subscription')}</Text>
            </TouchableOpacity>
          </View>

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
});